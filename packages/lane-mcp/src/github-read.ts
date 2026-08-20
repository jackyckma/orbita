import { resolveCredentialSecret } from "@orbita/credentials";
import type { CredentialsDb } from "@orbita/credentials";
import { OrbitaError } from "@orbita/platform";

const GITHUB_CREDENTIAL = "github_read";
const USER_AGENT = "orbita-mcp-github-read";

export type GithubReadDeps = {
  clientId: string;
  credentialsDb: CredentialsDb;
  secretsKey: string;
  githubFetch?: typeof fetch;
  resolveCredential?: typeof resolveCredentialSecret;
};

export type GithubReadCredentialMissing = {
  ok: false;
  kind: "credential_missing";
  message: string;
};

export type GithubGetFileSuccess = {
  ok: true;
  path: string;
  ref: string;
  content: string;
  sha: string;
};

export type GithubGetFileNotFound = {
  ok: false;
  kind: "not_found";
  message: string;
};

export type GithubGetFileError = {
  ok: false;
  kind: "github_error";
  message: string;
};

export type GithubGetFileResult =
  | GithubGetFileSuccess
  | GithubGetFileNotFound
  | GithubGetFileError
  | GithubReadCredentialMissing;

export type GithubCommitItem = {
  sha: string;
  message: string;
  author: string | null;
  date: string | null;
};

export type GithubListCommitsSuccess = {
  ok: true;
  commits: GithubCommitItem[];
};

export type GithubListCommitsResult =
  | GithubListCommitsSuccess
  | GithubReadCredentialMissing
  | GithubGetFileError;

export type GithubPullRequestItem = {
  number: number;
  title: string;
  branch: string;
  draft: boolean;
  created_at: string;
  html_url: string;
};

export type GithubListPullRequestsSuccess = {
  ok: true;
  pull_requests: GithubPullRequestItem[];
};

export type GithubListPullRequestsResult =
  | GithubListPullRequestsSuccess
  | GithubReadCredentialMissing
  | GithubGetFileError;

function parseOwnerRepo(repo: string): { owner: string; repo: string } {
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    throw new Error(`Invalid github owner/repo: ${repo}`);
  }
  return { owner, repo: name };
}

async function ghJson<T>(
  url: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<{ status: number; body: T | null; raw: string }> {
  const res = await fetchImpl(url, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": USER_AGENT,
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

async function resolveGithubToken(
  deps: GithubReadDeps,
): Promise<{ ok: true; token: string } | GithubReadCredentialMissing> {
  const resolveCredential = deps.resolveCredential ?? resolveCredentialSecret;
  try {
    const token = await resolveCredential(
      deps.credentialsDb,
      deps.secretsKey,
      deps.clientId,
      GITHUB_CREDENTIAL,
    );
    return { ok: true, token };
  } catch (err) {
    if (err instanceof OrbitaError && err.code === "not_found") {
      return {
        ok: false,
        kind: "credential_missing",
        message: `Missing credential: ${GITHUB_CREDENTIAL}. ${err.message}`,
      };
    }
    throw err;
  }
}

async function resolveDefaultBranch(
  owner: string,
  repo: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const { status, body } = await ghJson<{ default_branch?: string }>(
    `https://api.github.com/repos/${owner}/${repo}`,
    token,
    fetchImpl,
  );
  if (status !== 200 || !body?.default_branch) return null;
  return body.default_branch;
}

export async function executeGithubGetFile(
  deps: GithubReadDeps,
  input: { repo: string; path: string; ref?: string },
): Promise<GithubGetFileResult> {
  const auth = await resolveGithubToken(deps);
  if (!auth.ok) return auth;

  const fetchImpl = deps.githubFetch ?? fetch;
  const { owner, repo } = parseOwnerRepo(input.repo);
  let ref = input.ref;
  if (!ref) {
    ref = (await resolveDefaultBranch(owner, repo, auth.token, fetchImpl)) ?? "main";
  }

  const url =
    `https://api.github.com/repos/${owner}/${repo}/contents/${input.path}` +
    `?ref=${encodeURIComponent(ref)}`;
  const { status, body } = await ghJson<{
    content?: string;
    encoding?: string;
    sha?: string;
    message?: string;
  }>(url, auth.token, fetchImpl);

  if (status === 404) {
    return {
      ok: false,
      kind: "not_found",
      message: `File not found: ${input.repo}/${input.path}@${ref}`,
    };
  }
  if (status !== 200 || !body?.content) {
    return {
      ok: false,
      kind: "github_error",
      message: body?.message ?? `GitHub returned HTTP ${status} for ${input.path}`,
    };
  }

  const content =
    body.encoding === "base64"
      ? Buffer.from(body.content.replace(/\n/g, ""), "base64").toString("utf8")
      : body.content;

  return {
    ok: true,
    path: input.path,
    ref,
    content,
    sha: body.sha ?? "",
  };
}

export async function executeGithubListCommits(
  deps: GithubReadDeps,
  input: { repo: string; branch?: string; limit?: number; since?: string },
): Promise<GithubListCommitsResult> {
  const auth = await resolveGithubToken(deps);
  if (!auth.ok) return auth;

  const fetchImpl = deps.githubFetch ?? fetch;
  const { owner, repo } = parseOwnerRepo(input.repo);
  const limit = input.limit ?? 10;
  const params = new URLSearchParams({ per_page: String(limit) });
  if (input.branch) params.set("sha", input.branch);
  if (input.since) params.set("since", input.since);

  const url = `https://api.github.com/repos/${owner}/${repo}/commits?${params.toString()}`;
  const { status, body } = await ghJson<
    Array<{
      sha?: string;
      commit?: {
        message?: string;
        author?: { name?: string; date?: string };
        committer?: { date?: string };
      };
      author?: { login?: string } | null;
    }>
  >(url, auth.token, fetchImpl);

  if (status !== 200 || !Array.isArray(body)) {
    return {
      ok: false,
      kind: "github_error",
      message: `GitHub returned HTTP ${status} listing commits for ${input.repo}`,
    };
  }

  const commits: GithubCommitItem[] = [];
  for (const item of body) {
    if (!item.sha) continue;
    const fullMessage = item.commit?.message ?? "";
    commits.push({
      sha: item.sha,
      message: fullMessage.split("\n")[0] ?? "",
      author: item.author?.login ?? item.commit?.author?.name ?? null,
      date:
        item.commit?.committer?.date ?? item.commit?.author?.date ?? null,
    });
  }

  return { ok: true, commits };
}

export async function executeGithubListPullRequests(
  deps: GithubReadDeps,
  input: { repo: string; state?: "open" | "closed" | "all" },
): Promise<GithubListPullRequestsResult> {
  const auth = await resolveGithubToken(deps);
  if (!auth.ok) return auth;

  const fetchImpl = deps.githubFetch ?? fetch;
  const { owner, repo } = parseOwnerRepo(input.repo);
  const state = input.state ?? "open";
  const params = new URLSearchParams({ state, per_page: "50" });
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls?${params.toString()}`;
  const { status, body } = await ghJson<
    Array<{
      number?: number;
      title?: string;
      draft?: boolean;
      created_at?: string;
      html_url?: string;
      head?: { ref?: string };
    }>
  >(url, auth.token, fetchImpl);

  if (status !== 200 || !Array.isArray(body)) {
    return {
      ok: false,
      kind: "github_error",
      message: `GitHub returned HTTP ${status} listing pull requests for ${input.repo}`,
    };
  }

  const pull_requests: GithubPullRequestItem[] = [];
  for (const pr of body) {
    if (pr.number == null || !pr.title) continue;
    pull_requests.push({
      number: pr.number,
      title: pr.title,
      branch: pr.head?.ref ?? "",
      draft: pr.draft === true,
      created_at: pr.created_at ?? "",
      html_url: pr.html_url ?? "",
    });
  }

  return { ok: true, pull_requests };
}
