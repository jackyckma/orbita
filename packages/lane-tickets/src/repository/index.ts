import type {
  Actor,
  MandateCharter,
  MandateCounters,
  MandateStatus,
  ReviewOutcome,
  RiskTier,
  SoftBreachHint,
  TaskClass,
  TicketKind,
  TicketSource,
  TicketStatus,
  TicketVerb,
  TransitionErrorCode,
} from "../types.js";

import type { TicketFunction } from "../types.js";

export type { TicketFunction };

/** Public ticket record (matches contracts/ticket.schema.json). */
export interface TicketRecord {
  id: string;
  client_id: string;
  project: string;
  function: TicketFunction;
  kind: TicketKind;
  parent_id: string | null;
  title: string;
  description?: string;
  status: TicketStatus;
  owner?: string;
  requester?: string;
  priority?: number;
  next_action?: string;
  blocked_on?: string;
  risk_tier?: RiskTier;
  source: TicketSource;
  source_ref?: string;
  git_ref?: string;
  synced_at?: string;
  sync_state?: "confirmed" | "pending-sync" | "drift";
  version: number;
  lease_holder: string | null;
  lease_expires_at: string | null;
  charter?: MandateCharter;
  acceptance_criteria?: string[];
  data?: Record<string, unknown>;
  task_class?: TaskClass;
  exception_type?: string;
  requires_review?: boolean;
  reviewed_at?: string | null;
  reviewed_by?: Actor | null;
  review_outcome?: ReviewOutcome | null;
  created_at: string;
  updated_at: string;
}

/** Persistence row: denormalized mandate fields for transition engine inputs. */
export interface StoredTicket extends TicketRecord {
  mandate_id: string | null;
  mandate_status: MandateStatus | null;
  mandate_counters: MandateCounters;
}

export interface TicketEventRecord {
  id: string;
  ticket_id: string;
  client_id: string;
  seq: number;
  actor: Actor;
  verb: TicketVerb;
  from_status: string | null;
  to_status: string | null;
  payload?: Record<string, unknown>;
  at: string;
}

export interface RepositoryError {
  code:
    | TransitionErrorCode
    | "NOT_FOUND"
    | "VERSION_CONFLICT"
    | "IDEMPOTENCY_REPLAY"
    | "LEASE_CONFLICT";
  message: string;
  details?: Record<string, unknown>;
}

export type RepositoryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: RepositoryError };

export interface ListTicketsFilter {
  project?: string;
  function?: TicketFunction;
  status?: TicketStatus;
  owner?: string;
  updated_since?: string;
  task_class?: TaskClass;
  requires_review?: boolean;
  /** When true, only tickets with reviewed_at set; when false, only unreviewed. */
  reviewed?: boolean;
}

export interface ListTicketsQuery extends ListTicketsFilter {
  client_id: string;
  limit?: number;
  cursor?: string | null;
}

export interface ListTicketsResult {
  tickets: TicketRecord[];
  next_cursor: string | null;
}

export interface CreateTicketBody {
  project: string;
  function: TicketFunction;
  kind: TicketKind;
  parent_id?: string | null;
  title: string;
  description?: string;
  owner?: string;
  requester?: string;
  priority?: number;
  risk_tier?: RiskTier;
  charter?: MandateCharter;
  acceptance_criteria?: string[];
  data?: Record<string, unknown>;
  source?: TicketSource;
  git_ref?: string;
  task_class?: TaskClass;
  exception_type?: string;
}

export interface CreateTicketParams {
  client_id: string;
  ticket: CreateTicketBody;
  actor: Actor;
  idempotency_key?: string;
  soft_observations?: Record<string, number>;
}

export interface GetTicketParams {
  client_id: string;
  ticket_id: string;
  include_events?: boolean;
}

export interface GetTicketResult {
  ticket: TicketRecord;
  events?: TicketEventRecord[];
}

export interface TransitionParams {
  client_id: string;
  ticket_id: string;
  verb: TicketVerb;
  actor: Actor;
  expected_version?: number;
  idempotency_key?: string;
  progress_target?: TicketStatus;
  lease_seconds?: number;
  lease_holder?: string;
  comment?: string;
  blocked_on?: string;
  soft_observations?: Record<string, number>;
  payload?: Record<string, unknown>;
  charter_patch?: Partial<MandateCharter>;
  override_precheck?: boolean;
  review_outcome?: ReviewOutcome;
}

export interface TransitionSuccess {
  ticket: TicketRecord;
  event: TicketEventRecord;
  replayed?: boolean;
  precheck?: { ok: boolean; violations: { code: string; message: string }[] };
}

export interface MandateSubtreeHealth {
  mandate_id: string;
  counts_by_status: Record<string, number>;
  open_exception_tasks: number;
  last_activity_at: string | null;
}

export interface TicketRepository {
  create(params: CreateTicketParams): Promise<RepositoryResult<TransitionSuccess>>;

  get(params: GetTicketParams): Promise<RepositoryResult<GetTicketResult>>;

  list(query: ListTicketsQuery): Promise<RepositoryResult<ListTicketsResult>>;

  transition(params: TransitionParams): Promise<RepositoryResult<TransitionSuccess>>;

  /** Mandate health signal: status histogram + latest event timestamp in subtree. */
  getMandateSubtreeHealth(
    client_id: string,
    mandate_id: string,
  ): Promise<RepositoryResult<MandateSubtreeHealth>>;
}

export type { SoftBreachHint };
