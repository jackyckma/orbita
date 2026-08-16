import type {
  AutopilotBacklog,
  AutopilotDecisionsFile,
  AutopilotLocks,
  AutopilotPauseState,
  FetchedAutopilotFiles,
  GithubCommit,
  PortfolioProject,
} from "./types.js";
import { isLikelyPrivateRepo } from "./registry.js";

export type GithubFetchResult =
  | {
      ok: true;
      sourceSha: string;
      files: FetchedAutopilotFiles;
      commits: GithubCommit[];
      privateRepo: boolean;
    }
  | {
      ok: false;
      error: string;
      sourceSha: string | null;
      privateRepo: boolean;
    };

export type GithubFetcherDeps = {
  token: string;
  fetchImpl?: typeof fetch;
  userAgent?: string;
};

function parseOwnerRepo(github: string): { owner: string; repo: string } {
  const [owner, repo] = github.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid github owner/repo: ${github}`);
  }
  return { owner, repo };
}

async function ghJson<T>(
  url: string,
  token: string,
  fetchImpl: typeof fetch,
  userAgent: string,
): Promise<{ status: number; body: T | null; raw: string }> {
  const res = await fetchImpl(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": userAgent,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await res.text();
  if (!raw) return { status: res.status, body: null, raw };
  try {
    return { status: res.status, body: JSON.parse(raw) as T, raw };
  } catch {
    return { status: res.status, body: null, raw };
  }
}

type ContentResponse = {
  content?: string;
  encoding?: string;
  sha?: string;
  message?: string;
};

async function fetchFileJson(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  deps: Required<GithubFetcherDeps>,
): Promise<{ status: number; json: unknown | null; missing: boolean }> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;
  const { status, body } = await ghJson<ContentResponse>(
    url,
    deps.token,
    deps.fetchImpl,
    deps.userAgent,
  );
  if (status === 404) return { status, json: null, missing: true };
  if (status !== 200 || !body?.content) {
    return { status, json: null, missing: false };
  }
  const decoded =
    body.encoding === "base64"
      ? Buffer.from(body.content.replace(/\n/g, ""), "base64").toString("utf8")
      : body.content;
  try {
    return { status, json: JSON.parse(decoded), missing: false };
  } catch {
    return { status, json: null, missing: false };
  }
}

/**
 * Read autopilot state + recent commits for one registry project (read-only).
 * A 404 on a registered private repo is a FAILURE, never an empty report.
 */
export async function fetchProjectAutopilotFromGithub(
  project: PortfolioProject,
  period: { since: string; until: string },
  deps: GithubFetcherDeps,
): Promise<GithubFetchResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const userAgent = deps.userAgent ?? "orbita-portfolio-git-collector";
  const fullDeps = { token: deps.token, fetchImpl, userAgent };
  const { owner, repo } = parseOwnerRepo(project.github);
  const branch = project.github_default_branch || "main";
  const likelyPrivate = isLikelyPrivateRepo(project);

  const repoMeta = await ghJson<{ private?: boolean; default_branch?: string }>(
    `https://api.github.com/repos/${owner}/${repo}`,
    deps.token,
    fetchImpl,
    userAgent,
  );

  if (repoMeta.status === 404) {
    return {
      ok: false,
      error: `GitHub 404 for registered repo ${project.github} — treat as collector FAILURE (lost access or missing repo), not an empty report`,
      sourceSha: null,
      privateRepo: likelyPrivate,
    };
  }
  if (repoMeta.status === 401 || repoMeta.status === 403) {
    return {
      ok: false,
      error: `GitHub ${repoMeta.status} for ${project.github} — credential cannot read this repo`,
      sourceSha: null,
      privateRepo: likelyPrivate,
    };
  }

  const privateRepo = repoMeta.body?.private === true || likelyPrivate;

  const refMeta = await ghJson<{ object?: { sha?: string } }>(
    `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    deps.token,
    fetchImpl,
    userAgent,
  );
  const sourceSha = refMeta.body?.object?.sha ?? null;
  if (!sourceSha) {
    return {
      ok: false,
      error: `Could not resolve head sha for ${project.github}@${branch}`,
      sourceSha: null,
      privateRepo,
    };
  }

  const requiredPaths = [
    "docs/autopilot/backlog.json",
    "docs/autopilot/roadmap.json",
    "docs/autopilot/locks.json",
    "docs/autopilot/pause-state.json",
  ] as const;
  const optionalPaths = [
    "docs/autopilot/reports/latest.json",
    "docs/autopilot/decisions.json",
  ] as const;

  const missingOptional: string[] = [];
  const files: FetchedAutopilotFiles = {
    backlog: null,
    roadmap: null,
    locks: null,
    pauseState: null,
    decisions: null,
    latestReport: null,
    missingOptional,
  };

  for (const path of requiredPaths) {
    const got = await fetchFileJson(owner, repo, path, branch, fullDeps);
    if (got.missing) {
      if (privateRepo) {
        return {
          ok: false,
          error: `GitHub 404 for ${path} on private repo ${project.github} — FAILURE (do not emit empty report)`,
          sourceSha,
          privateRepo,
        };
      }
      missingOptional.push(path);
      continue;
    }
    if (got.status !== 200) {
      return {
        ok: false,
        error: `GitHub ${got.status} reading ${path} on ${project.github}`,
        sourceSha,
        privateRepo,
      };
    }
    if (path.endsWith("backlog.json")) files.backlog = got.json as AutopilotBacklog;
    else if (path.endsWith("roadmap.json")) files.roadmap = got.json;
    else if (path.endsWith("locks.json")) files.locks = got.json as AutopilotLocks;
    else if (path.endsWith("pause-state.json")) {
      files.pauseState = got.json as AutopilotPauseState;
    }
  }

  for (const path of optionalPaths) {
    const got = await fetchFileJson(owner, repo, path, branch, fullDeps);
    if (got.missing || got.status !== 200) {
      missingOptional.push(path);
      continue;
    }
    if (path.endsWith("latest.json")) files.latestReport = got.json;
    else if (path.endsWith("decisions.json")) {
      files.decisions = got.json as AutopilotDecisionsFile;
    }
  }

  const since = new Date(period.since).toISOString();
  const until = new Date(period.until).toISOString();
  const commitsUrl =
    `https://api.github.com/repos/${owner}/${repo}/commits` +
    `?sha=${encodeURIComponent(branch)}` +
    `&since=${encodeURIComponent(since)}` +
    `&until=${encodeURIComponent(until)}` +
    `&per_page=100`;
  const commitsRes = await ghJson<
    Array<{
      sha?: string;
      commit?: { message?: string; committer?: { date?: string }; author?: { date?: string } };
    }>
  >(commitsUrl, deps.token, fetchImpl, userAgent);

  const commits: GithubCommit[] = [];
  if (commitsRes.status === 200 && Array.isArray(commitsRes.body)) {
    for (const c of commitsRes.body) {
      if (!c.sha) continue;
      commits.push({
        sha: c.sha,
        message: c.commit?.message ?? "",
        date:
          c.commit?.committer?.date ?? c.commit?.author?.date ?? null,
      });
    }
  }

  return {
    ok: true,
    sourceSha,
    files,
    commits,
    privateRepo,
  };
}
