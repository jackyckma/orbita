import { randomUUID } from "node:crypto";
import type {
  CreateTicketParams,
  GetTicketParams,
  GetTicketResult,
  ListTicketsQuery,
  ListTicketsResult,
  MandateSubtreeHealth,
  RepositoryError,
  RepositoryResult,
  StoredTicket,
  TicketEventRecord,
  TicketRecord,
  TicketRepository,
  TransitionParams,
  TransitionSuccess,
} from "./repository/index.js";
import {
  EMPTY_COUNTERS,
  buildTransitionInput,
  evaluateTransition,
  initialStatusOnCreate,
  mandateIdOf,
  mandateStatusOf,
  nextEventSeq,
  openChildrenCount,
  parentRef,
} from "./repository-internal.js";
import type {
  MandateCharter,
  MandateStatus,
  SoftBreachHint,
  TicketStatus,
} from "./types.js";

function nowIso(): string {
  return new Date().toISOString();
}

function err(
  code: RepositoryError["code"],
  message: string,
  details?: Record<string, unknown>,
): RepositoryResult<never> {
  return { ok: false, error: { code, message, details } };
}

function publicTicket(row: StoredTicket): TicketRecord {
  const { mandate_id: _m, mandate_status: _s, mandate_counters: _c, ...rest } =
    row;
  return rest;
}

function idempotencyKey(
  client_id: string,
  verb: string,
  key: string,
): string {
  return `${client_id}:${verb}:${key}`;
}

function encodeCursor(updated_at: string, id: string): string {
  return Buffer.from(JSON.stringify({ updated_at, id }), "utf8").toString(
    "base64url",
  );
}

function decodeCursor(
  cursor: string,
): { updated_at: string; id: string } | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { updated_at: string; id: string };
    if (parsed.updated_at && parsed.id) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function softBreachPayload(hint: SoftBreachHint): Record<string, unknown> {
  return {
    event_kind: "soft_breach",
    constraint_id: hint.constraint_id,
    metric: hint.metric,
    observed_value: hint.observed_value,
    threshold_kind: hint.threshold_kind,
    target_value: hint.target_value,
  };
}

export class FakeTicketRepository implements TicketRepository {
  private readonly tickets = new Map<string, StoredTicket>();
  private readonly events = new Map<string, TicketEventRecord[]>();
  private readonly idempotency = new Map<string, TransitionSuccess>();

  private rowKey(client_id: string, id: string): string {
    return `${client_id}:${id}`;
  }

  private allForClient(client_id: string): StoredTicket[] {
    return [...this.tickets.values()].filter((t) => t.client_id === client_id);
  }

  private getStored(
    client_id: string,
    ticket_id: string,
  ): StoredTicket | undefined {
    return this.tickets.get(this.rowKey(client_id, ticket_id));
  }

  private mandateRow(
    client_id: string,
    mandate_id: string,
  ): StoredTicket | undefined {
    const row = this.getStored(client_id, mandate_id);
    if (!row || row.kind !== "mandate") {
      return undefined;
    }
    return row;
  }

  private charterFor(row: StoredTicket): MandateCharter | undefined {
    if (row.kind === "mandate") {
      return row.charter;
    }
    const mandateId = row.mandate_id;
    if (!mandateId) {
      return undefined;
    }
    const mandate = this.mandateRow(row.client_id, mandateId);
    return mandate?.charter;
  }

  private countersFor(row: StoredTicket): typeof EMPTY_COUNTERS {
    const mandateId = mandateIdOf(row);
    if (!mandateId) {
      return EMPTY_COUNTERS;
    }
    const mandate = this.mandateRow(row.client_id, mandateId);
    return mandate?.mandate_counters ?? EMPTY_COUNTERS;
  }

  private bumpWriteCounter(client_id: string, mandate_id: string | null): void {
    if (!mandate_id) {
      return;
    }
    const mandate = this.mandateRow(client_id, mandate_id);
    if (!mandate) {
      return;
    }
    mandate.mandate_counters = {
      ...mandate.mandate_counters,
      writes_today: mandate.mandate_counters.writes_today + 1,
    };
    mandate.updated_at = nowIso();
    this.tickets.set(this.rowKey(client_id, mandate.id), mandate);
  }

  private bumpCreationCounter(
    client_id: string,
    mandate_id: string | null,
    kind: StoredTicket["kind"],
  ): void {
    if (!mandate_id) {
      return;
    }
    const mandate = this.mandateRow(client_id, mandate_id);
    if (!mandate) {
      return;
    }
    const counters = { ...mandate.mandate_counters };
    counters.creations_today += 1;
    if (kind === "epic") {
      counters.open_epics += 1;
    }
    if (kind === "task" || kind === "decision") {
      counters.open_tasks += 1;
    }
    mandate.mandate_counters = counters;
    mandate.updated_at = nowIso();
    this.tickets.set(this.rowKey(client_id, mandate.id), mandate);
  }

  private syncSubtreeMandateStatus(
    client_id: string,
    mandate_id: string,
    status: MandateStatus,
  ): void {
    for (const row of this.allForClient(client_id)) {
      if (row.mandate_id === mandate_id) {
        row.mandate_status = status;
        row.updated_at = nowIso();
        this.tickets.set(this.rowKey(client_id, row.id), row);
      }
    }
  }

  private appendEvent(
    row: StoredTicket,
    event: Omit<TicketEventRecord, "id" | "seq" | "client_id">,
  ): TicketEventRecord {
    const list = this.events.get(row.id) ?? [];
    const full: TicketEventRecord = {
      id: randomUUID(),
      client_id: row.client_id,
      seq: nextEventSeq(list),
      ...event,
    };
    list.push(full);
    this.events.set(row.id, list);
    return full;
  }

  private persistSoftBreaches(
    row: StoredTicket,
    hints: SoftBreachHint[] | undefined,
    actor: TransitionParams["actor"],
    verb: TicketStatus | string,
    at: string,
  ): void {
    if (!hints?.length) {
      return;
    }
    for (const hint of hints) {
      this.appendEvent(row, {
        ticket_id: row.id,
        actor,
        verb: "ticket_comment",
        from_status: row.status,
        to_status: row.status,
        payload: softBreachPayload(hint),
        at,
      });
    }
  }

  async create(
    params: CreateTicketParams,
  ): Promise<RepositoryResult<TransitionSuccess>> {
    const { client_id, ticket, actor, idempotency_key, soft_observations } =
      params;
    const verb = "ticket_create";
    if (idempotency_key) {
      const cached = this.idempotency.get(
        idempotencyKey(client_id, verb, idempotency_key),
      );
      if (cached) {
        return { ok: true, value: { ...cached, replayed: true } };
      }
    }

    let parent: StoredTicket | undefined;
    if (ticket.parent_id) {
      parent = this.getStored(client_id, ticket.parent_id);
      if (!parent) {
        return err("NOT_FOUND", "Parent ticket not found.");
      }
    }

    const charter =
      ticket.kind === "mandate"
        ? ticket.charter
        : this.charterFor(parent ?? ({} as StoredTicket));
    if (!charter) {
      return err("INVALID_PARENT", "Mandate charter required for create.");
    }

    const initial = initialStatusOnCreate({
      kind: ticket.kind,
      actor,
      parent: parent ? parentRef(parent) : null,
      charter,
      risk_tier: ticket.risk_tier,
    });
    if (!initial.ok) {
      return err(initial.error.code, initial.error.message, initial.error.details);
    }

    const anchorKind = parent?.kind ?? "mandate";
    const anchorStatus = parent?.status ?? initial.status;
    const subtreeMandateStatus =
      ticket.kind === "mandate"
        ? undefined
        : (parent ? mandateStatusOf(parent) : undefined);

    const createCheck = evaluateTransition({
      kind: anchorKind,
      status: anchorStatus,
      verb,
      actor,
      source: ticket.source ?? "native",
      charter,
      create_kind: ticket.kind,
      parent: parent ? parentRef(parent) : null,
      mandate_id: initial.mandate_id ?? undefined,
      mandate_status: subtreeMandateStatus,
      soft_observations,
      counters:
        initial.mandate_id
          ? this.countersFor(
              this.mandateRow(client_id, initial.mandate_id)!,
            )
          : undefined,
    });
    if (!createCheck.allowed) {
      return err(
        createCheck.error.code,
        createCheck.error.message,
        createCheck.error.details,
      );
    }

    const id = randomUUID();
    const ts = nowIso();
    const mandate_id =
      ticket.kind === "mandate" ? id : (initial.mandate_id ?? null);
    const mandate_status: MandateStatus | null =
      ticket.kind === "mandate"
        ? (initial.status as MandateStatus)
        : parent?.kind === "mandate"
          ? (parent.status as MandateStatus)
          : (parent?.mandate_status ?? null);

    const row: StoredTicket = {
      id,
      client_id,
      project: ticket.project,
      function: ticket.function,
      kind: ticket.kind,
      parent_id: ticket.parent_id ?? null,
      title: ticket.title,
      description: ticket.description,
      status: initial.status,
      owner: ticket.owner,
      requester: ticket.requester,
      priority: ticket.priority,
      risk_tier: ticket.risk_tier,
      source: ticket.source ?? "native",
      git_ref: ticket.git_ref,
      version: 1,
      lease_holder: null,
      lease_expires_at: null,
      charter: ticket.kind === "mandate" ? ticket.charter : undefined,
      acceptance_criteria: ticket.acceptance_criteria,
      data: ticket.data,
      mandate_id,
      mandate_status,
      mandate_counters:
        ticket.kind === "mandate" ? { ...EMPTY_COUNTERS } : EMPTY_COUNTERS,
      created_at: ts,
      updated_at: ts,
    };

    this.tickets.set(this.rowKey(client_id, id), row);
    this.events.set(id, []);

    const event = this.appendEvent(row, {
      ticket_id: id,
      actor,
      verb,
      from_status: null,
      to_status: initial.status,
      at: ts,
    });

    this.bumpCreationCounter(client_id, mandate_id, ticket.kind);
    this.persistSoftBreaches(
      row,
      createCheck.record_soft_breach,
      actor,
      initial.status,
      ts,
    );

    const success: TransitionSuccess = { ticket: publicTicket(row), event };
    if (idempotency_key) {
      this.idempotency.set(
        idempotencyKey(client_id, verb, idempotency_key),
        success,
      );
    }
    return { ok: true, value: success };
  }

  async get(
    params: GetTicketParams,
  ): Promise<RepositoryResult<GetTicketResult>> {
    const row = this.getStored(params.client_id, params.ticket_id);
    if (!row) {
      return err("NOT_FOUND", "Ticket not found.");
    }
    const result: GetTicketResult = { ticket: publicTicket(row) };
    if (params.include_events) {
      result.events = [...(this.events.get(row.id) ?? [])];
    }
    return { ok: true, value: result };
  }

  async list(
    query: ListTicketsQuery,
  ): Promise<RepositoryResult<ListTicketsResult>> {
    const { client_id, limit = 50, cursor } = query;
    let rows = this.allForClient(client_id);

    if (query.project) {
      rows = rows.filter((r) => r.project === query.project);
    }
    if (query.function) {
      rows = rows.filter((r) => r.function === query.function);
    }
    if (query.status) {
      rows = rows.filter((r) => r.status === query.status);
    }
    if (query.owner) {
      rows = rows.filter((r) => r.owner === query.owner);
    }
    if (query.updated_since) {
      const since = query.updated_since;
      rows = rows.filter((r) => r.updated_at >= since);
    }

    rows.sort((a, b) => {
      if (a.updated_at !== b.updated_at) {
        return a.updated_at < b.updated_at ? -1 : 1;
      }
      return a.id < b.id ? -1 : 1;
    });

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        rows = rows.filter(
          (r) =>
            r.updated_at > decoded.updated_at ||
            (r.updated_at === decoded.updated_at && r.id > decoded.id),
        );
      }
    }

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const next =
      hasMore && last
        ? encodeCursor(last.updated_at, last.id)
        : null;

    return {
      ok: true,
      value: { tickets: page.map(publicTicket), next_cursor: next },
    };
  }

  async transition(
    params: TransitionParams,
  ): Promise<RepositoryResult<TransitionSuccess>> {
    const {
      client_id,
      ticket_id,
      verb,
      actor,
      expected_version,
      idempotency_key,
      progress_target,
      lease_seconds,
      lease_holder,
      soft_observations,
      blocked_on,
      comment,
    } = params;

    if (idempotency_key) {
      const cached = this.idempotency.get(
        idempotencyKey(client_id, verb, idempotency_key),
      );
      if (cached) {
        return { ok: true, value: { ...cached, replayed: true } };
      }
    }

    const row = this.getStored(client_id, ticket_id);
    if (!row) {
      return err("NOT_FOUND", "Ticket not found.");
    }

    if (
      expected_version !== undefined &&
      row.version !== expected_version
    ) {
      return err("VERSION_CONFLICT", "expected_version mismatch.", {
        expected: expected_version,
        actual: row.version,
      });
    }

    const charter = this.charterFor(row);
    if (!charter) {
      return err("INVALID_PARENT", "Mandate charter not found.");
    }

    const clientTickets = this.allForClient(client_id);
    const open_children =
      row.kind === "epic"
        ? openChildrenCount(row.id, clientTickets)
        : undefined;

    const serverCounters = charter.hard_limits.some(
      (l) => l.enforcement === "server",
    );
    const input = buildTransitionInput(row, charter, verb, actor, {
      progress_target,
      soft_observations,
      open_children_count: open_children,
      counters: serverCounters ? this.countersFor(row) : undefined,
      mandate_status: mandateStatusOf(row),
      mandate_id: mandateIdOf(row),
    });

    const decision = evaluateTransition(input);
    if (!decision.allowed) {
      return err(
        decision.error.code,
        decision.error.message,
        decision.error.details,
      );
    }

    const from_status = row.status;
    let to_status = decision.to_status ?? row.status;

    if (verb === "ticket_claim") {
      if (!lease_seconds || !lease_holder) {
        return err(
          "INVALID_TRANSITION",
          "ticket_claim requires lease_seconds and lease_holder.",
        );
      }
      if (row.lease_holder && row.lease_holder !== lease_holder) {
        return err("LEASE_CONFLICT", "Ticket already claimed by another holder.");
      }
      to_status = "claimed";
      row.lease_holder = lease_holder;
      row.lease_expires_at = new Date(
        Date.now() + lease_seconds * 1000,
      ).toISOString();
    }

    if (verb === "ticket_extend") {
      if (!lease_seconds) {
        return err("INVALID_TRANSITION", "ticket_extend requires lease_seconds.");
      }
      row.lease_expires_at = new Date(
        Date.now() + lease_seconds * 1000,
      ).toISOString();
    }

    if (verb === "ticket_block" && blocked_on) {
      row.blocked_on = blocked_on;
    }

    if (decision.to_status !== undefined) {
      row.status = decision.to_status;
    } else if (verb === "ticket_claim") {
      row.status = to_status;
    }

    row.version += 1;
    const ts = nowIso();
    row.updated_at = ts;

    if (row.kind === "mandate" && decision.to_status) {
      row.mandate_status = decision.to_status as MandateStatus;
      this.syncSubtreeMandateStatus(
        client_id,
        row.id,
        decision.to_status as MandateStatus,
      );
    }

    this.tickets.set(this.rowKey(client_id, ticket_id), row);

    const payload =
      comment !== undefined
        ? { comment }
        : params.payload;

    const event = this.appendEvent(row, {
      ticket_id: row.id,
      actor,
      verb,
      from_status,
      to_status: row.status,
      payload,
      at: ts,
    });

    this.bumpWriteCounter(client_id, row.mandate_id);
    this.persistSoftBreaches(row, decision.record_soft_breach, actor, row.status, ts);

    const success: TransitionSuccess = { ticket: publicTicket(row), event };
    if (idempotency_key) {
      this.idempotency.set(
        idempotencyKey(client_id, verb, idempotency_key),
        success,
      );
    }
    return { ok: true, value: success };
  }

  async getMandateSubtreeHealth(
    client_id: string,
    mandate_id: string,
  ): Promise<RepositoryResult<MandateSubtreeHealth>> {
    const mandate = this.mandateRow(client_id, mandate_id);
    if (!mandate) {
      return err("NOT_FOUND", "Mandate not found.");
    }

    const counts: Record<string, number> = {};
    let last_activity_at: string | null = null;

    const subtree = this.allForClient(client_id).filter(
      (t) => t.id === mandate_id || t.mandate_id === mandate_id,
    );

    for (const t of subtree) {
      counts[t.status] = (counts[t.status] ?? 0) + 1;
      if (!last_activity_at || t.updated_at > last_activity_at) {
        last_activity_at = t.updated_at;
      }
      for (const ev of this.events.get(t.id) ?? []) {
        if (!last_activity_at || ev.at > last_activity_at) {
          last_activity_at = ev.at;
        }
      }
    }

    return {
      ok: true,
      value: {
        mandate_id,
        counts_by_status: counts,
        last_activity_at,
      },
    };
  }
}
