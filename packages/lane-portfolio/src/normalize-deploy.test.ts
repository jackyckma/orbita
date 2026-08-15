import { describe, expect, it } from "vitest";
import {
  deployReportToNoteBody,
  normalizeDeployReport,
} from "./normalize-deploy.js";
import type { ZeaburDeployment } from "./types.js";
import { Q_BUILD_LOGS, Q_DEPLOYMENTS, ZEABUR_GRAPHQL_URL } from "./zeabur.js";

function dep(partial: Partial<ZeaburDeployment> & { id: string }): ZeaburDeployment {
  return {
    projectId: "p1",
    serviceId: "s1",
    serviceName: "api",
    environmentId: "e1",
    environmentName: "production",
    status: "RUNNING",
    commitSha: "abcdef1234567890",
    commitMessage: "ship it",
    repoName: "orbita",
    ref: "main",
    createdAt: "2026-08-14T12:00:00Z",
    startedAt: "2026-08-14T12:01:00Z",
    finishedAt: "2026-08-14T12:05:00Z",
    ...partial,
  };
}

describe("normalizeDeployReport", () => {
  it("sets edge deploy and schema 1.1 with commit sha confidence", () => {
    const report = normalizeDeployReport({
      project: "orbita",
      period: { since: "2026-08-14T00:00:00Z", until: "2026-08-15T00:00:00Z" },
      generatedAt: "2026-08-15T01:00:00Z",
      deployments: [dep({ id: "d1" })],
      failedBuildLogs: {},
      previousAsk: null,
      zeaburProjectName: "orbita",
    });
    expect(report.edge).toBe("deploy");
    expect(report.schema_version).toBe("1.1");
    expect(report.status).toBe("ok");
    expect(report.source_sha).toBe("abcdef1234567890");
    expect(report.sha_confidence).toBe("commit");
    expect(report.sections).toHaveLength(6);
    expect(ZEABUR_GRAPHQL_URL).toContain("api.zeabur.com/graphql");
    expect(Q_DEPLOYMENTS).toContain("deployments(serviceID:");
    expect(Q_DEPLOYMENTS).toContain("commitSHA");
    expect(Q_BUILD_LOGS).toContain("buildLogs(deploymentID:");
  });

  it("puts failed builds under risks and needs_founder", () => {
    const report = normalizeDeployReport({
      project: "orbita",
      period: { since: "2026-08-14T00:00:00Z", until: "2026-08-15T00:00:00Z" },
      generatedAt: "2026-08-15T01:00:00Z",
      deployments: [
        dep({ id: "d-fail", status: "FAILED", commitSha: "deadbeef" }),
      ],
      failedBuildLogs: { "d-fail": "npm ERR! build failed" },
      previousAsk: null,
      zeaburProjectName: "orbita",
    });
    expect(report.status).toBe("degraded");
    expect(report.sections.find((s) => s.id === "risks")?.body).toMatch(/FAILED/);
    expect(report.sections.find((s) => s.id === "needs_founder")?.body).toMatch(
      /previous successful build/i,
    );
    expect(report.sections.find((s) => s.id === "ask")?.body).not.toBe("none");
  });

  it("marks timestamp confidence when commitSHA absent", () => {
    const report = normalizeDeployReport({
      project: "powerhouse",
      period: { since: "2026-08-14T00:00:00Z", until: "2026-08-15T00:00:00Z" },
      generatedAt: "2026-08-15T01:00:00Z",
      deployments: [dep({ id: "d2", commitSha: "", status: "RUNNING" })],
      failedBuildLogs: {},
      previousAsk: null,
    });
    expect(report.sha_confidence).toBe("timestamp");
    expect(report.source_sha).toBeNull();
  });

  it("surfaces fetchError as failed", () => {
    const report = normalizeDeployReport({
      project: "ai-business",
      period: { since: "2026-08-14T00:00:00Z", until: "2026-08-15T00:00:00Z" },
      generatedAt: "2026-08-15T01:00:00Z",
      deployments: [],
      failedBuildLogs: {},
      previousAsk: null,
      fetchError: "Zeabur GraphQL HTTP 401",
    });
    expect(report.status).toBe("failed");
    expect(report.error).toMatch(/401/);
    const body = deployReportToNoteBody(report);
    expect(body).toContain('edge: deploy');
    expect(body).toContain("orbita-hub-report-json");
  });
});
