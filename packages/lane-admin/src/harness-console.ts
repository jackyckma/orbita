/** Pure helpers mirrored in public/admin.js for the Harnesses section. */

export function harnessEnabledLabel(enabled: boolean): "Enabled" | "Paused" {
  return enabled ? "Enabled" : "Paused";
}

export function harnessToggleActionLabel(enabled: boolean): "Pause" | "Resume" {
  return enabled ? "Pause" : "Resume";
}

export function harnessHelpLines(): [string, string, string] {
  return [
    "Scheduled agent runs (harnesses) that Orbita starts on a cron for each tenant.",
    "Check here when a tenant’s scheduled job should be running but is not, or when you need to stop Orbita from firing a schedule without deleting the harness.",
    "Pausing stops Orbita from starting this scheduled agent run. It does not stop a manual trigger by the tenant and does not change anything outside Orbita.",
  ];
}

export type HarnessRowView = {
  id: string;
  client_id: string;
  name: string;
  enabled: boolean;
  cron: string | null;
  timezone: string;
  next_run_at: string | null;
  latest_run: { status: string; started_at: string; finished_at: string | null } | null;
};

export function formatHarnessSchedule(cron: string | null, timezone: string): string {
  if (!cron) return "—";
  return `${cron} (${timezone})`;
}

export function formatLastRunSummary(
  latest: HarnessRowView["latest_run"],
): string {
  if (!latest) return "—";
  const when = latest.finished_at ?? latest.started_at;
  return `${latest.status} @ ${when}`;
}
