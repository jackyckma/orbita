import { randomUUID } from "node:crypto";
import type {
  CreateTicketParams,
  GetTicketParams,
  GetTicketResult,
  ListTicketsQuery,
  ListTicketsResult,
  MandateSubtreeHealth,
  ProposeTicketParams,
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
  countOpenProposalsInMandate,
  executorCanReadTicket,
  proposalTitleFromType,
  validateInputsFromForActor,
  viewTicketForActor,
} from "./proposals.js";
import { evaluateProposalCreate } from "./transitions.js";
import {
  EMPTY_COUNTERS,
  buildTransitionInput,
  computeLiveMandateCounters,
  evaluateTransition,
  initialStatusOnCreate,
  mandateIdOf,
  mandateStatusOf,
  nextEventSeq,
  openChildrenCount,
  parentRef,
} from "./repository-internal.js";
import { applyCharterPatch } from "./charter-update.js";
import { precheckEpic } from "./precheck-epic.js";
import { isFounder, isIntegrator } from "./roles.js";
import type {
  MandateCharter,
  MandateCounters,
  MandateStatus,
  SoftBreachHint,
  TicketStatus,
} from "./types.js";
import { countOpenExceptionsInSubtree } from "./exception-tasks.js";
import { MemoryTicketDataAccess } from "./repository/memory-data-access.js";

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

function publicTicket(row: StoredTicket, actor?: import("./types.js").Actor): TicketRecord {
  const { mandate_id: _m, mandate_status: _s, mandate_counters: _c, ...rest } =
    row;
  const base = rest as TicketRecord;
  if (!actor) {
    return base;
  }
  return viewTicketForActor(base, actor);
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
  protected readonly data: MemoryTicketDataAccess;

  constructor(data?: MemoryTicketDataAccess) {
    this.data = data ?? new MemoryTicketDataAccess();
  }

  private allForClient(client_id: string): StoredTicket[] {
    return this.data.allForClient(client_id);
  }

  protected getStored(
    client_id: string,
    ticket_id: string,
  ): StoredTicket | undefined {
    return this.data.getStored(client_id, ticket_id);
  }

  private clearExpiredLease(row: StoredTicket): void {
    if (
      row.lease_holder &&
      row.lease_expires_at &&
      Date.parse(row.lease_expires_at) < Date.now()
    ) {
      row.lease_holder = null;
      row.lease_expires_at = null;
      if (row.status === "claimed") {
        row.status = "approved";
      }
    }
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

  private countersFor(row: StoredTicket): MandateCounters {
    const mandateId = mandateIdOf(row);
    if (!mandateId) {
      return EMPTY_COUNTERS;
    }
    return computeLiveMandateCounters(
      mandateId,
      this.allForClient(row.client_id),
      (id) => this.data.getEvents(id),
    );
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
    this.data.setStored(mandate);
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
    this.data.setStored(mandate);
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
        this.data.setStored(row);
      }
    }
  }

  private appendEvent(
    row: StoredTicket,
    event: Omit<TicketEventRecord, "id" | "seq" | "client_id">,
  ): TicketEventRecord {
    const list = [...this.data.getEvents(row.id)];
    const full: TicketEventRecord = {
      id: randomUUID(),
      client_id: row.client_id,
      seq: nextEventSeq(list),
      ...event,
    };
    list.push(full);
    this.data.setEvents(row.id, list);
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
      const cached = this.data.idempotencyGet(
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

    const ticketsById = new Map(
      this.allForClient(client_id).map((t) => [t.id, t]),
    );
    const inputsCheck = validateInputsFromForActor(
      actor,
      ticket.inputs_from,
      ticketsById,
    );
    if (inputsCheck && !inputsCheck.allowed) {
      return err(
        inputsCheck.error.code,
        inputsCheck.error.message,
        inputsCheck.error.details,
      );
    }

    const countersForCreate = (() => {
      const needsCounters = charter.hard_limits.some(
        (l) => l.enforcement === "server",
      );
      if (!needsCounters) {
        return undefined;
      }
      if (ticket.kind === "mandate") {
        return { ...EMPTY_COUNTERS };
      }
      const mid =
        parent?.kind === "mandate"
          ? parent.id
          : (parent?.mandate_id ?? undefined);
      if (mid) {
        const mRow = this.mandateRow(client_id, mid);
        if (mRow) {
          return this.countersFor(mRow);
        }
      }
      return { ...EMPTY_COUNTERS };
    })();

    const initial = initialStatusOnCreate({
      kind: ticket.kind,
      actor,
      parent: parent ? parentRef(parent) : null,
      charter,
      risk_tier: ticket.risk_tier,
      task_class: ticket.task_class,
      exception_type: ticket.exception_type,
      counters: countersForCreate,
    });
    if (!initial.ok) {
      return err(initial.error.code, initial.error.message, initial.error.details);
    }

    let createStatus = initial.status;
    let requiresReview = initial.requires_review ?? false;
    if (
      ticket.kind === "epic" &&
      createStatus === "approved" &&
      parent &&
      ticket.function
    ) {
      const counters = this.countersFor(this.mandateRow(client_id, initial.mandate_id!)!);
      const pre = precheckEpic({
        function: ticket.function,
        risk_tier: ticket.risk_tier,
        charter,
        counters,
        mandate_status: parent.status as MandateStatus,
        for_auto_approve: true,
      });
      if (!pre.ok) {
        createStatus = "proposed";
        requiresReview = false;
      }
    }

    const anchorKind = parent?.kind ?? "mandate";
    const anchorStatus = parent?.status ?? createStatus;
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
      task_class: initial.task_class ?? ticket.task_class,
      exception_type: initial.exception_type ?? ticket.exception_type,
      counters: countersForCreate,
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
        ? (createStatus as MandateStatus)
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
      status: createStatus,
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
      task_class:
        ticket.kind === "task"
          ? (initial.task_class ?? ticket.task_class ?? "planned")
          : undefined,
      exception_type:
        ticket.kind === "task" ? initial.exception_type ?? ticket.exception_type : undefined,
      requires_review: requiresReview,
      reviewed_at: null,
      reviewed_by: null,
      review_outcome: null,
      decision_class:
        ticket.kind === "decision" ? ("question" as const) : undefined,
      inputs_from: ticket.inputs_from,
      mandate_id,
      mandate_status,
      mandate_counters:
        ticket.kind === "mandate" ? { ...EMPTY_COUNTERS } : EMPTY_COUNTERS,
      created_at: ts,
      updated_at: ts,
    };

    this.data.setStored(row);
    this.data.setEvents(id, []);

    const event = this.appendEvent(row, {
      ticket_id: id,
      actor,
      verb,
      from_status: null,
      to_status: createStatus,
      at: ts,
    });

    this.bumpCreationCounter(client_id, mandate_id, ticket.kind);
    this.persistSoftBreaches(
      row,
      createCheck.record_soft_breach,
      actor,
      createStatus,
      ts,
    );

    const success: TransitionSuccess = { ticket: publicTicket(row), event };
    if (idempotency_key) {
      this.data.idempotencySet(
        idempotencyKey(client_id, verb, idempotency_key),
        success,
      );
    }
    return { ok: true, value: success };
  }

  async propose(
    params: ProposeTicketParams,
  ): Promise<RepositoryResult<TransitionSuccess>> {
    const {
      client_id,
      actor,
      parent_id,
      project,
      function: fn,
      proposal_type,
      suggested_change,
      rationale,
      risk_tier,
      target,
      title,
      inputs_from,
      idempotency_key,
    } = params;
    const verb = "ticket_propose";
    if (idempotency_key) {
      const cached = this.data.idempotencyGet(
        idempotencyKey(client_id, verb, idempotency_key),
      );
      if (cached) {
        return { ok: true, value: { ...cached, replayed: true } };
      }
    }

    const parent = this.getStored(client_id, parent_id);
    if (!parent || parent.kind !== "mandate") {
      return err(
        "INVALID_PARENT",
        "ticket_propose parent_id must be an active mandate.",
      );
    }
    const charter = parent.charter;
    if (!charter) {
      return err("INVALID_PARENT", "Mandate charter required.");
    }

    const ticketsById = new Map(
      this.allForClient(client_id).map((t) => [t.id, t]),
    );
    const inputsCheck = validateInputsFromForActor(
      actor,
      inputs_from,
      ticketsById,
    );
    if (inputsCheck && !inputsCheck.allowed) {
      return err(
        inputsCheck.error.code,
        inputsCheck.error.message,
        inputsCheck.error.details,
      );
    }

    const mandate_id = parent.id;
    const openCount = countOpenProposalsInMandate(
      mandate_id,
      this.allForClient(client_id),
    );
    const pre = evaluateProposalCreate({
      actor,
      charter,
      mandate_status: parent.status as import("./types.js").MandateStatus,
      mandate_id,
      open_proposals_count: openCount,
      proposal_type,
    });
    if (!pre.allowed) {
      return err(pre.error.code, pre.error.message, pre.error.details);
    }

    const id = randomUUID();
    const ts = nowIso();
    const row: StoredTicket = {
      id,
      client_id,
      project,
      function: fn,
      kind: "decision",
      parent_id: mandate_id,
      title: title ?? proposalTitleFromType(proposal_type),
      description: suggested_change,
      status: "proposed",
      risk_tier,
      source: "native",
      version: 1,
      lease_holder: null,
      lease_expires_at: null,
      decision_class: "proposal",
      proposal_type,
      target,
      suggested_change,
      rationale,
      inputs_from,
      proposer_api_key_id: actor.api_key_id,
      mandate_id,
      mandate_status: parent.status as import("./types.js").MandateStatus,
      mandate_counters: EMPTY_COUNTERS,
      created_at: ts,
      updated_at: ts,
    };

    this.data.setStored(row);
    this.data.setEvents(id, []);
    const event = this.appendEvent(row, {
      ticket_id: id,
      actor,
      verb: "ticket_propose",
      from_status: null,
      to_status: "proposed",
      payload: { proposal_type, target },
      at: ts,
    });
    this.bumpCreationCounter(client_id, mandate_id, "decision");

    const success: TransitionSuccess = {
      ticket: publicTicket(row, actor),
      event,
    };
    if (idempotency_key) {
      this.data.idempotencySet(
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
    if (
      row.decision_class === "proposal" &&
      params.actor &&
      !executorCanReadTicket(params.actor, row)
    ) {
      return err("NOT_FOUND", "Ticket not found.");
    }
    const result: GetTicketResult = {
      ticket: publicTicket(row, params.actor),
    };
    if (params.include_events) {
      result.events = [...this.data.getEvents(row.id)];
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
    if (query.task_class) {
      rows = rows.filter((r) => r.task_class === query.task_class);
    }
    if (query.requires_review !== undefined) {
      rows = rows.filter((r) => r.requires_review === query.requires_review);
    }
    if (query.reviewed === true) {
      rows = rows.filter((r) => r.reviewed_at != null);
    } else if (query.reviewed === false) {
      rows = rows.filter((r) => !r.reviewed_at);
    }
    if (query.decision_class) {
      rows = rows.filter(
        (r) => (r.decision_class ?? "question") === query.decision_class,
      );
    }
    if (query.proposal_type) {
      rows = rows.filter((r) => r.proposal_type === query.proposal_type);
    }
    if (query.mine && query.actor?.api_key_id) {
      rows = rows.filter(
        (r) => r.proposer_api_key_id === query.actor?.api_key_id,
      );
    }
    if (query.actor) {
      rows = rows.filter((r) => {
        if (r.decision_class === "proposal") {
          return executorCanReadTicket(query.actor!, r);
        }
        return true;
      });
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

    const actor = query.actor;
    return {
      ok: true,
      value: {
        tickets: page.map((r) => publicTicket(r, actor)),
        next_cursor: next,
      },
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
      charter_patch,
      override_precheck,
      review_outcome,
    } = params;

    if (idempotency_key) {
      const cached = this.data.idempotencyGet(
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

    if (verb === "ticket_claim" || verb === "ticket_extend") {
      this.clearExpiredLease(row);
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
    let epicPrecheck:
      | { ok: boolean; violations: { code: string; message: string }[] }
      | undefined;

    if (
      verb === "ticket_approve" &&
      row.kind === "epic" &&
      row.status === "proposed"
    ) {
      const mandateRow = row.mandate_id
        ? this.mandateRow(client_id, row.mandate_id)
        : undefined;
      const mandate_status =
        (mandateRow?.status as MandateStatus) ?? "draft";
      epicPrecheck = precheckEpic({
        function: row.function,
        risk_tier: row.risk_tier,
        charter,
        counters: serverCounters ? this.countersFor(row) : EMPTY_COUNTERS,
        mandate_status,
      });
      if (
        isIntegrator(actor) &&
        !epicPrecheck.ok
      ) {
        return err(
          "PRECHECK_FAILED",
          "Integrator epic approval requires a passing pre-check.",
          { violations: epicPrecheck.violations },
        );
      }
      if (
        isFounder(actor) &&
        !epicPrecheck.ok &&
        !override_precheck
      ) {
        return err(
          "PRECHECK_FAILED",
          "Founder epic approval with failing pre-check requires override_precheck.",
          { violations: epicPrecheck.violations },
        );
      }
    }

    const createEvent = this.data
      .getEvents(row.id)
      .find((e) => e.verb === "ticket_create");

    const input = buildTransitionInput(row, charter, verb, actor, {
      progress_target,
      soft_observations,
      open_children_count: open_children,
      counters: serverCounters ? this.countersFor(row) : undefined,
      mandate_status: mandateStatusOf(row),
      mandate_id: mandateIdOf(row),
      epic_precheck: epicPrecheck,
      charter_patch,
      ticket_function: row.function,
      risk_tier: row.risk_tier,
      override_precheck,
      review_outcome,
      creator_api_key_id: createEvent?.actor.api_key_id,
      decision_class: row.decision_class,
      proposal_type: row.proposal_type,
      proposer_api_key_id: row.proposer_api_key_id,
      proposal_resolve_outcome: params.proposal_resolve_outcome,
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

    if (verb === "ticket_update_charter" && charter_patch && row.charter) {
      const applied = applyCharterPatch(actor, row.charter, charter_patch);
      if (!applied.ok) {
        return err(applied.code, applied.message);
      }
      row.charter = applied.charter;
      const tsCharter = nowIso();
      row.version += 1;
      row.updated_at = tsCharter;
      this.data.setStored(row);
      const charterEvent = this.appendEvent(row, {
        ticket_id: row.id,
        actor,
        verb,
        from_status: row.status,
        to_status: row.status,
        payload: {
          event_kind: "charter_changed",
          diff: applied.diff,
        },
        at: tsCharter,
      });
      const successCharter: TransitionSuccess = {
        ticket: publicTicket(row),
        event: charterEvent,
      };
      if (idempotency_key) {
        this.data.idempotencySet(
          idempotencyKey(client_id, verb, idempotency_key),
          successCharter,
        );
      }
      return { ok: true, value: successCharter };
    }

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

    if (verb === "ticket_review" && review_outcome) {
      row.reviewed_at = ts;
      row.reviewed_by = actor;
      row.review_outcome = review_outcome;
    }

    if (verb === "ticket_resolve" && params.proposal_resolve_outcome) {
      row.proposal_outcome = params.proposal_resolve_outcome;
      row.proposal_response = params.proposal_response;
      row.result_refs = params.result_refs;
    }

    if (row.kind === "mandate" && decision.to_status) {
      row.mandate_status = decision.to_status as MandateStatus;
      this.syncSubtreeMandateStatus(
        client_id,
        row.id,
        decision.to_status as MandateStatus,
      );
    }

    this.data.setStored(row);

    const payloadBase =
      comment !== undefined
        ? { comment }
        : params.payload ?? {};

    const payload =
      verb === "ticket_approve" && row.kind === "epic" && epicPrecheck
        ? {
            ...payloadBase,
            precheck: epicPrecheck,
            ...(override_precheck && isFounder(actor)
              ? { override_precheck: true }
              : {}),
          }
        : verb === "ticket_review" && review_outcome
          ? {
              ...payloadBase,
              event_kind: "reviewed",
              review_outcome,
            }
          : verb === "ticket_resolve" && params.proposal_resolve_outcome
            ? {
                ...payloadBase,
                event_kind: "proposal_resolved",
                outcome: params.proposal_resolve_outcome,
                response: params.proposal_response,
                result_refs: params.result_refs,
              }
            : payloadBase;

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

    const success: TransitionSuccess = {
      ticket: publicTicket(row),
      event,
      ...(epicPrecheck ? { precheck: epicPrecheck } : {}),
    };
    if (idempotency_key) {
      this.data.idempotencySet(
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
      for (const ev of this.data.getEvents(t.id)) {
        if (!last_activity_at || ev.at > last_activity_at) {
          last_activity_at = ev.at;
        }
      }
    }

    const { total: open_exception_tasks } = countOpenExceptionsInSubtree(
      mandate_id,
      subtree,
    );

    return {
      ok: true,
      value: {
        mandate_id,
        counts_by_status: counts,
        open_exception_tasks,
        last_activity_at,
      },
    };
  }
}
