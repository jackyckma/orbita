export type TicketFunction =
  | "dev"
  | "infra"
  | "support"
  | "marketing"
  | "sales"
  | "ops"
  | "research";

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
  | "ticket_cancel"
  | "ticket_update_charter"
  | "ticket_review"
  | "ticket_propose"
  | "ticket_resolve";

export type TaskClass = "planned" | "exception";

export type DecisionClass = "question" | "proposal";

export type ProposalType =
  | "process_change"
  | "task_type_request"
  | "charter_change_request"
  | "access_or_tool_request"
  | "cross_agent_suggestion"
  | "other";

export type ProposalResolveOutcome =
  | "accepted"
  | "declined"
  | "needs_info"
  | "deferred";

export interface ProposalTarget {
  mandate_id?: string;
  ticket_id?: string;
}

export interface TicketInputRef {
  kind: "note" | "url" | "ticket" | "chat";
  ref: string;
  from?: string;
}

export interface ProposalPolicy {
  founder_only_types?: ProposalType[];
}

export type ReviewOutcome = "accepted" | "needs_changes" | "cancel";

export type TicketRole = "founder" | "integrator" | "executor" | "system";

export type RiskTier = "L0" | "L1" | "L2" | "money";

export interface Actor {
  role: TicketRole;
  principal_id?: string;
  api_key_id?: string;
  /** Mandate uuids this executor may operate in (required for ownership checks). */
  mandate_ids?: string[];
}

export interface ExceptionTypeDef {
  type: string;
  description: string;
  auto_approve?: boolean;
  risk_tier_max?: RiskTier;
  max_open?: number;
}

export type EpicApprovalPolicy = "integrator" | "auto_within_tier";
export type TaskApprovalPolicy = "auto" | "integrator";

export interface ApprovalPolicy {
  epics?: EpicApprovalPolicy;
  tasks?: TaskApprovalPolicy;
}

export type HardLimitEnforcement = "server" | "environment" | "instruction";

export interface HardLimit {
  id: string;
  description: string;
  enforcement: HardLimitEnforcement;
  max_open_epics?: number;
  max_open_tasks?: number;
  max_open_exceptions?: number;
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
    max_auto_risk_tier?: RiskTier;
  };
  cadence: { description: string; interval_hours?: number };
  reporting: { expectations: string };
  success_measures: string[];
  review_date: string;
  assigned_principals: string[];
  hard_limits: HardLimit[];
  soft_constraints: SoftConstraint[];
  approval_policy?: ApprovalPolicy;
  exception_types?: ExceptionTypeDef[];
  proposal_policy?: ProposalPolicy;
  /** Hard cap on open proposals (decision_class=proposal) per mandate; default 5. */
  max_open_proposals?: number;
}

/** Snapshot counts for server-enforceable hard_limits (no database). */
export interface MandateCounters {
  open_epics: number;
  open_tasks: number;
  open_exception_tasks: number;
  open_exception_tasks_by_type: Record<string, number>;
  creations_today: number;
  writes_today: number;
}

export type TransitionErrorCode =
  | "GIT_READ_ONLY"
  | "INVALID_TRANSITION"
  | "HUMAN_ACTOR_REQUIRED"
  | "PRIVILEGED_ROLE_REQUIRED"
  | "ROLE_REQUIRED"
  | "PRECHECK_FAILED"
  | "HARD_LIMIT_EXCEEDED"
  | "MANDATE_NOT_ACTIVE"
  | "OUTSIDE_MANDATE"
  | "INVALID_PARENT"
  | "HARD_LIMIT_COUNTERS_MISSING"
  | "SOFT_BLOCK_THRESHOLD_EXCEEDED";

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
  record_soft_breach?: SoftBreachHint[];
}

export interface TransitionAllow {
  allowed: true;
  to_status?: TicketStatus;
  record_soft_breach?: SoftBreachHint[];
}

export type TransitionResult = TransitionDeny | TransitionAllow;

/** Parent ticket snapshot for create-time parent rules. */
export interface ParentTicketRef {
  kind: TicketKind;
  status: TicketStatus;
  mandate_id: string;
}

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
  /** Ancestor mandate lifecycle status (pause gate on subtree tickets). */
  mandate_status?: MandateStatus;
  /** Mandate uuid for this ticket (ownership + pause gate scope). */
  mandate_id?: string;
  /** Parent ticket for ticket_create parent/ownership rules. */
  parent?: ParentTicketRef | null;
  /** Open non-terminal children under an epic (required for executor epic complete). */
  open_children_count?: number;
  /** Epic ticket function (precheck on approve). */
  ticket_function?: TicketFunction;
  risk_tier?: RiskTier;
  /** Epic approve: integrator must pass precheck unless founder overrides. */
  override_precheck?: boolean;
  /** Result of precheckEpic attached to approve allow path. */
  epic_precheck?: { ok: boolean; violations: { code: string; message: string }[] };
  /** Mandate charter patch for ticket_update_charter. */
  charter_patch?: Partial<MandateCharter>;
  task_class?: TaskClass;
  exception_type?: string;
  requires_review?: boolean;
  reviewed_at?: string | null;
  review_outcome?: ReviewOutcome;
  /** Create-event actor api_key_id — self-review guard for ticket_review. */
  creator_api_key_id?: string;
  decision_class?: DecisionClass;
  proposal_type?: ProposalType;
  target?: ProposalTarget;
  suggested_change?: string;
  rationale?: string;
  proposal_outcome?: ProposalResolveOutcome;
  proposal_response?: string;
  result_refs?: Record<string, unknown>;
  inputs_from?: TicketInputRef[];
  proposer_api_key_id?: string;
  open_proposals_count?: number;
  proposal_resolve_outcome?: ProposalResolveOutcome;
}

export interface InitialStatusInput {
  kind: TicketKind;
  actor: Actor;
  parent?: ParentTicketRef | null;
  charter: MandateCharter;
  risk_tier?: RiskTier;
  task_class?: TaskClass;
  exception_type?: string;
  counters?: MandateCounters;
}

export type InitialStatusResult =
  | {
      ok: true;
      status: TicketStatus;
      mandate_id: string | null;
      task_class?: TaskClass;
      exception_type?: string;
      requires_review?: boolean;
    }
  | {
      ok: false;
      error: {
        code: TransitionErrorCode;
        message: string;
        details?: Record<string, unknown>;
      };
    };
