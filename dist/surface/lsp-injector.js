// @bun
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: true
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};
var __require = import.meta.require;

// src/shared/knowledge-graph/db.ts
import fs from "fs";
import path from "path";
import { Database } from "bun:sqlite";
import { createHash } from "crypto";

// src/audit-engine/shadow/shadow-store.ts
var SHADOW_VERDICTS_DDL = `CREATE TABLE IF NOT EXISTS shadow_verdicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  finding_index INTEGER NOT NULL,
  adjudication TEXT NOT NULL CHECK (adjudication IN ('TRUE_POSITIVE','RED_HERRING','UNCLEAR')),
  deeper_root TEXT NOT NULL,
  concrete_fix TEXT NOT NULL,
  consequence_rank INTEGER NOT NULL CHECK (consequence_rank BETWEEN 1 AND 4),
  verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  CHECK (finding_index >= 0)
);`;

// src/audit-engine/events/event-ledger.ts
var EVENT_LEDGER_DDL = `
CREATE TABLE IF NOT EXISTS event_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  class_name TEXT NOT NULL,
  triad_pattern TEXT NOT NULL,
  triad_state TEXT NOT NULL,
  triad_evidence TEXT NOT NULL,
  action TEXT,
  demand TEXT
);
`;

// src/shared/knowledge-graph/db.ts
function lineageMissing(id) {
  return new Error(`LINEAGE_MISSING: id=${id} (the SPEC_DERIVED/CODE_DERIVED/HYBRID duality cannot degrade - O28.4)`);
}
function findingNoTriplet(detail) {
  return new Error(`FINDING_NO_TRIPLET: ${detail} (no triplet = no finding - a non-empty evidence string is mandatory - O9.1)`);
}
function findingInvalid(field, value) {
  return new Error(`FINDING_INVALID: field=${field} value=${JSON.stringify(value)} (the severity canon is CRIT|HIGH|MED|WARN; the verdict is VIOLATION|PASS - fix the finding)`);
}
function eventInvalid(kind) {
  return new Error(`EVENT_INVALID: kind=${JSON.stringify(kind)} (the bus kinds are HUNT_DONE|BUILD_DONE|AUDIT_DONE - fix the event)`);
}
function implementationInvalid(field, value) {
  return new Error(`IMPLEMENTATION_INVALID: field=${field} value=${JSON.stringify(value)} (the status canon is PENDING|CHANGED|UNCHANGED|VERIFIED|REJECTED - fix the row)`);
}
function verdictInvalid(field, value) {
  return new Error(`VERDICT_INVALID: field=${field} value=${JSON.stringify(value)} (the verdict canon is CONFORMANT|VIOLATED|PARTIAL - fix the row)`);
}
function mirrorWriteFailed(mirrorPath, detail) {
  return new Error(`MIRROR_WRITE_FAILED: path=${mirrorPath} detail=${detail} (the MASTER_CONTEXT mirror is the awareness surface, not the truth - the .trident shared.db is the truth - D27)`);
}
function pragmaFailed(pragma, detail) {
  return new Error(`PRAGMA_FAILED: pragma=${pragma} detail=${detail} (a pragma exec failure is a loud named error - a database-is-locked on open must name the driver + the pragma, never surface as a raw sqlite throw - the store's fail-closed contract)`);
}
function familyRootReadonly(detail) {
  return new Error(`FAMILY_ROOT_READONLY: detail=${detail} (the family store is READ-ONLY mode=ro \u2014 a branch writes its own shared.db only)`);
}
function familyRootDrift(expected, actual) {
  return new Error(`FAMILY_ROOT_DRIFT: expected=${expected} actual=${actual} (the core drifted from the profile contract hash \u2014 reload the profile or re-seal the core)`);
}
function familyPromotionPending(hash, detail) {
  return new Error(`FAMILY_PROMOTION_PENDING: hash=${hash} detail=${detail} (a new file awaits the operator gate \u2014 never auto-promoted)`);
}
var SEVERITIES = ["CRIT", "HIGH", "MED", "WARN"];
var EVENT_KINDS = ["HUNT_DONE", "BUILD_DONE", "AUDIT_DONE"];
var IMPLEMENTATION_STATUSES = ["PENDING", "CHANGED", "UNCHANGED", "VERIFIED", "REJECTED"];
var CONFORMANCE_VERDICTS = ["CONFORMANT", "VIOLATED", "PARTIAL"];
var FINDING_VERDICTS = ["VIOLATION", "PASS"];
var CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS graph_nodes (
  id        TEXT PRIMARY KEY,
  kind      TEXT NOT NULL,
  name      TEXT NOT NULL,
  file      TEXT,
  line      INTEGER,
  lineage   TEXT NOT NULL,
  source    TEXT NOT NULL,
  data      TEXT
);
CREATE TABLE IF NOT EXISTS graph_edges (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id  TEXT NOT NULL REFERENCES graph_nodes(id),
  target_id  TEXT NOT NULL REFERENCES graph_nodes(id),
  kind       TEXT NOT NULL,
  lineage    TEXT NOT NULL,
  created_at INTEGER
);
CREATE TABLE IF NOT EXISTS findings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id     TEXT NOT NULL,
  severity    TEXT NOT NULL,
  file        TEXT,
  line        INTEGER,
  range_start INTEGER,
  range_end   INTEGER,
  evidence    TEXT NOT NULL,
  verdict     TEXT NOT NULL,
  week        TEXT,
  run_id      TEXT NOT NULL,
  created_at  INTEGER
);
CREATE TABLE IF NOT EXISTS report_sections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  finding_id  TEXT NOT NULL,
  how_broken  TEXT NOT NULL,
  why_broken  TEXT NOT NULL,
  what_violates TEXT NOT NULL,
  how_to_fix  TEXT NOT NULL,
  what_to_do  TEXT NOT NULL,
  why_works   TEXT NOT NULL,
  run_id      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS implementations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  file       TEXT NOT NULL,
  before_sha TEXT NOT NULL,
  after_sha  TEXT NOT NULL,
  claim      TEXT NOT NULL,
  status     TEXT NOT NULL,
  run_id     TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conformance_verdicts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  finding_id TEXT NOT NULL,
  verdict    TEXT NOT NULL,
  evidence   TEXT NOT NULL,
  fixed_at   INTEGER,
  fixed_by   TEXT NOT NULL,
  run_id     TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,
  payload    TEXT NOT NULL,
  created_at INTEGER
);
CREATE TABLE IF NOT EXISTS compiled_predicates (
  id         TEXT PRIMARY KEY,
  family     TEXT NOT NULL,
  template   TEXT NOT NULL,
  bindings   TEXT NOT NULL,
  verbatim_quote TEXT NOT NULL,
  anchor     TEXT NOT NULL,
  severity   TEXT NOT NULL,
  check_code TEXT NOT NULL,
  battery_version TEXT NOT NULL,
  calibrated TEXT NOT NULL DEFAULT 'PENDING'
);
CREATE TABLE IF NOT EXISTS calibrations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  predicate_id   TEXT NOT NULL,
  test           TEXT NOT NULL,
  fixture        TEXT NOT NULL,
  result         TEXT NOT NULL,
  evidence       TEXT NOT NULL,
  run_id         TEXT NOT NULL,
  created_at     INTEGER
);
CREATE TABLE IF NOT EXISTS rule_cards (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  quote      TEXT NOT NULL,
  anchor     TEXT NOT NULL,
  classification TEXT NOT NULL,
  severity   TEXT NOT NULL,
  proposed   INTEGER NOT NULL DEFAULT 0,
  corpus_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audits (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id     TEXT NOT NULL,
  actor      TEXT NOT NULL,
  event      TEXT NOT NULL,
  triplet    TEXT NOT NULL,
  created_at INTEGER
);
`;
var MIRROR_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS graph_nodes (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL,
  file TEXT, line INTEGER, lineage TEXT NOT NULL, source TEXT NOT NULL, data TEXT
);
CREATE TABLE IF NOT EXISTS graph_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL REFERENCES graph_nodes(id),
  target_id TEXT NOT NULL REFERENCES graph_nodes(id),
  kind TEXT NOT NULL, lineage TEXT NOT NULL, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL, severity TEXT NOT NULL, file TEXT, line INTEGER,
  range_start INTEGER, range_end INTEGER, evidence TEXT NOT NULL,
  verdict TEXT NOT NULL, week TEXT, run_id TEXT NOT NULL, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER
);
`;
function applyPragmas(db) {
  const execPragma = (pragma) => {
    try {
      db.exec(pragma);
    } catch (e) {
      throw pragmaFailed(pragma, `driver=bun:sqlite message=${e instanceof Error ? e.message : String(e)}`);
    }
  };
  execPragma("PRAGMA journal_mode = WAL");
  execPragma("PRAGMA synchronous = NORMAL");
  execPragma("PRAGMA busy_timeout = 5000");
  execPragma("PRAGMA foreign_keys = ON");
  execPragma("PRAGMA user_version = 184");
}
function isNodeLineage(v) {
  return v === "SPEC_DERIVED" || v === "CODE_DERIVED" || v === "HYBRID";
}

class SharedDb {
  dbPath;
  handle;
  open = true;
  constructor(dbPath, handle) {
    this.dbPath = dbPath;
    this.handle = handle;
  }
  exec(sql) {
    this.handle.exec(sql);
  }
  prepare(sql) {
    const stmt = this.handle.prepare(sql);
    if (stmt !== undefined && stmt !== null) {
      return stmt;
    }
    throw new Error("[db] the sqlite prepare returned no statement");
  }
  close() {
    if (this.open) {
      this.handle.close();
      this.open = false;
    }
  }
  writeGraph(nodes, edges) {
    for (const n of nodes) {
      if (!isNodeLineage(n.lineage)) {
        throw lineageMissing(n.id);
      }
    }
    for (const e of edges) {
      if (!isNodeLineage(e.lineage)) {
        throw lineageMissing(`edge ${e.sourceId} -> ${e.targetId}`);
      }
    }
    const tx = this.handle.transaction(() => {
      this.handle.prepare("DELETE FROM graph_edges").run();
      this.handle.prepare("DELETE FROM graph_nodes").run();
      const nodeStmt = this.handle.prepare("INSERT INTO graph_nodes VALUES (?,?,?,?,?,?,?,?)");
      for (const n of nodes) {
        nodeStmt.run(n.id, n.kind, n.name, n.file ?? null, n.line ?? null, n.lineage, n.source, JSON.stringify(n.data ?? {}));
      }
      const edgeStmt = this.handle.prepare("INSERT INTO graph_edges (source_id,target_id,kind,lineage) VALUES (?,?,?,?)");
      for (const e of edges) {
        edgeStmt.run(e.sourceId, e.targetId, e.kind, e.lineage);
      }
    });
    tx();
  }
  appendFinding(finding, runId, week) {
    if (typeof finding.ruleId !== "string" || finding.ruleId.trim() === "") {
      throw findingNoTriplet(`finding at ${finding.file ?? "?"}:${finding.line ?? "?"} carries an empty ruleId \u2014 the Pattern leg of the EvidenceTriad is mandatory`);
    }
    if (typeof finding.evidence !== "string" || finding.evidence.trim() === "") {
      throw findingNoTriplet(`finding ${finding.ruleId} at ${finding.file ?? "?"}:${finding.line ?? "?"} carries an empty evidence string`);
    }
    if (!SEVERITIES.includes(finding.severity))
      throw findingInvalid("severity", finding.severity);
    if (!FINDING_VERDICTS.includes(finding.verdict))
      throw findingInvalid("verdict", finding.verdict);
    const persistedEvidence = finding.triad ? `${finding.evidence} | TRIAD ${JSON.stringify(finding.triad)}` : finding.evidence;
    this.handle.prepare(`INSERT INTO findings (rule_id,severity,file,line,range_start,range_end,evidence,verdict,week,run_id,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(finding.ruleId, finding.severity, finding.file ?? null, finding.line ?? null, finding.rangeStart ?? null, finding.rangeEnd ?? null, persistedEvidence, finding.verdict, week ?? null, runId, Date.now());
  }
  appendReportSection(section, runId) {
    this.handle.prepare(`INSERT INTO report_sections (finding_id,how_broken,why_broken,what_violates,how_to_fix,what_to_do,why_works,run_id)
       VALUES (?,?,?,?,?,?,?,?)`).run(section.findingId, section.howBroken, section.whyBroken, section.whatViolates, section.howToFix, section.whatToDo, section.whyWorks, runId);
  }
  appendImplementation(row, runId) {
    if (!IMPLEMENTATION_STATUSES.includes(row.status)) {
      throw implementationInvalid("status", row.status);
    }
    this.handle.prepare("INSERT INTO implementations (file,before_sha,after_sha,claim,status,run_id) VALUES (?,?,?,?,?,?)").run(row.file, row.beforeSha, row.afterSha, row.claim, row.status, runId);
  }
  appendConformanceVerdict(row, runId) {
    if (!CONFORMANCE_VERDICTS.includes(row.verdict)) {
      throw verdictInvalid("verdict", row.verdict);
    }
    this.handle.prepare("INSERT INTO conformance_verdicts (finding_id,verdict,evidence,fixed_at,fixed_by,run_id) VALUES (?,?,?,?,?,?)").run(row.findingId, row.verdict, row.evidence, row.fixedAt ?? null, row.fixedBy, runId);
  }
  appendEvent(kind, payload) {
    if (!EVENT_KINDS.includes(kind))
      throw eventInvalid(kind);
    this.handle.prepare("INSERT INTO events (kind,payload,created_at) VALUES (?,?,?)").run(kind, JSON.stringify(payload), Date.now());
  }
  mirrorToMasterContext(profile) {
    const mirrorDir = path.join(profile.project.root, "MASTER_CONTEXT", "knowledge-graph");
    const mirrorPath = path.join(mirrorDir, "graph.db");
    let mirror;
    try {
      fs.mkdirSync(mirrorDir, { recursive: true });
      mirror = new Database(mirrorPath);
      applyPragmas(mirror);
      mirror.exec("DROP TABLE IF EXISTS events; DROP TABLE IF EXISTS findings; DROP TABLE IF EXISTS graph_edges; DROP TABLE IF EXISTS graph_nodes;");
      mirror.exec(MIRROR_SCHEMA_SQL);
    } catch (e) {
      throw mirrorWriteFailed(mirrorPath, `mirror open failed: ${String(e)}`);
    }
    try {
      const nodeIns = mirror.prepare("INSERT OR REPLACE INTO graph_nodes VALUES (?,?,?,?,?,?,?,?)");
      for (const row of this.handle.prepare("SELECT id,kind,name,file,line,lineage,source,data FROM graph_nodes").all()) {
        nodeIns.run(row["id"], row["kind"], row["name"], row["file"], row["line"], row["lineage"], row["source"], row["data"]);
      }
      const edgeIns = mirror.prepare("INSERT INTO graph_edges (source_id,target_id,kind,lineage,created_at) VALUES (?,?,?,?,?)");
      for (const row of this.handle.prepare("SELECT source_id,target_id,kind,lineage,created_at FROM graph_edges").all()) {
        edgeIns.run(row["source_id"], row["target_id"], row["kind"], row["lineage"], row["created_at"]);
      }
      const findIns = mirror.prepare("INSERT INTO findings (rule_id,severity,file,line,range_start,range_end,evidence,verdict,week,run_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
      for (const row of this.handle.prepare("SELECT rule_id,severity,file,line,range_start,range_end,evidence,verdict,week,run_id,created_at FROM findings").all()) {
        findIns.run(row["rule_id"], row["severity"], row["file"], row["line"], row["range_start"], row["range_end"], row["evidence"], row["verdict"], row["week"], row["run_id"], row["created_at"]);
      }
      const evIns = mirror.prepare("INSERT INTO events (kind,payload,created_at) VALUES (?,?,?)");
      for (const row of this.handle.prepare("SELECT kind,payload,created_at FROM events").all()) {
        evIns.run(row["kind"], row["payload"], row["created_at"]);
      }
    } catch (e) {
      throw mirrorWriteFailed(mirrorPath, `mirror copy failed: ${String(e)}`);
    } finally {
      mirror.close();
    }
    return mirrorPath;
  }
}
var FAMILY_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS family_nodes (
  id TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  node_json TEXT NOT NULL,
  registered_by TEXT NOT NULL,
  promoted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_family_nodes_content_hash ON family_nodes(content_hash);
CREATE TABLE IF NOT EXISTS family_edges (
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  lineage TEXT NOT NULL,
  origin TEXT NOT NULL,
  PRIMARY KEY (source_id, target_id, kind)
);
CREATE TABLE IF NOT EXISTS family_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
function sha256Hex(bytes) {
  const h = createHash("sha256");
  if (typeof bytes === "string")
    h.update(bytes, "utf8");
  else
    h.update(bytes);
  return h.digest("hex");
}
function contentHashId(fileBytes, symbol) {
  return `${sha256Hex(fileBytes)}::${symbol}`;
}
function applyFamilyPragmas(db) {
  const execPragma = (pragma) => {
    try {
      db.exec(pragma);
    } catch (e) {
      throw pragmaFailed(pragma, `driver=bun:sqlite message=${e instanceof Error ? e.message : String(e)}`);
    }
  };
  execPragma("PRAGMA query_only = 1");
}
function ensureFamilyTables(db) {
  db.exec(FAMILY_TABLES_SQL);
}

class FamilyGraphStore {
  familyDb;
  branchDb;
  familyPath;
  branchPath;
  sealed = false;
  constructor(familyPath, familyDb, branchPath, branchDb) {
    this.familyPath = familyPath;
    this.familyDb = familyDb;
    this.branchPath = branchPath;
    this.branchDb = branchDb;
    ensureFamilyTables(this.familyDb);
    ensureFamilyTables(this.branchDb);
    try {
      this.branchDb.exec("CREATE VIEW IF NOT EXISTS branch_union_view AS SELECT id, kind, name, file, line, lineage, source, data, 'family' as origin FROM family_nodes UNION ALL SELECT id, kind, name, file, line, lineage, source, data, 'delta' as origin FROM graph_nodes");
    } catch (idemErr) {
      console.debug("[kg-store] idempotent guard #1:", idemErr instanceof Error ? idemErr.message : String(idemErr));
    }
  }
  lookupByContentHash(hash) {
    if (hash === null || hash === undefined || typeof hash !== "string" || hash.trim() === "")
      return null;
    const h = hash.trim();
    let row = null;
    if (h.includes("::")) {
      row = this.familyDb.prepare("SELECT node_json FROM family_nodes WHERE id = ?").get(h);
      if (row) {
        try {
          return JSON.parse(row["node_json"]);
        } catch {
          return null;
        }
      }
      return null;
    }
    row = this.familyDb.prepare("SELECT node_json FROM family_nodes WHERE content_hash = ? LIMIT 1").get(h);
    if (!row)
      return null;
    try {
      return JSON.parse(row["node_json"]);
    } catch {
      return null;
    }
  }
  writeBranchView(branchRoot, deltaNodes, refs) {
    if (this.sealed)
      throw familyRootReadonly("FamilyGraphStore is sealed read-only \u2014 writeBranchView targets the branch db only");
    const tx = this.branchDb.transaction(() => {
      this.branchDb.prepare("DELETE FROM graph_edges").run();
      this.branchDb.prepare("DELETE FROM graph_nodes").run();
      const nodeStmt = this.branchDb.prepare("INSERT INTO graph_nodes VALUES (?,?,?,?,?,?,?,?)");
      for (const n of deltaNodes) {
        if (!isNodeLineage(n.lineage))
          throw lineageMissing(n.id);
        const toInsert = [n];
        const dupPaths = n.data?.["duplicatePaths"];
        if (Array.isArray(dupPaths)) {
          for (const dup of dupPaths) {
            if (typeof dup !== "string" || dup.trim() === "")
              continue;
            const dupId = contentHashId(dup, n.name);
            if (dupId === n.id)
              continue;
            toInsert.push({ ...n, id: dupId, file: dup });
          }
        }
        const seenIds = new Set;
        for (const ins of toInsert) {
          if (seenIds.has(ins.id))
            continue;
          seenIds.add(ins.id);
          nodeStmt.run(ins.id, ins.kind, ins.name, ins.file ?? null, ins.line ?? null, ins.lineage, ins.source, JSON.stringify(ins.data ?? {}));
        }
      }
      const edgeStmt = this.branchDb.prepare("INSERT INTO graph_edges (source_id,target_id,kind,lineage) VALUES (?,?,?,?)");
      for (const e of refs) {
        if (!isNodeLineage(e.lineage))
          throw lineageMissing(`edge ${e.sourceId} -> ${e.targetId}`);
        edgeStmt.run(e.sourceId, e.targetId, e.kind, e.lineage);
      }
    });
    tx();
    try {
      this.branchDb.exec("DROP VIEW IF EXISTS branch_union_view");
      this.branchDb.exec("CREATE VIEW branch_union_view AS SELECT id, kind, name, file, line, lineage, source, data, 'family' as origin FROM family_nodes UNION ALL SELECT id, kind, name, file, line, lineage, source, data, 'delta' as origin FROM graph_nodes");
    } catch (idemErr) {
      console.debug("[kg-store] idempotent guard #2:", idemErr instanceof Error ? idemErr.message : String(idemErr));
    }
    try {
      this.branchDb.exec(`ATTACH DATABASE '${this.familyPath}' AS family_attached`);
      this.branchDb.exec("DROP VIEW IF EXISTS branch_union_attached");
      this.branchDb.exec("CREATE VIEW branch_union_attached AS SELECT id, kind, name, file, line, lineage, source, data, 'family' as origin FROM family_attached.family_nodes UNION ALL SELECT id, kind, name, file, line, lineage, source, data, 'delta' as origin FROM main.graph_nodes");
    } catch (idemErr) {
      console.debug("[kg-store] idempotent guard #3:", idemErr instanceof Error ? idemErr.message : String(idemErr));
    }
  }
  getBranchUnion() {
    try {
      const rows = this.branchDb.prepare("SELECT id, kind, name, file, line, lineage, source, data, origin FROM branch_union_view").all();
      if (rows.length > 0)
        return rows.map((r) => ({ id: r["id"], kind: r["kind"], name: r["name"], file: r["file"], line: r["line"], lineage: r["lineage"], source: r["source"], data: (() => {
          try {
            return JSON.parse(r["data"]);
          } catch {
            return {};
          }
        })(), origin: r["origin"] }));
    } catch (idemErr) {
      console.debug("[kg-store] idempotent guard #4:", idemErr instanceof Error ? idemErr.message : String(idemErr));
    }
    const fam = this.familyDb.prepare("SELECT id, kind, name, file, line, lineage, source, data FROM family_nodes").all();
    const delta = this.branchDb.prepare("SELECT id, kind, name, file, line, lineage, source, data FROM graph_nodes").all();
    const out = [];
    for (const r of fam)
      out.push({ id: r["id"], kind: r["kind"], name: r["name"], file: r["file"], line: r["line"], lineage: r["lineage"], source: r["source"], data: (() => {
        try {
          return JSON.parse(r["node_json"]);
        } catch {
          try {
            return JSON.parse(r["data"]);
          } catch {
            return {};
          }
        }
      })(), origin: "family" });
    return out;
  }
  getBranchUnionCounts() {
    const famCount = this.familyDb.prepare("SELECT count(*) as c FROM family_nodes").get()?.["c"] ?? 0;
    const deltaCount = this.branchDb.prepare("SELECT count(*) as c FROM graph_nodes").get()?.["c"] ?? 0;
    return { family: famCount, delta: deltaCount, total: famCount + deltaCount };
  }
  sealFamily() {
    this.familyDb.prepare("INSERT OR REPLACE INTO family_metadata (key, value) VALUES ('promotion_state','FAMILY_ROOT_READONLY')").run();
    try {
      fs.chmodSync(this.familyPath, 292);
    } catch (idemErr) {
      console.debug("[kg-store] idempotent guard #5:", idemErr instanceof Error ? idemErr.message : String(idemErr));
    }
    try {
      applyFamilyPragmas(this.familyDb);
    } catch (e) {
      throw pragmaFailed("PRAGMA query_only=1", String(e));
    }
    this.sealed = true;
  }
  getPromotionState() {
    if (this.pendingPromotions.size > 0)
      return "PROMOTION_PENDING";
    try {
      const row = this.familyDb.prepare("SELECT value FROM family_metadata WHERE key='promotion_state'").get();
      return row ? String(row["value"]) : null;
    } catch {
      return null;
    }
  }
  pendingPromotions = new Map;
  requestPromotion(hash, detail) {
    this.pendingPromotions.set(hash, detail);
    try {
      this.familyDb.prepare("INSERT OR REPLACE INTO family_metadata (key, value) VALUES (?,?)").run(`promotion_pending:${hash}`, detail);
    } catch (idemErr) {
      console.debug("[kg-store] idempotent guard #6:", idemErr instanceof Error ? idemErr.message : String(idemErr));
    }
    try {
      this.familyDb.prepare("INSERT OR REPLACE INTO family_metadata (key, value) VALUES ('promotion_state','PROMOTION_PENDING')").run();
    } catch (idemErr) {
      console.debug("[kg-store] idempotent guard #7:", idemErr instanceof Error ? idemErr.message : String(idemErr));
    }
    throw familyPromotionPending(hash, detail);
  }
  validateContractHash(expectedHash) {
    const row = this.familyDb.prepare("SELECT value FROM family_metadata WHERE key='contract_hash'").get();
    const actual = row ? String(row["value"]) : "";
    if (actual && actual !== expectedHash)
      throw familyRootDrift(expectedHash, actual);
  }
  setContractHash(hash) {
    if (this.sealed)
      throw familyRootReadonly("cannot set contract hash on sealed family store");
    this.familyDb.prepare("INSERT OR REPLACE INTO family_metadata (key, value) VALUES ('contract_hash',?)").run(hash);
  }
  registerFamilyNode(node, fileBytes, registeredBy) {
    if (this.sealed)
      throw familyRootReadonly(`write attempt to sealed family store: ${node.id}`);
    const hash = sha256Hex(fileBytes);
    const expectedId = `${hash}::${node.name}`;
    if (node.id !== expectedId)
      throw new Error(`FAMILY_CONTENT_MISMATCH: node.id=${node.id} expected=${expectedId}`);
    this.familyDb.prepare("INSERT OR REPLACE INTO family_nodes (id, content_hash, node_json, registered_by, promoted_at) VALUES (?,?,?,?,?)").run(node.id, hash, JSON.stringify(node), registeredBy, Date.now());
  }
  close() {
    try {
      this.familyDb.close();
    } catch (idemErr) {
      console.debug("[kg-store] idempotent guard #8:", idemErr instanceof Error ? idemErr.message : String(idemErr));
    }
    try {
      this.branchDb.close();
    } catch (idemErr) {
      console.debug("[kg-store] idempotent guard #9:", idemErr instanceof Error ? idemErr.message : String(idemErr));
    }
  }
}
function openStore(dbPath) {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const handle = new Database(dbPath);
  applyPragmas(handle);
  handle.exec(CREATE_TABLES_SQL);
  handle.exec(SHADOW_VERDICTS_DDL);
  handle.exec(EVENT_LEDGER_DDL);
  return new SharedDb(dbPath, handle);
}

// src/subagents/trident-bug-hunter/surface/lsp-injector.ts
import path2 from "path";
import fs2 from "fs";
var WATCHER_DEBOUNCE_MS = 800;
var WATCHER_BACKLOG_CAP = 500;
var WATCHER_STALLED = "WATCHER_STALLED";
var GRAPH_UPDATE_CONFLICT = "GRAPH_UPDATE_CONFLICT";

class DiagnosticsServer {
  state = new Map;
  recent = new Map;
  provider = null;
  conformanceZero = false;
  debounceTimer = null;
  db = null;
  withState(fixture) {
    for (const [file, diags] of Object.entries(fixture))
      this.state.set(file, diags);
    return this;
  }
  bindDb(db) {
    this.db = db;
    return this;
  }
  setFindings(provider) {
    this.provider = provider;
  }
  scan(changedFiles) {
    if (!this.provider)
      return;
    for (const file of changedFiles ?? []) {
      const diags = this.provider.forFile(file);
      if (diags.length === 0)
        this.state.delete(file);
      else
        this.state.set(file, diags);
    }
  }
  watch(dir, onChange) {
    if (this.debounceTimer)
      clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      if (onChange)
        onChange([]);
      this.scan();
    }, WATCHER_DEBOUNCE_MS);
  }
  onAuditDone({ conformanceZero }) {
    this.conformanceZero = conformanceZero;
    if (conformanceZero)
      this.state.clear();
  }
  diagnosticsFor(file) {
    if (this.db) {
      return this.diagnosticsFromDb(file);
    }
    return this.state.get(file) ?? [];
  }
  diagnosticsFromDb(file) {
    try {
      const auditRow = rowAs(this.db.prepare("SELECT payload FROM events WHERE kind = 'AUDIT_DONE' ORDER BY id DESC LIMIT 1").get(), "AUDIT_DONE row");
      if (auditRow && typeof auditRow.payload === "string") {
        try {
          const audit = JSON.parse(auditRow.payload);
          if (audit.conformanceZero === true)
            return [];
        } catch (e) {
          console.warn(`[lsp-injector] AUDIT_DONE payload parse failed (the read falls through): ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      const runRow = rowAs(this.db.prepare("SELECT payload FROM events WHERE kind = 'HUNT_DONE' ORDER BY id DESC LIMIT 1").get(), "HUNT_DONE row");
      let runId = "";
      if (runRow && typeof runRow.payload === "string") {
        try {
          runId = JSON.parse(runRow.payload).runId ?? "";
        } catch (e) {
          console.warn(`[lsp-injector] HUNT_DONE payload parse failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (!runId)
        return [];
      const rows = rowsAs(this.db.prepare("SELECT rule_id, severity, file, line, evidence FROM findings WHERE run_id = ? AND verdict = ?").all(runId, "VIOLATION"), "findings rows");
      const exact = rows.filter((r) => r.file && pathResolve(r.file) === pathResolve(file));
      const out = [];
      for (const r of exact) {
        out.push({
          ruleId: r.rule_id,
          severity: severityFromRow(r.severity),
          message: r.evidence.slice(0, 80),
          line: r.line ?? 0
        });
      }
      return out;
    } catch (e) {
      console.debug(`[lsp-injector] the DB-backed diagnostics read failed (the in-memory state is the fallback): ${String(e)}`);
      return this.state.get(file) ?? [];
    }
  }
  resolveTouchedFiles(candidate) {
    if (this.db)
      return [candidate];
    if (this.state.has(candidate))
      return [candidate];
    const prefix = candidate.replace(/[.*?]/g, "");
    return [...this.state.keys()].filter((k) => k.startsWith(prefix));
  }
  shownTimes(file, ruleId) {
    return this.recent.get(`${file}\x00${ruleId}`) ?? 0;
  }
  recordShow(file, ruleId) {
    const key = `${file}\x00${ruleId}`;
    this.recent.set(key, (this.recent.get(key) ?? 0) + 1);
  }
  notify(file) {}
  publishDiagnostics(file) {
    this.notify(file);
  }
}

class LiveGraphWatcher extends DiagnosticsServer {
  watcher = null;
  handle = null;
  queue = [];
  pausedFlag = false;
  writeLock = false;
  graphNodesBefore = 0;
  reparseChangedFn = null;
  rerunBatteryFn = null;
  bindReparse(fn) {
    this.reparseChangedFn = fn;
  }
  bindRerun(fn) {
    this.rerunBatteryFn = fn;
  }
  watch(dir, onChange) {
    if (this.handle)
      return this.handle;
    const absDir = path2.resolve(dir);
    try {
      this.watcher = fs2.watch(absDir, { recursive: true }, (_event, filename) => {
        if (!filename)
          return;
        if (this.pausedFlag || this.writeLock) {
          this.queue.push(filename);
          this.enforceBacklog();
          return;
        }
        this.queue.push(path2.resolve(absDir, filename));
        this.enforceBacklog();
        this.scheduleDrain(onChange, absDir);
      });
    } catch {}
    const self = this;
    this.handle = {
      get paused() {
        return self.pausedFlag;
      },
      get dir() {
        return absDir;
      },
      close() {
        if (self.debounceTimer) {
          clearTimeout(self.debounceTimer);
          self.debounceTimer = null;
        }
        if (self.watcher) {
          try {
            self.watcher.close();
          } catch {}
          self.watcher = null;
        }
        self.handle = null;
      }
    };
    return this.handle;
  }
  pause() {
    this.pausedFlag = true;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
  resume() {
    this.pausedFlag = false;
    if (this.queue.length > 0) {
      const pending = this.drainQueue();
      this.triggerReparse(pending);
    }
  }
  acquireWriteLock() {
    if (this.writeLock)
      throw new EngineError(GRAPH_UPDATE_CONFLICT, `${GRAPH_UPDATE_CONFLICT}: a write is already in progress \u2014 the watcher is paused`);
    this.writeLock = true;
    this.pause();
  }
  releaseWriteLock() {
    this.writeLock = false;
    this.resume();
  }
  async reparseChanged(files) {
    if (this.reparseChangedFn)
      return this.reparseChangedFn(files);
    return new Set(files.map((f) => `corbell:${path2.basename(f)}`));
  }
  async rerunBattery(nodeIds) {
    if (this.rerunBatteryFn)
      return this.rerunBatteryFn(nodeIds);
  }
  diagnosticsForLive(file) {
    return this.diagnosticsFor(file);
  }
  enforceBacklog() {
    if (this.queue.length > WATCHER_BACKLOG_CAP) {
      console.warn(WATCHER_STALLED);
      const folded = new Map;
      for (const f of this.queue)
        folded.set(path2.basename(f), f);
      this.queue = [...folded.values()];
    }
  }
  scheduleDrain(onChange, dir) {
    if (this.debounceTimer)
      clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      const batch = this.drainQueue();
      if (onChange)
        onChange(batch);
      this.triggerReparse(batch);
      this.scan(batch);
    }, WATCHER_DEBOUNCE_MS);
  }
  drainQueue() {
    const b = [...this.queue];
    this.queue = [];
    return b;
  }
  triggerReparse(files) {
    if (files.length === 0)
      return;
    this.reparseChanged(files).then((ids) => this.rerunBattery(ids));
  }
}

class EngineError extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = code;
    this.code = code;
  }
}
function pathResolve(p) {
  try {
    return path2.resolve(p);
  } catch {
    return p;
  }
}
var projectServers = new Map;
function resolveProjectRoot(file) {
  let dir = path2.dirname(pathResolve(file));
  while (true) {
    const marker = path2.join(dir, ".trident", "knowledge-graph", "shared.db");
    if (fs2.existsSync(marker))
      return dir;
    const parent = path2.dirname(dir);
    if (parent === dir)
      return null;
    dir = parent;
  }
}
function getProjectDiagnosticsServer(projectRoot) {
  let server = projectServers.get(projectRoot);
  if (!server) {
    server = new DiagnosticsServer;
    const dbPath = path2.join(projectRoot, ".trident", "knowledge-graph", "shared.db");
    if (fs2.existsSync(dbPath)) {
      try {
        const { openStore: openStore2 } = requireProjectDb();
        server.bindDb(openStore2(dbPath));
      } catch (e) {
        console.warn(`[lsp-injector] project db bind failed for ${dbPath} \u2014 the in-memory state is the fallback: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    projectServers.set(projectRoot, server);
  }
  return server;
}
function requireProjectDb() {
  return { openStore };
}
function resolveDiagnosticsServerForFile(file) {
  if (file) {
    const root = resolveProjectRoot(file);
    if (root)
      return getProjectDiagnosticsServer(root);
  }
  return getSharedDiagnosticsServer();
}
function getSharedDiagnosticsServer() {
  if (sharedServer === null)
    sharedServer = new DiagnosticsServer;
  return sharedServer;
}
var sharedServer = null;
function resolveDiagnosticsServer(explicit, file) {
  if (explicit)
    return explicit;
  return file ? resolveDiagnosticsServerForFile(file) : getSharedDiagnosticsServer();
}
function extractTouchedFile(tool, args) {
  switch (tool) {
    case "read":
      return typeof args.filePath === "string" ? args.filePath : typeof args.path === "string" ? args.path : null;
    case "edit":
      return typeof args.filePath === "string" ? args.filePath : null;
    case "write":
      return typeof args.targetPath === "string" ? args.targetPath : typeof args.filePath === "string" ? args.filePath : null;
    case "glob":
      return typeof args.pattern === "string" ? args.pattern.replace(/[*?[\]{}]/g, "") : null;
    case "bash": {
      const cmd = typeof args.command === "string" ? args.command : "";
      const m = /(?:^|\s)([^\s|;&<>]+\.tsx?)/.exec(cmd);
      return m ? m[1] : null;
    }
    default:
      return null;
  }
}
function severityPrefix(severity) {
  return severity === "WARN" ? "warn" : "error";
}
var LOGIC_LSP_BYTE_COST = 500;
var LOGIC_LSP_TRUNCATION_MARGIN = LOGIC_LSP_BYTE_COST - 20;
function inject(result, server) {
  const base = typeof result.output === "string" ? result.output : result.output === null || result.output === undefined ? "" : JSON.stringify(result.output);
  const file = extractTouchedFile(result.tool, result.args);
  if (file === null)
    return { output: base };
  const candidates = server.resolveTouchedFiles(file);
  if (candidates.length === 0)
    return { output: base };
  const blocks = [];
  for (const touched of candidates) {
    const diags = server.diagnosticsFor(touched);
    if (diags.length === 0)
      continue;
    const lines = [];
    let repeated = 0;
    for (const d of diags) {
      const shown = server.shownTimes(touched, d.ruleId);
      if (shown > 0)
        repeated += 1;
      else
        lines.push(`  ${severityPrefix(d.severity)}   ${d.ruleId}  ${d.message}  :${d.line}`);
      server.recordShow(touched, d.ruleId);
    }
    if (repeated > 0)
      lines.push(`  (${repeated} repeated)`);
    const block = `[LOGIC-LSP] ${diags.length} diagnostic(s) in ${touched}:
${lines.join(`
`)}`;
    blocks.push(block.length > LOGIC_LSP_BYTE_COST ? block.slice(0, LOGIC_LSP_TRUNCATION_MARGIN) + `
  (\u2026truncated)` : block);
  }
  if (blocks.length === 0)
    return { output: base };
  const joined = blocks.join(`

`);
  return { output: base ? `${base}

${joined}` : joined };
}
function loadStateFromFindings(db, runId, server) {
  const rows = rowsAs(db.prepare("SELECT rule_id, severity, file, line, evidence FROM findings WHERE run_id = ? AND verdict = ?").all(runId, "VIOLATION"), "loadStateFromFindings");
  const grouped = new Map;
  for (const r of rows) {
    if (!r.file)
      continue;
    const diag = {
      ruleId: r.rule_id,
      severity: severityFromRow(r.severity),
      message: r.evidence.slice(0, 80),
      line: r.line ?? 0
    };
    const list = grouped.get(r.file) ?? [];
    list.push(diag);
    grouped.set(r.file, list);
  }
  for (const [file, diags] of grouped)
    server.withState({ [file]: diags });
}
function rowsAs(rows, label) {
  if (Array.isArray(rows)) {
    return rows;
  }
  throw new Error(`[lsp-injector] ${label} expected an array of rows, got ${typeof rows}`);
}
function rowAs(row, label) {
  if (row !== undefined && row !== null) {
    return row;
  }
  return row;
}
function severityFromRow(sev) {
  if (sev === "CRIT" || sev === "HIGH" || sev === "MED" || sev === "WARN") {
    return sev;
  }
  return "WARN";
}
export {
  resolveProjectRoot,
  resolveDiagnosticsServerForFile,
  resolveDiagnosticsServer,
  loadStateFromFindings,
  inject,
  getSharedDiagnosticsServer,
  getProjectDiagnosticsServer,
  extractTouchedFile,
  WATCHER_STALLED,
  WATCHER_DEBOUNCE_MS,
  WATCHER_BACKLOG_CAP,
  LiveGraphWatcher,
  LOGIC_LSP_BYTE_COST,
  GRAPH_UPDATE_CONFLICT,
  DiagnosticsServer
};
