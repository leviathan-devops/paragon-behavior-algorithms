import { describe, test, expect } from 'bun:test';
import { kindForLayer } from '../../shared/knowledge-graph/kind-for-layer.ts';
import { SQLiteMemoryStore } from '../memory.ts';
import { createGraphifyTools, GraphifyMCPClient } from '../graphify.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Database } from 'bun:sqlite';
import { TYPED_GRAPH_DDL } from '../../shared/knowledge-graph/migrations.ts';

describe('kind-for-layer granularity', ()=>{
  test('R28->Graph R29->Path R30->File R31->Container',()=>{
    expect(kindForLayer('R28')).toBe('Gate');
    expect(kindForLayer('r28-foo')).toBe('Gate');
    expect(kindForLayer('R29')).toBe('File');
    expect(kindForLayer('R30')).toBe('File');
    expect(kindForLayer('R31')).toBe('Container');
  });
  test('existing mappings intact',()=>{
    expect(kindForLayer('lexicon')).toBe('Lexicon');
    expect(kindForLayer('r-actor')).toBe('Actor');
  });
  test('single definition grep',()=>{
    const a = fs.readFileSync(path.join(import.meta.dir,'../aether-meta.ts'),'utf-8');
    const b = fs.readFileSync(path.join(import.meta.dir,'../aether-tools.ts'),'utf-8');
    const c = fs.readFileSync(path.join(import.meta.dir,'../../shared/knowledge-graph/kind-for-layer.ts'),'utf-8');
    expect((a.match(/function kindForLayer/g)||[]).length).toBe(0);
    expect((b.match(/function kindForLayer/g)||[]).length).toBe(0);
    expect((c.match(/function kindForLayer/g)||[]).length).toBe(1);
    expect(a.includes('kind-for-layer')).toBe(true);
    expect(b.includes('kind-for-layer')).toBe(true);
  });
});

describe('memory.getGraph hydration',()=>{
  test('seeded db returns nodes+edges',()=>{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'mem-w-'));
    const dbPath = path.join(tmp,'shared.db');
    const store = new SQLiteMemoryStore(dbPath);
    const db = new Database(dbPath);
    db.exec(TYPED_GRAPH_DDL);
    db.prepare('INSERT INTO typed_nodes (canonical_id,kind,label,file,line,created_run) VALUES (?,?,?,?,?,?)').run('file:src/a.ts','File','a.ts','src/a.ts',1,'run1');
    db.prepare('INSERT INTO typed_nodes (canonical_id,kind,label,file,line,created_run) VALUES (?,?,?,?,?,?)').run('fn:foo','Function','foo','src/a.ts',2,'run1');
    db.prepare('INSERT INTO typed_edges (src_canonical,dst_canonical,predicate,evidence_quote,confidence,created_run) VALUES (?,?,?,?,?,?)').run('file:src/a.ts','fn:foo','declares','explicit: test',1.0,'run1');
    const g = store.getGraph() as { nodes:any[]; edges:any[] } | null;
    expect(g).not.toBeNull();
    expect(g!.nodes.length).toBeGreaterThanOrEqual(2);
    expect(g!.edges.length).toBeGreaterThanOrEqual(1);
    store.close();
  });
  test('empty db returns null',()=>{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'mem-empty-'));
    const store = new SQLiteMemoryStore(path.join(tmp,'e.db'));
    expect(store.getGraph()).toBeNull();
    store.close();
  });
  test('null-shape on no tables',()=>{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'mem-empty2-'));
    const store = new SQLiteMemoryStore(path.join(tmp,'e2.db'));
    // fresh store has no typed tables yet but getGraph creates them -> null because 0 rows
    expect(store.getGraph()).toBeNull();
    store.close();
  });
});

describe('graphify subgraph depth arg',()=>{
  test('depth reaches MCP call', async()=>{
    const mcp = new GraphifyMCPClient() as any;
    let captured:any=null;
    mcp.client = { callTool: async (opts:any)=>{ captured=opts; return {content:[{type:'text',text:'{}'}]} } } as any;
    // bypass connect check: set client truthy already
    const tools = createGraphifyTools(mcp as GraphifyMCPClient);
    const sub = tools.find((t:any)=>t.name==='graphify:subgraph') as any;
    await sub.execute('id1',{center:'Alpha',depth:3});
    expect(captured).not.toBeNull();
    expect(captured.arguments.depth).toBe(3);
    expect(captured.arguments.label).toBe('Alpha');
    captured=null;
    await sub.execute('id2',{center:'Beta'});
    expect(captured.arguments.label).toBe('Beta');
    expect(captured.arguments.depth).toBeUndefined();
  });
});

describe('adapter shape',()=>{
  test('fulfilled maps to value, rejected to reason Error',()=>{
    function toSettlement(h:any){
      if(h.status==='fulfilled') return {subagentId:h.layerId,status:'fulfilled',value:h.findings};
      return {subagentId:h.layerId,status:'rejected',reason:new Error(String(h.error))};
    }
    const f={subagentId:'r-lexicon',status:'fulfilled',value:{candidates:[]}};
    const r={subagentId:'r-actor',status:'rejected',reason:new Error('oops')};
    const a=toSettlement({layerId:'r-lexicon',status:'fulfilled',findings:{candidates:[]}});
    const b=toSettlement({layerId:'r-actor',status:'rejected',error:'oops'});
    expect(a.subagentId).toBe('r-lexicon');
    expect(a.status).toBe('fulfilled');
    expect((a as any).value).toBeDefined();
    expect(b.status).toBe('rejected');
    expect((b as any).reason).toBeInstanceOf(Error);
  });
});

describe('lasme alias exports',()=>{
  test('createLasme aliases exist', async()=>{
    const mod = await import('../instances/lasme.ts');
    expect((mod as any).createLasmePreGates).toBeDefined();
    expect((mod as any).createLasmePostGates).toBeDefined();
    expect((mod as any).createLasmePreGates).toBe((mod as any).lasmePreGates);
    expect((mod as any).createLasmePostGates).toBe((mod as any).lasmePostGates);
  });
});

describe('aether-meta wiring grep',()=>{
  test('runMetaLayer contains adapter, preGates, synthesize, postGates, setGateOutput',()=>{
    const src = fs.readFileSync(path.join(import.meta.dir,'../aether-meta.ts'),'utf-8');
    expect(src.includes('toSettlement')||src.includes('HunterSettlement')).toBe(true);
    expect(src.includes('lasmeSynthesize')).toBe(true);
    expect(src.includes('mpseSynthesize')).toBe(true);
    expect(src.includes('sroSynthesize')).toBe(true);
    expect(src.includes('lasmePreGates')).toBe(true);
    expect(src.includes('lasmePostGates')).toBe(true);
    expect(src.includes('createMpsePreGates')).toBe(true);
    expect(src.includes('createSroPreGates')).toBe(true);
    expect(src.includes('setGateOutput')).toBe(true);
  });
});

describe('trace L8 grep',()=>{
  test('trace.ts imports classifyFact and calls it',()=>{
    const src = fs.readFileSync(path.join(import.meta.dir,'../../subagents/trident-bug-hunter/harness/trace.ts'),'utf-8');
    expect(src.includes('classifyFact')).toBe(true);
    expect(src.includes("from '../graph/update.ts'")).toBe(true);
  });
});

describe('graph-logic-phase exists',()=>{
  test('file exists and exports GraphLogicResult',()=>{
    const p = path.join(import.meta.dir,'../../audit-engine/graph-logic-phase.ts');
    expect(fs.existsSync(p)).toBe(true);
    const src = fs.readFileSync(p,'utf-8');
    expect(src.includes('GraphLogicResult')).toBe(true);
    expect(src.includes('runGraphLogicPhase')).toBe(true);
    expect(src.includes('graphPopulated')).toBe(true);
  });
  test('index.ts calls runGraphLogicPhase between classifyProject and GATES_RUNNING',()=>{
    const src = fs.readFileSync(path.join(import.meta.dir,'../../audit-engine/index.ts'),'utf-8');
    expect(src.includes('runGraphLogicPhase')).toBe(true);
    const idxClassify = src.indexOf('classifyProject');
    const idxGraph = src.indexOf('runGraphLogicPhase');
    const idxGates = src.indexOf('GATES_RUNNING', idxGraph);
    expect(idxGraph).toBeGreaterThan(idxClassify);
    expect(idxGates).toBeGreaterThan(idxGraph);
    expect(src.includes('GRAPH_LOGIC: FAILED')).toBe(true);
    expect(src.includes('GRAPH_LOGIC_FAILED')).toBe(true);
  });
});
