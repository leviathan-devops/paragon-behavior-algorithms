// src/subagents/trident-bug-hunter/hooks/bus-hook.ts
// THE EVENT BUS HOOK (W7, spec §5.1:2339-2357 — the Hydra transport, D19.2).
// The passive pub-sub over W1's events table: the REPORT actor INSERTs the
// HUNT_DONE row; this hook polls the events table past its cursor and pushes to
// the subscribers (the main-agent dispatch directive, the auditor's AUDIT_START,
// the LOGIC-LSP clear). The D19.2 fallback contract: if the external Hydra
// system's API proves heavier than the value, THIS events-table push IS the
// sanctioned transport — the semantics identical (push, not poll), the durable
// truth identical (the DB), the only loss the external system's channeling.
//
// THE PLATFORM EVENT SURFACE (spec §5.1:2344): the plugin's 'event' hook fires
// on the platform's lifecycle events (session.created/ended etc.). The bus
// rides it — every event fires the poll, the cursor advances past the rows the
// machine's REPORT actor appended. The HUNT_DONE → the main agent's
// DISPATCH_BUILD directive; the BUILD_DONE → the auditor's AUDIT_START; the
// AUDIT_DONE → the diagnostics server's clear check (D25).

import type { DbClient, EventKind } from '../../../shared/knowledge-graph/db.ts';
import type { DiagnosticsServer } from '../surface/lsp-injector.ts';

/** The event row the bus reads (the events table's SELECT shape). */
export interface EventRow {
  id: number;
  kind: string;
  payload: string;
}

/** A bus subscription — the callback the platform wiring registers. */
export type BusSubscriber = (kind: EventKind, payload: Record<string, unknown>) => void;

/** THE BUS — the cursor + the subscribers + the poll. */

/** THE R16 TYPE_CERTAINTY GUARDED READ — a `.all()` result (an unknown array)
 *  is Array.isArray-checked before the typed row assertion. */
function rowsAs<T>(rows: unknown, label: string): T[] {
  if (Array.isArray(rows)) {
    return rows as T[];
  }
  throw new Error(`[hydra-bus] ${label} expected an array of rows, got ${typeof rows}`);
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — the event kind is narrowed by the
 *  isBusKind membership check (the assertion is earned by the validation). */
function eventKind(v: unknown): EventKind {
  if (typeof v === 'string' && isBusKind(v)) {
    return v;
  }
  return 'HUNT_DONE';
}
export class HydraBus {
  private cursor = 0;
  private readonly subscribers: BusSubscriber[] = [];

  subscribe(fn: BusSubscriber): void {
    this.subscribers.push(fn);
  }

  /** Poll the events table past the cursor; push the new rows to the
   *  subscribers; advance the cursor. Returns the pushed rows (the test +
   *  the audit surface). */
  poll(db: DbClient): EventRow[] {
    const rows = rowsAs<EventRow>(db.prepare('SELECT id, kind, payload FROM events WHERE id > ? ORDER BY id ASC').all(this.cursor), 'events');
    for (const row of rows) {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(row.payload) as Record<string, unknown>;
      } catch (e: unknown) {
        console.warn(`[hydra-bus] event payload parse failed — the raw form is kept: ${e instanceof Error ? e.message : String(e)}`);
        payload = { raw: row.payload };
      }
      if (isBusKind(row.kind)) {
        for (const fn of this.subscribers) {
          try {
            fn(eventKind(row.kind), payload);
          } catch (e: unknown) {
            // a subscriber failure must not kill the poll loop — the row is
            // still consumed (the cursor advances), the failure is logged by
            // the platform's error handler.
            console.error(`[hydra-bus] subscriber for ${row.kind} threw: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }
      this.cursor = row.id;
    }
    return rows;
  }

  /** The cursor — the audit + the test surface. */
  getCursor(): number {
    return this.cursor;
  }
}

function isBusKind(k: string): k is EventKind {
  return k === 'HUNT_DONE' || k === 'BUILD_DONE' || k === 'AUDIT_DONE';
}

/** THE DEFAULT SUBSCRIPTIONS (spec §5.1:2349-2352) — the machine's own wiring:
 *  the HUNT_DONE → the main-agent dispatch directive; the BUILD_DONE → the
 *  auditor's AUDIT_START; the AUDIT_DONE → the LOGIC-LSP clear check. The
 *  emit targets are the platform wiring's callbacks (injectable for the tests). */
export interface BusDefaultWiring {
  onHuntDone?: (payload: Record<string, unknown>) => void;
  onBuildDone?: (payload: Record<string, unknown>) => void;
  onAuditDone?: (payload: Record<string, unknown>) => void;
  server?: DiagnosticsServer;
}

/** Create the bus with the DEFAULT subscriptions wired (the D19.2 fallback's
 *  own event loop — the plugin's event hook pushes the events-table rows). */
export function createHydraBus(wiring: BusDefaultWiring = {}): HydraBus {
  const bus = new HydraBus();
  bus.subscribe((kind, payload): void => {
    switch (kind) {
      case 'HUNT_DONE':
        wiring.onHuntDone?.(payload);
        break;
      case 'BUILD_DONE':
        wiring.onBuildDone?.(payload);
        break;
      case 'AUDIT_DONE':
        wiring.onAuditDone?.(payload);
        wiring.server?.onAuditDone({ conformanceZero: payload['conformanceZero'] === true });
        break;
    }
  });
  return bus;
}
