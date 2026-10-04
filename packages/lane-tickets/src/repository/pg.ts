/**
 * Postgres-oriented SQL builders for lane-tickets (not executed in unit tests).
 * Every query includes `client_id = $client_id` for tenant isolation.
 */

export interface SqlParam {
  text: string;
  values: unknown[];
}

/** List tickets with filters and keyset cursor on (updated_at, id). */
export function sqlListTickets(params: {
  client_id: string;
  project?: string;
  function?: string;
  status?: string;
  owner?: string;
  updated_since?: string;
  cursor_updated_at?: string;
  cursor_id?: string;
  limit: number;
}): SqlParam {
  const values: unknown[] = [params.client_id];
  const clauses = ["client_id = $1"];
  let n = 2;

  if (params.project) {
    clauses.push(`project = $${n++}`);
    values.push(params.project);
  }
  if (params.function) {
    clauses.push(`function = $${n++}`);
    values.push(params.function);
  }
  if (params.status) {
    clauses.push(`status = $${n++}`);
    values.push(params.status);
  }
  if (params.owner) {
    clauses.push(`owner = $${n++}`);
    values.push(params.owner);
  }
  if (params.updated_since) {
    clauses.push(`updated_at >= $${n++}`);
    values.push(params.updated_since);
  }
  if (params.cursor_updated_at && params.cursor_id) {
    clauses.push(
      `(updated_at, id) > ($${n++}::timestamptz, $${n++}::uuid)`,
    );
    values.push(params.cursor_updated_at, params.cursor_id);
  }

  values.push(params.limit);
  const text = `
    SELECT *
    FROM tickets
    WHERE ${clauses.join(" AND ")}
    ORDER BY updated_at ASC, id ASC
    LIMIT $${n}
  `;
  return { text, values };
}

export function sqlGetTicket(client_id: string, ticket_id: string): SqlParam {
  return {
    text: `
      SELECT *
      FROM tickets
      WHERE client_id = $1 AND id = $2
    `,
    values: [client_id, ticket_id],
  };
}

/**
 * Atomic ticket_claim pattern (single transaction):
 * 1. SELECT ... FROM tickets WHERE client_id = $1 AND id = $2 FOR UPDATE;
 * 2. Verify version = expected_version and status = 'approved' and lease free/expired;
 * 3. UPDATE tickets SET status = 'claimed', version = version + 1,
 *    lease_holder = $holder, lease_expires_at = now() + ($lease_seconds || ' seconds')::interval,
 *    updated_at = now()
 *    WHERE client_id = $1 AND id = $2 AND version = $expected_version;
 * 4. INSERT INTO ticket_events (...) SELECT next seq for ticket_id;
 * If UPDATE returns 0 rows → VERSION_CONFLICT or LEASE_CONFLICT.
 */
export function sqlClaimTicketComment(): string {
  return "see sqlClaimTicket pattern above — FOR UPDATE + conditional UPDATE";
}

export function sqlInsertIdempotency(): SqlParam {
  return {
    text: `
      INSERT INTO ticket_idempotency (client_id, verb, idempotency_key, response_json)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (client_id, verb, idempotency_key) DO NOTHING
      RETURNING response_json
    `,
    values: [],
  };
}

export function sqlAppendEvent(): SqlParam {
  return {
    text: `
      INSERT INTO ticket_events (
        id, ticket_id, client_id, seq, actor, verb, from_status, to_status, payload, at
      )
      SELECT
        $1, $2, $3,
        COALESCE((SELECT MAX(seq) FROM ticket_events WHERE client_id = $3 AND ticket_id = $2), 0) + 1,
        $4, $5, $6, $7, $8, $9
    `,
    values: [],
  };
}
