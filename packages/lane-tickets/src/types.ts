export type TicketKind = "mandate" | "epic" | "task" | "decision";

export type TicketSource = "native" | "git";

export type MandateStatus = "draft" | "active" | "paused" | "retired";

export type EpicStatus =
  | "proposed"
  | "approved"
  | "active"
  | "done"
  | "cancelled";

export type WorkStatus =
  | "proposed"
  | "approved"
  | "claimed"
  | "in_progress"
  | "in_review"
  | "done"
  | "waiting_human"
  | "blocked"
  | "cancelled";

export type TicketStatus = MandateStatus | EpicStatus | WorkStatus;

export type TicketVerb =
  | "ticket_create"
  | "ticket_list"
  | "ticket_get"
  | "ticket_approve"
  | "ticket_claim"
  | "ticket_extend"
  | "ticket_progress"
  | "ticket_complete"
  | "ticket_block"
  | "ticket_request_decision"
  | "ticket_comment"
  | "ticket_cancel";

export type ActorType = "human" | "agent" | "system";

export interface Actor {
  type: ActorType;
  principal_id?: string;
  api_key_id?: string;
}

export type HardLimitEnforcement = "server" | "environment" | "instruction";

export interface HardLimit {
  id: string;
  description: string;
  enforcement: HardLimitEnforcement;
  max_open_epics?: number;
  max_open_tasks?: number;
  max_creations_per_day?: number;
  max_writes_per_day?: number;
  authority_boundary?: string;
}

export type SoftConstraintMetric =
  | "time_split"
  | "effort_split"
  | "cadence_target"
  | "quality_target"
  | "effort_budget"
  | "exploration_share";

export interface SoftConstraint {
  id: string;
  description: string;
  metric: SoftConstraintMetric;
  warn_threshold?: number;
  block_threshold?: number;
  target_value?: number;
  unit?: string;
}

export interface MandateCharter {
  purpose: string;
  principles: string[];
  guardrails: {
    allowed_action_categories: string[];
    forbidden_action_categories: string[];
    effort_budget_notes?: string;
    spend_budget_notes?: string;
  };
  cadence: { description: string; interval_hours?: number };
  reporting: { expectations: string };
  success_measures: string[];
  review_date: string;
  assigned_principals: string[];
  hard_limits: HardLimit[];
  soft_constraints: SoftConstraint[];
}

/** Snapshot counts for server-enforceable hard_limits (no database). */
export interface MandateCounters {
  open_epics: number;
  open_tasks: number;
  creations_today: number;
  writes_today: number;
}

export type TransitionErrorCode =
  | "GIT_READ_ONLY"
  | "INVALID_TRANSITION"
  | "HUMAN_ACTOR_REQUIRED"
  | "HARD_LIMIT_EXCEEDED";

export interface SoftBreachHint {
  event_kind: "soft_breach";
  constraint_id: string;
  metric: SoftConstraintMetric;
  observed_value: number;
  threshold_kind: "warn" | "block";
  target_value?: number;
}

export interface TransitionDeny {
  allowed: false;
  error: {
    code: TransitionErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface TransitionAllow {
  allowed: true;
  to_status?: TicketStatus;
  record_soft_breach?: SoftBreachHint[];
}

export type TransitionResult = TransitionDeny | TransitionAllow;

export interface TransitionInput {
  kind: TicketKind;
  status: TicketStatus;
  verb: TicketVerb;
  actor: Actor;
  source: TicketSource;
  git_ref?: string;
  charter: MandateCharter;
  counters?: MandateCounters;
  /** Observed values per soft_constraint id (for breach hints). */
  soft_observations?: Record<string, number>;
  /** Required for ticket_create hard-limit checks. */
  create_kind?: TicketKind;
  /**
   * Disambiguates ticket_progress on work tickets (claimed→in_progress vs in_progress→in_review)
   * and mandate retire (progress_target=retired).
   */
  progress_target?: TicketStatus;
}
