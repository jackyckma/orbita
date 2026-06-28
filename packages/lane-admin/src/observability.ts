import type { AdminDb } from "./settings.js";

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

export type UsagePeriodStats = {
  sessions_created: number;
  assistant_turns: number;
  messages: number;
  tool_calls: number;
  token_estimate: number;
  failover_turns: number;
};

export type UsageSummary = {
  generated_at: string;
  periods: {
    hours_24: UsagePeriodStats;
    days_7: UsagePeriodStats;
    all: UsagePeriodStats;
  };
  top_clients: Array<{
    client_id: string;
    session_count: number;
    message_count: number;
  }>;
  providers: Array<{ provider: string; turn_count: number }>;
  scheduler: { enabled_jobs: number; total_jobs: number };
  waitlist: { pending: number; approved: number; rejected: number };
};

export type AdminSessionRow = {
  id: string;
  client_id: string;
  agent_profile_id: string;
  status: string;
  token_count_estimate: number;
  message_count: number;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
};

async function loadPeriodStats(
  adminDb: AdminDb,
  since: Date | null,
): Promise<UsagePeriodStats> {
  const sinceIso = since?.toISOString();
  const sessionFilter = sinceIso
    ? adminDb.sql`AND created_at >= ${sinceIso}::timestamptz`
    : adminDb.sql``;
  const messageFilter = sinceIso
    ? adminDb.sql`AND created_at >= ${sinceIso}::timestamptz`
    : adminDb.sql``;
  const trajectoryFilter = sinceIso
    ? adminDb.sql`AND created_at >= ${sinceIso}::timestamptz`
    : adminDb.sql``;

  const [sessionRow] = await adminDb.sql<{ sessions_created: number }[]>`
    SELECT COUNT(*)::int AS sessions_created
    FROM sessions
    WHERE true ${sessionFilter}
  `;

  const [messageRow] = await adminDb.sql<{
    messages: number;
    assistant_turns: number;
    token_estimate: number;
    failover_turns: number;
  }[]>`
    SELECT COUNT(*)::int AS messages,
           COUNT(*) FILTER (WHERE role = 'assistant')::int AS assistant_turns,
           COALESCE(SUM(
             CASE
               WHEN execution_meta IS NOT NULL
                 AND (execution_meta->>'token_count_estimate') ~ '^[0-9]+$'
               THEN (execution_meta->>'token_count_estimate')::bigint
               ELSE 0
             END
           ), 0)::int AS token_estimate,
           COUNT(*) FILTER (
             WHERE role = 'assistant'
               AND execution_meta IS NOT NULL
               AND (execution_meta->>'failover_occurred')::boolean IS TRUE
           )::int AS failover_turns
    FROM messages
    WHERE true ${messageFilter}
  `;

  const [trajectoryRow] = await adminDb.sql<{ tool_calls: number }[]>`
    SELECT COUNT(*)::int AS tool_calls
    FROM trajectory_events
    WHERE event_type = 'tool_call_complete' ${trajectoryFilter}
  `;

  return {
    sessions_created: sessionRow?.sessions_created ?? 0,
    messages: messageRow?.messages ?? 0,
    assistant_turns: messageRow?.assistant_turns ?? 0,
    token_estimate: messageRow?.token_estimate ?? 0,
    failover_turns: messageRow?.failover_turns ?? 0,
    tool_calls: trajectoryRow?.tool_calls ?? 0,
  };
}

export async function getUsageSummary(adminDb: AdminDb): Promise<UsageSummary> {
  const now = Date.now();
  const hours24 = new Date(now - 24 * 60 * 60 * 1000);
  const days7 = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const [hours_24, days_7, all] = await Promise.all([
    loadPeriodStats(adminDb, hours24),
    loadPeriodStats(adminDb, days7),
    loadPeriodStats(adminDb, null),
  ]);

  const top_clients = await adminDb.sql<
    { client_id: string; session_count: number; message_count: number }[]
  >`
    SELECT s.client_id,
           COUNT(DISTINCT s.id)::int AS session_count,
           COUNT(m.id)::int AS message_count
    FROM sessions s
    LEFT JOIN messages m ON m.session_id = s.id
    GROUP BY s.client_id
    ORDER BY session_count DESC, message_count DESC
    LIMIT 15
  `;

  const providers = await adminDb.sql<{ provider: string; turn_count: number }[]>`
    SELECT COALESCE(execution_meta->>'provider', 'unknown') AS provider,
           COUNT(*)::int AS turn_count
    FROM messages
    WHERE role = 'assistant' AND execution_meta IS NOT NULL
    GROUP BY provider
    ORDER BY turn_count DESC
  `;

  let scheduler = { enabled_jobs: 0, total_jobs: 0 };
  try {
    const [row] = await adminDb.sql<{ enabled_jobs: number; total_jobs: number }[]>`
      SELECT COUNT(*) FILTER (WHERE enabled IS TRUE)::int AS enabled_jobs,
             COUNT(*)::int AS total_jobs
      FROM session_jobs
    `;
    if (row) scheduler = row;
  } catch {
    // session_jobs may be missing in minimal test DBs
  }

  let waitlist = { pending: 0, approved: 0, rejected: 0 };
  try {
    const rows = await adminDb.sql<{ status: string; count: number }[]>`
      SELECT status, COUNT(*)::int AS count
      FROM waitlist_entries
      GROUP BY status
    `;
    for (const row of rows) {
      if (row.status === "pending") waitlist.pending = row.count;
      if (row.status === "approved") waitlist.approved = row.count;
      if (row.status === "rejected") waitlist.rejected = row.count;
    }
  } catch {
    // waitlist table optional
  }

  return {
    generated_at: new Date().toISOString(),
    periods: { hours_24, days_7, all },
    top_clients,
    providers,
    scheduler,
    waitlist,
  };
}

export type ApiKeyMeteringRow = {
  id: string;
  key_prefix: string;
  allowed_client_ids: string[];
  rate_limit_per_minute: number | null;
  effective_rate_limit_per_minute: number;
  requests_this_minute: number;
  revoked_at: string | null;
  usage_24h: {
    sessions: number;
    messages: number;
    turns: number;
    token_estimate: number;
  };
};

export async function listApiKeyMetering(
  adminDb: AdminDb,
  defaultRateLimitPerMinute: number,
): Promise<ApiKeyMeteringRow[]> {
  const rows = await adminDb.sql<
    {
      id: string;
      key_prefix: string;
      allowed_client_ids: string[];
      rate_limit_per_minute: number | null;
      requests_this_minute: number;
      revoked_at: Date | string | null;
      sessions_24h: number;
      messages_24h: number;
      turns_24h: number;
      token_estimate_24h: number;
    }[]
  >`
    SELECT k.id,
           k.key_prefix,
           k.allowed_client_ids,
           k.rate_limit_per_minute,
           COALESCE(rl.count, 0)::int AS requests_this_minute,
           k.revoked_at,
           COALESCE(stats.sessions_24h, 0)::int AS sessions_24h,
           COALESCE(stats.messages_24h, 0)::int AS messages_24h,
           COALESCE(stats.turns_24h, 0)::int AS turns_24h,
           COALESCE(stats.token_estimate_24h, 0)::int AS token_estimate_24h
    FROM api_keys k
    LEFT JOIN rate_limit_counters rl
      ON rl.key_id = k.id
     AND rl.window_start = date_trunc('minute', now())
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT s.id) FILTER (
               WHERE s.created_at >= now() - interval '24 hours'
             ) AS sessions_24h,
             COUNT(m.id) FILTER (
               WHERE m.created_at >= now() - interval '24 hours'
             ) AS messages_24h,
             COUNT(m.id) FILTER (
               WHERE m.role = 'assistant'
                 AND m.created_at >= now() - interval '24 hours'
             ) AS turns_24h,
             COALESCE(SUM(
               CASE
                 WHEN m.role = 'assistant'
                   AND m.created_at >= now() - interval '24 hours'
                   AND m.execution_meta IS NOT NULL
                   AND (m.execution_meta->>'token_count_estimate') ~ '^[0-9]+$'
                 THEN (m.execution_meta->>'token_count_estimate')::bigint
                 ELSE 0
               END
             ), 0)::int AS token_estimate_24h
      FROM jsonb_array_elements_text(k.allowed_client_ids) AS cid(client_id)
      LEFT JOIN sessions s ON s.client_id = cid.client_id
      LEFT JOIN messages m ON m.session_id = s.id
    ) stats ON true
    ORDER BY k.created_at DESC
    LIMIT 100
  `;

  return rows.map((row) => ({
    id: row.id,
    key_prefix: row.key_prefix,
    allowed_client_ids: row.allowed_client_ids ?? [],
    rate_limit_per_minute: row.rate_limit_per_minute,
    effective_rate_limit_per_minute: row.rate_limit_per_minute ?? defaultRateLimitPerMinute,
    requests_this_minute: row.requests_this_minute,
    revoked_at: toIso(row.revoked_at),
    usage_24h: {
      sessions: row.sessions_24h,
      messages: row.messages_24h,
      turns: row.turns_24h,
      token_estimate: row.token_estimate_24h,
    },
  }));
}

export type AdminSchedulerJobRow = {
  id: string;
  session_id: string;
  client_id: string;
  schedule: string;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  task_kind: string;
};

export async function listAdminSchedulerJobs(
  adminDb: AdminDb,
  input: { limit?: number; enabled?: boolean },
): Promise<AdminSchedulerJobRow[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const enabledFilter =
    input.enabled === undefined
      ? adminDb.sql``
      : adminDb.sql`AND enabled = ${input.enabled}`;

  const rows = await adminDb.sql<
    {
      id: string;
      session_id: string;
      client_id: string;
      every_seconds: number | null;
      cron: string | null;
      enabled: boolean;
      last_run_at: Date | string | null;
      next_run_at: Date | string | null;
      created_at: Date | string;
      task: Record<string, unknown>;
    }[]
  >`
    SELECT id,
           session_id,
           client_id,
           every_seconds,
           cron,
           enabled,
           last_run_at,
           next_run_at,
           created_at,
           task
    FROM session_jobs
    WHERE true ${enabledFilter}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => mapAdminSchedulerJobRow(row));
}

function mapAdminSchedulerJobRow(row: {
  id: string;
  session_id: string;
  client_id: string;
  every_seconds: number | null;
  cron: string | null;
  enabled: boolean;
  last_run_at: Date | string | null;
  next_run_at: Date | string | null;
  created_at: Date | string;
  task: Record<string, unknown>;
}): AdminSchedulerJobRow {
  let schedule = "unknown";
  if (row.cron) schedule = `cron: ${row.cron}`;
  else if (row.every_seconds != null) schedule = `every ${row.every_seconds}s`;

  const taskKind =
    typeof row.task?.kind === "string"
      ? row.task.kind
      : typeof row.task?.type === "string"
        ? row.task.type
        : "job";

  return {
    id: row.id,
    session_id: row.session_id,
    client_id: row.client_id,
    schedule,
    enabled: row.enabled,
    last_run_at: toIso(row.last_run_at),
    next_run_at: toIso(row.next_run_at),
    created_at: toIso(row.created_at)!,
    task_kind: taskKind,
  };
}

export async function patchAdminSchedulerJob(
  adminDb: AdminDb,
  jobId: string,
  patch: { enabled: boolean },
): Promise<AdminSchedulerJobRow | null> {
  const rows = await adminDb.sql<
    {
      id: string;
      session_id: string;
      client_id: string;
      every_seconds: number | null;
      cron: string | null;
      enabled: boolean;
      last_run_at: Date | string | null;
      next_run_at: Date | string | null;
      created_at: Date | string;
      task: Record<string, unknown>;
    }[]
  >`
    UPDATE session_jobs
    SET enabled = ${patch.enabled}
    WHERE id = ${jobId}::uuid
    RETURNING id,
              session_id,
              client_id,
              every_seconds,
              cron,
              enabled,
              last_run_at,
              next_run_at,
              created_at,
              task
  `;
  const row = rows[0];
  if (!row) return null;
  return mapAdminSchedulerJobRow(row);
}

export async function listAdminSessions(
  adminDb: AdminDb,
  input: { limit?: number; client_id?: string; status?: string },
): Promise<AdminSessionRow[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const clientId = input.client_id?.trim();
  const status = input.status?.trim();

  const clientFilter = clientId
    ? adminDb.sql`AND s.client_id = ${clientId}`
    : adminDb.sql``;
  const statusFilter = status ? adminDb.sql`AND s.status = ${status}` : adminDb.sql``;

  const rows = await adminDb.sql<
    {
      id: string;
      client_id: string;
      agent_profile_id: string;
      status: string;
      token_count_estimate: number;
      message_count: number;
      created_at: Date;
      updated_at: Date;
      ended_at: Date | null;
    }[]
  >`
    SELECT s.id,
           s.client_id,
           s.agent_profile_id,
           s.status,
           s.token_count_estimate,
           COUNT(m.id)::int AS message_count,
           s.created_at,
           s.updated_at,
           s.ended_at
    FROM sessions s
    LEFT JOIN messages m ON m.session_id = s.id
    WHERE true ${clientFilter} ${statusFilter}
    GROUP BY s.id
    ORDER BY s.updated_at DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    id: row.id,
    client_id: row.client_id,
    agent_profile_id: row.agent_profile_id,
    status: row.status,
    token_count_estimate: row.token_count_estimate,
    message_count: row.message_count,
    created_at: toIso(row.created_at)!,
    updated_at: toIso(row.updated_at)!,
    ended_at: toIso(row.ended_at),
  }));
}

export async function getAdminSession(
  adminDb: AdminDb,
  sessionId: string,
): Promise<AdminSessionRow | null> {
  const [row] = await adminDb.sql<
    {
      id: string;
      client_id: string;
      agent_profile_id: string;
      status: string;
      token_count_estimate: number;
      message_count: number;
      created_at: Date;
      updated_at: Date;
      ended_at: Date | null;
    }[]
  >`
    SELECT s.id,
           s.client_id,
           s.agent_profile_id,
           s.status,
           s.token_count_estimate,
           COUNT(m.id)::int AS message_count,
           s.created_at,
           s.updated_at,
           s.ended_at
    FROM sessions s
    LEFT JOIN messages m ON m.session_id = s.id
    WHERE s.id = ${sessionId}::uuid
    GROUP BY s.id
  `;
  if (!row) return null;
  return {
    id: row.id,
    client_id: row.client_id,
    agent_profile_id: row.agent_profile_id,
    status: row.status,
    token_count_estimate: row.token_count_estimate,
    message_count: row.message_count,
    created_at: toIso(row.created_at)!,
    updated_at: toIso(row.updated_at)!,
    ended_at: toIso(row.ended_at),
  };
}

export type TrajectoryEventJson = {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export async function listTrajectoryEventsForSession(
  adminDb: AdminDb,
  sessionId: string,
): Promise<TrajectoryEventJson[]> {
  const rows = await adminDb.sql<
    {
      id: string;
      event_type: string;
      payload: Record<string, unknown>;
      created_at: Date;
    }[]
  >`
    SELECT id, event_type, payload, created_at
    FROM trajectory_events
    WHERE session_id = ${sessionId}::uuid
    ORDER BY created_at ASC
  `;
  return rows.map((row) => ({
    id: row.id,
    event_type: row.event_type,
    payload: row.payload,
    created_at: toIso(row.created_at)!,
  }));
}
