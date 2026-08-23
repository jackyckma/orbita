import { describe, expect, it, vi } from "vitest";
import {
  executeGithubGetFile,
  executeGithubListCommits,
  executeGithubListPullRequests,
  type GithubReadDeps,
} from "./github-read.js";

const GITHUB_TOKEN = "must-not-leak-github-token";

const baseDeps = (): GithubReadDeps => ({
  clientId: "personal-jacky",
  credentialsDb: {} as GithubReadDeps["credentialsDb"],
  secretsKey: "test-secrets-key",
  resolveCredential: async () => GITHUB_TOKEN,
});

function assertNoTokenLeak(...values: unknown[]) {
  for (const value of values) {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    expect(serialized).not.toContain("must-not-leak");
  }
}

function fetchInputUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

describe("github read tools (github_get_file / github_list_commits / github_list_pull_requests)", () => {
  describe("executeGithubGetFile", () => {
    it("returns decoded content and sha on a mocked 200", async () => {
      const githubFetch = vi.fn<typeof fetch>(async (input) => {
        const url = fetchInputUrl(input);
        expect(url).toContain("/contents/README.md");
        expect(url).toContain("ref=main");
        return new Response(
          JSON.stringify({
            content: Buffer.from("hello github").toString("base64"),
            encoding: "base64",
            sha: "file-sha-abc",
          }),
          { status: 200 },
        );
      });

      const result = await executeGithubGetFile(
        { ...baseDeps(), githubFetch },
        { repo: "owner/repo", path: "README.md", ref: "main" },
      );

      expect(result).toMatchObject({
        ok: true,
        path: "README.md",
        ref: "main",
        content: "hello github",
        sha: "file-sha-abc",
      });
      assertNoTokenLeak(result);
    });

    it("returns not_found with a non-empty message on a mocked 404", async () => {
      const githubFetch = vi.fn(async () =>
        new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
      );

      const result = await executeGithubGetFile(
        { ...baseDeps(), githubFetch },
        { repo: "owner/repo", path: "missing.txt", ref: "main" },
      );

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.kind).toBe("not_found");
      expect(result.message).toBeTruthy();
      expect(result.message).not.toBe("");
      assertNoTokenLeak(result);
    });

    it("distinguishes success from not_found in tool results", async () => {
      const successFetch = vi.fn(async () =>
        new Response(
          JSON.stringify({
            content: Buffer.from("present").toString("base64"),
            encoding: "base64",
            sha: "sha-present",
          }),
          { status: 200 },
        ),
      );
      const notFoundFetch = vi.fn(async () =>
        new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
      );

      const success = await executeGithubGetFile(
        { ...baseDeps(), githubFetch: successFetch },
        { repo: "owner/repo", path: "exists.txt", ref: "main" },
      );
      const missing = await executeGithubGetFile(
        { ...baseDeps(), githubFetch: notFoundFetch },
        { repo: "owner/repo", path: "missing.txt", ref: "main" },
      );

      expect(success.ok).toBe(true);
      expect(missing.ok).toBe(false);
      if (success.ok) {
        expect(success.content).toBe("present");
      }
      if (!missing.ok) {
        expect(missing.kind).toBe("not_found");
      }
    });
  });

  describe("executeGithubListCommits", () => {
    it("maps commits and passes limit through as per_page", async () => {
      const githubFetch = vi.fn<typeof fetch>(async (input) => {
        const url = fetchInputUrl(input);
        expect(url).toContain("per_page=25");
        return new Response(
          JSON.stringify([
            {
              sha: "deadbeef",
              commit: {
                message: "First line\nbody",
                author: { name: "Dev Name", date: "2026-01-01T00:00:00Z" },
                committer: { date: "2026-01-02T00:00:00Z" },
              },
              author: { login: "devuser" },
            },
          ]),
          { status: 200 },
        );
      });

      const result = await executeGithubListCommits(
        { ...baseDeps(), githubFetch },
        { repo: "owner/repo", limit: 25 },
      );

      expect(result).toMatchObject({
        ok: true,
        commits: [
          {
            sha: "deadbeef",
            message: "First line",
            author: "devuser",
            date: "2026-01-02T00:00:00Z",
          },
        ],
      });
      assertNoTokenLeak(result);
    });
  });

  describe("executeGithubListPullRequests", () => {
    it("maps draft and branch from head.ref", async () => {
      const githubFetch = vi.fn<typeof fetch>(async (input) => {
        const url = fetchInputUrl(input);
        expect(url).toContain("state=open");
        return new Response(
          JSON.stringify([
            {
              number: 42,
              title: "Add feature",
              draft: true,
              created_at: "2026-01-01T00:00:00Z",
              html_url: "https://github.com/owner/repo/pull/42",
              head: { ref: "feature-branch" },
            },
          ]),
          { status: 200 },
        );
      });

      const result = await executeGithubListPullRequests(
        { ...baseDeps(), githubFetch },
        { repo: "owner/repo" },
      );

      expect(result).toMatchObject({
        ok: true,
        pull_requests: [
          {
            number: 42,
            title: "Add feature",
            branch: "feature-branch",
            draft: true,
          },
        ],
      });
      assertNoTokenLeak(result);
    });

    it("defaults state to open when omitted", async () => {
      const githubFetch = vi.fn<typeof fetch>(async (input) => {
        const url = fetchInputUrl(input);
        expect(url).toContain("state=open");
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const result = await executeGithubListPullRequests(
        { ...baseDeps(), githubFetch },
        { repo: "owner/repo" },
      );

      expect(result).toMatchObject({ ok: true, pull_requests: [] });
      assertNoTokenLeak(result);
    });
  });

  describe("token hygiene", () => {
    it("never surfaces the resolved github_read token in handler results", async () => {
      const githubFetch = vi.fn(async () =>
        new Response(
          JSON.stringify({
            content: Buffer.from("secret-safe").toString("base64"),
            encoding: "base64",
            sha: "sha-1",
          }),
          { status: 200 },
        ),
      );

      const getFile = await executeGithubGetFile(
        { ...baseDeps(), githubFetch },
        { repo: "owner/repo", path: "README.md", ref: "main" },
      );
      const listCommits = await executeGithubListCommits(
        { ...baseDeps(), githubFetch },
        { repo: "owner/repo", limit: 5 },
      );
      const listPulls = await executeGithubListPullRequests(
        { ...baseDeps(), githubFetch },
        { repo: "owner/repo" },
      );

      assertNoTokenLeak(getFile, listCommits, listPulls);
    });
  });
});
