import { describe, expect, it } from "vitest";
import { normalizeRepoReport, extractTaskIds, reportToNoteBody } from "./normalize.js";
import type { FetchedAutopilotFiles } from "./types.js";

const emptyFiles = (): FetchedAutopilotFiles => ({
  backlog: { tasks: [] },
  roadmap: {},
  locks: { locks: {} },
  pauseState: { paused: false },
  decisions: { decisions: [] },
  latestReport: null,
  missingOptional: [],
});

describe("extractTaskIds", () => {
  it("finds T-xxxx ids", () => {
    expect(extractTaskIds("Merge T-0051 and fix T-0040")).toEqual([
      "T-0051",
      "T-0040",
    ]);
  });
});

describe("normalizeRepoReport", () => {
  it("sets edge repo and schema 1.1", () => {
    const report = normalizeRepoReport({
      project: "orbita",
      period: { since: "2026-08-12T00:00:00Z", until: "2026-08-13T00:00:00Z" },
      generatedAt: "2026-08-13T01:00:00Z",
      sourceSha: "abc123",
      files: emptyFiles(),
      commits: [],
      previousAsk: null,
    });
    expect(report.edge).toBe("repo");
    expect(report.schema_version).toBe("1.1");
    expect(report.status).toBe("ok");
    expect(report.sections).toHaveLength(6);
    expect(report.sections.map((s) => s.id)).toEqual([
      "intent_vs_actual",
      "shipped",
      "needs_founder",
      "autopilot",
      "risks",
      "ask",
    ]);
    expect(report.sections.find((s) => s.id === "intent_vs_actual")?.body).toBe(
      "none",
    );
  });

  it("surfaces fetchError as failed, never empty success", () => {
    const report = normalizeRepoReport({
      project: "powerhouse",
      period: { since: "2026-08-12T00:00:00Z", until: "2026-08-13T00:00:00Z" },
      generatedAt: "2026-08-13T01:00:00Z",
      sourceSha: null,
      files: emptyFiles(),
      commits: [],
      previousAsk: null,
      fetchError: "GitHub 404 for registered private repo",
    });
    expect(report.status).toBe("failed");
    expect(report.edge).toBe("repo");
    expect(report.error).toMatch(/404/);
    expect(report.sections.find((s) => s.id === "ask")?.body).not.toBe("none");
  });

  it("derives shipped + needs_founder + risks from backlog and commits", () => {
    const files = emptyFiles();
    files.backlog = {
      tasks: [
        {
          id: "T-0001",
          title: "Done thing",
          status: "done",
          retries: 0,
          feedback: [],
        },
        {
          id: "T-0002",
          title: "Needs you",
          status: "needs_human",
          retries: 0,
          feedback: [],
        },
        {
          id: "T-0003",
          title: "Flaky",
          status: "ready",
          retries: 2,
          feedback: [],
        },
        {
          id: "T-0004",
          title: "Idle ready",
          status: "ready",
          retries: 0,
          feedback: [],
        },
      ],
    };
    files.locks = {
      locks: {
        "T-0099": { by: "maker", since: "2026-08-13T00:00:00Z", branch: null, pr: null },
      },
    };
    files.pauseState = { paused: true, by: "founder" };
    files.decisions = {
      decisions: [{ id: "D-009", status: "open", title: "Pick a color" }],
    };

    const report = normalizeRepoReport({
      project: "orbita",
      period: { since: "2026-08-12T00:00:00Z", until: "2026-08-13T00:00:00Z" },
      generatedAt: "2026-08-13T01:00:00Z",
      sourceSha: "deadbeef",
      files,
      commits: [
        {
          sha: "111aaaa",
          message: "feat: land T-0001\n\nCo-authored-by: bot",
          date: "2026-08-12T12:00:00Z",
        },
      ],
      previousAsk: "Unblock T-0001: Done thing",
    });

    const shipped = report.sections.find((s) => s.id === "shipped")!.body;
    expect(shipped).toContain("T-0001");
    expect(shipped).toContain("111aaaa");

    const needs = report.sections.find((s) => s.id === "needs_founder")!.body;
    expect(needs).toContain("T-0002");
    expect(needs).toContain("D-009");

    const auto = report.sections.find((s) => s.id === "autopilot")!.body;
    expect(auto).toContain("needs_human=1");
    expect(auto).toContain("T-0099");
    expect(auto).toMatch(/pause-state: set/);

    const risks = report.sections.find((s) => s.id === "risks")!.body;
    expect(risks).toContain("retries=2");
    expect(risks).toContain("T-0004");

    const ask = report.sections.find((s) => s.id === "ask")!.body;
    expect(ask).toContain("T-0002");

    const intent = report.sections.find((s) => s.id === "intent_vs_actual")!.body;
    expect(intent).toContain("Matched");
    expect(intent).toContain("T-0001");

    const body = reportToNoteBody(report);
    expect(body).toContain('edge":"repo"');
    expect(body).toContain("schema_version: 1.1");
  });
});
