/**
 * Postgres-oriented SQL builders for lane-tickets.
 * Every query includes `client_id` for tenant isolation.
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
  decision_class?: string;
  proposal_type?: string;
  proposer_api_key_id?: string;
}): SqlParam {
  const values: unknown[] = [params.client_id];
  const clauses = ["client_id = $1"];
  let n = 2;

  if (params.project) {
    clauses.push(`project = $${n++}`);
    values.push(params.project);
  }
  if (params.function) {
    clauses.push(`"function" = $${n++}`);
    values.push(params.function);
  }
  if (params.status) {
    clauses.push(`status = $${n++}`);
    values.push(params.status);
  }
  if (params.decision_class) {
    clauses.push(`decision_class = $${n++}`);
    values.push(params.decision_class);
  }
  if (params.proposal_type) {
    clauses.push(`proposal_type = $${n++}`);
    values.push(params.proposal_type);
  }
  if (params.proposer_api_key_id) {
    clauses.push(`proposer_api_key_id = $${n++}`);
    values.push(params.proposer_api_key_id);
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

/** Atomic ticket_claim: FOR UPDATE row lock + conditional UPDATE (see pg-repository concurrent tests). */
export function sqlClaimTicketUpdate(params: {
  client_id: string;
  ticket_id: string;
  expected_version: number;
  lease_holder: string;
  lease_seconds: number;
}): SqlParam {
  return {
    text: `
      UPDATE tickets
      SET
        status = 'claimed',
        version = version + 1,
        lease_holder = $4,
        lease_expires_at = now() + ($5 || ' seconds')::interval,
        updated_at = now()
      WHERE client_id = $1
        AND id = $2
        AND version = $3
        AND status = 'approved'
        AND (
          lease_holder IS NULL
          OR lease_expires_at < now()
        )
      RETURNING *
    `,
    values: [
      params.client_id,
      params.ticket_id,
      params.expected_version,
      params.lease_holder,
      String(params.lease_seconds),
    ],
  };
}

export function sqlSelectIdempotency(
  client_id: string,
  verb: string,
  idempotency_key: string,
): SqlParam {
  return {
    text: `
      SELECT response_json
      FROM ticket_idempotency
      WHERE client_id = $1 AND verb = $2 AND idempotency_key = $3
    `,
    values: [client_id, verb, idempotency_key],
  };
}

export function sqlInsertIdempotency(params: {
  client_id: string;
  verb: string;
  idempotency_key: string;
  response_json: unknown;
}): SqlParam {
  return {
    text: `
      INSERT INTO ticket_idempotency (client_id, verb, idempotency_key, response_json)
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT (client_id, verb, idempotency_key) DO NOTHING
      RETURNING response_json
    `,
    values: [
      params.client_id,
      params.verb,
      params.idempotency_key,
      JSON.stringify(params.response_json),
    ],
  };
}

/** Allocate next event seq under ticket row lock (last_event_seq). */
export function sqlAppendEventSeq(
  client_id: string,
  ticket_id: string,
): SqlParam {
  return {
    text: `
      UPDATE tickets
      SET last_event_seq = last_event_seq + 1, updated_at = now()
      WHERE client_id = $1 AND id = $2
      RETURNING last_event_seq
    `,
    values: [client_id, ticket_id],
  };
}

export function sqlAppendEventInsert(params: {
  id: string;
  ticket_id: string;
  client_id: string;
  seq: number;
  actor: unknown;
  verb: string;
  from_status: string | null;
  to_status: string | null;
  payload: unknown;
  at: string;
}): SqlParam {
  return {
    text: `
      INSERT INTO ticket_events (
        id, ticket_id, client_id, seq, actor, verb, from_status, to_status, payload, at
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb, $10::timestamptz)
    `,
    values: [
      params.id,
      params.ticket_id,
      params.client_id,
      params.seq,
      JSON.stringify(params.actor),
      params.verb,
      params.from_status,
      params.to_status,
      params.payload ? JSON.stringify(params.payload) : null,
      params.at,
    ],
  };
}
