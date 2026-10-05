import type postgres from "postgres";

type PgSql = postgres.Sql | postgres.TransactionSql;
import { EMPTY_COUNTERS } from "../repository-internal.js";
import type { MandateCharter, MandateCounters } from "../types.js";
import type {
  StoredTicket,
  TicketEventRecord,
  TransitionSuccess,
} from "./index.js";
import { MemoryTicketDataAccess } from "./memory-data-access.js";

function normalizeCharter(raw: unknown): MandateCharter | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const c = raw as MandateCharter;
  return {
    ...c,
    hard_limits: c.hard_limits ?? [],
    soft_constraints: c.soft_constraints ?? [],
  };
}

function mapTicketRow(row: Record<string, unknown>): StoredTicket {
  return {
    id: row.id as string,
    client_id: row.client_id as string,
    project: row.project as string,
    function: row.function as StoredTicket["function"],
    kind: row.kind as StoredTicket["kind"],
    parent_id: (row.parent_id as string | null) ?? null,
    title: row.title as string,
    description: row.description as string | undefined,
    status: row.status as StoredTicket["status"],
    owner: row.owner as string | undefined,
    requester: row.requester as string | undefined,
    priority: row.priority as number | undefined,
    next_action: row.next_action as string | undefined,
    blocked_on: row.blocked_on as string | undefined,
    risk_tier: row.risk_tier as StoredTicket["risk_tier"],
    source: row.source as StoredTicket["source"],
    source_ref: row.source_ref as string | undefined,
    git_ref: row.git_ref as string | undefined,
    synced_at: row.synced_at
      ? new Date(row.synced_at as string).toISOString()
      : undefined,
    sync_state: row.sync_state as StoredTicket["sync_state"],
    version: row.version as number,
    lease_holder: (row.lease_holder as string | null) ?? null,
    lease_expires_at: row.lease_expires_at
      ? new Date(row.lease_expires_at as string).toISOString()
      : null,
    charter: normalizeCharter(row.charter),
    acceptance_criteria: row.acceptance_criteria as string[] | undefined,
    data: row.data as Record<string, unknown> | undefined,
    mandate_id: (row.mandate_id as string | null) ?? null,
    mandate_status: row.mandate_status as StoredTicket["mandate_status"],
    mandate_counters: {
      ...EMPTY_COUNTERS,
      ...((row.mandate_counters ?? {}) as MandateCounters),
    },
    created_at: new Date(row.created_at as string).toISOString(),
    updated_at: new Date(row.updated_at as string).toISOString(),
  };
}

function mapEventRow(row: Record<string, unknown>): TicketEventRecord {
  return {
    id: row.id as string,
    ticket_id: row.ticket_id as string,
    client_id: row.client_id as string,
    seq: row.seq as number,
    actor: row.actor as TicketEventRecord["actor"],
    verb: row.verb as TicketEventRecord["verb"],
    from_status: (row.from_status as string | null) ?? null,
    to_status: (row.to_status as string | null) ?? null,
    payload: row.payload as Record<string, unknown> | undefined,
    at: new Date(row.at as string).toISOString(),
  };
}

export async function loadClientTicketData(
  sql: PgSql,
  client_id: string,
): Promise<MemoryTicketDataAccess> {
  const data = new MemoryTicketDataAccess();
  const ticketRows = await sql`
    SELECT * FROM tickets WHERE client_id = ${client_id} FOR UPDATE
  `;
  for (const row of ticketRows) {
    data.setStored(mapTicketRow(row as Record<string, unknown>));
  }

  const eventRows = await sql`
    SELECT * FROM ticket_events
    WHERE client_id = ${client_id}
    ORDER BY ticket_id ASC, seq ASC
  `;
  const eventsByTicket = new Map<string, TicketEventRecord[]>();
  for (const row of eventRows) {
    const ev = mapEventRow(row as Record<string, unknown>);
    const list = eventsByTicket.get(ev.ticket_id) ?? [];
    list.push(ev);
    eventsByTicket.set(ev.ticket_id, list);
  }
  for (const [ticket_id, events] of eventsByTicket) {
    data.setEvents(ticket_id, events);
  }

  const idemRows = await sql`
    SELECT client_id, verb, idempotency_key, response_json
    FROM ticket_idempotency
    WHERE client_id = ${client_id}
  `;
  for (const row of idemRows) {
    const key = `${row.client_id as string}:${row.verb as string}:${row.idempotency_key as string}`;
    const payload =
      typeof row.response_json === "string"
        ? (JSON.parse(row.response_json) as TransitionSuccess)
        : (row.response_json as TransitionSuccess);
    data.idempotencySet(key, payload);
  }

  return data;
}

export async function flushClientTicketData(
  sql: PgSql,
  data: MemoryTicketDataAccess,
  client_id: string,
): Promise<void> {
  for (const row of data.allForClient(client_id)) {
    const events = data.getEvents(row.id);
    const lastSeq = events.length
      ? Math.max(...events.map((e) => e.seq))
      : 0;

    await sql`
      INSERT INTO tickets (
        id, client_id, project, "function", kind, parent_id, title, description,
        status, owner, requester, priority, next_action, blocked_on, risk_tier,
        source, source_ref, git_ref, synced_at, sync_state, version,
        lease_holder, lease_expires_at, charter, acceptance_criteria, data,
        mandate_id, mandate_status, mandate_counters, last_event_seq,
        created_at, updated_at
      ) VALUES (
        ${row.id}, ${row.client_id}, ${row.project}, ${row.function}, ${row.kind},
        ${row.parent_id}, ${row.title}, ${row.description ?? null},
        ${row.status}, ${row.owner ?? null}, ${row.requester ?? null},
        ${row.priority ?? null}, ${row.next_action ?? null}, ${row.blocked_on ?? null},
        ${row.risk_tier ?? null}, ${row.source}, ${row.source_ref ?? null},
        ${row.git_ref ?? null}, ${row.synced_at ?? null}, ${row.sync_state ?? null},
        ${row.version}, ${row.lease_holder}, ${row.lease_expires_at},
        ${row.charter != null ? sql.json(row.charter as never) : null},
        ${row.acceptance_criteria != null ? sql.json(row.acceptance_criteria as never) : null},
        ${row.data != null ? sql.json(row.data as never) : null},
        ${row.mandate_id}, ${row.mandate_status},
        ${sql.json(row.mandate_counters as never)}, ${lastSeq},
        ${row.created_at}, ${row.updated_at}
      )
      ON CONFLICT (id) DO UPDATE SET
        project = EXCLUDED.project,
        "function" = EXCLUDED."function",
        kind = EXCLUDED.kind,
        parent_id = EXCLUDED.parent_id,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        status = EXCLUDED.status,
        owner = EXCLUDED.owner,
        requester = EXCLUDED.requester,
        priority = EXCLUDED.priority,
        next_action = EXCLUDED.next_action,
        blocked_on = EXCLUDED.blocked_on,
        risk_tier = EXCLUDED.risk_tier,
        source = EXCLUDED.source,
        source_ref = EXCLUDED.source_ref,
        git_ref = EXCLUDED.git_ref,
        synced_at = EXCLUDED.synced_at,
        sync_state = EXCLUDED.sync_state,
        version = EXCLUDED.version,
        lease_holder = EXCLUDED.lease_holder,
        lease_expires_at = EXCLUDED.lease_expires_at,
        charter = EXCLUDED.charter,
        acceptance_criteria = EXCLUDED.acceptance_criteria,
        data = EXCLUDED.data,
        mandate_id = EXCLUDED.mandate_id,
        mandate_status = EXCLUDED.mandate_status,
        mandate_counters = EXCLUDED.mandate_counters,
        last_event_seq = EXCLUDED.last_event_seq,
        updated_at = EXCLUDED.updated_at
    `;

    for (const ev of events) {
      await sql`
        INSERT INTO ticket_events (
          id, ticket_id, client_id, seq, actor, verb, from_status, to_status, payload, at
        ) VALUES (
          ${ev.id}, ${ev.ticket_id}, ${ev.client_id}, ${ev.seq},
          ${sql.json(ev.actor as never)}, ${ev.verb}, ${ev.from_status}, ${ev.to_status},
          ${ev.payload != null ? sql.json(ev.payload as never) : null}, ${ev.at}
        )
        ON CONFLICT ON CONSTRAINT ticket_events_client_ticket_seq_unique DO NOTHING
      `;
    }
  }

  for (const [key, value] of data.idempotency.entries()) {
    if (!key.startsWith(`${client_id}:`)) {
      continue;
    }
    const [, verb, ...idemRest] = key.split(":");
    if (!verb) {
      continue;
    }
    const idemKey = idemRest.join(":");
    await sql`
      INSERT INTO ticket_idempotency (client_id, verb, idempotency_key, response_json)
      VALUES (${client_id}, ${verb}, ${idemKey}, ${sql.json(value as never)})
      ON CONFLICT (client_id, verb, idempotency_key) DO UPDATE SET
        response_json = EXCLUDED.response_json
    `;
  }
}
