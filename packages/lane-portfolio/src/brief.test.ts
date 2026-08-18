import { describe, expect, it } from "vitest";
import { buildPortfolioBrief } from "./brief.js";
import type { PortfolioReportNote } from "./brief.js";
import type { PortfolioRegistry } from "./types.js";

const registry: PortfolioRegistry = {
  projects: [
    {
      slug: "healthy",
      display_name: "Healthy Project",
      github: "org/healthy",
      github_default_branch: "main",
      zeabur_project_name: "healthy",
      runtime_report_url: null,
      expected_cadence_hours: 24,
      enabled: true,
    },
    {
      slug: "stale-project",
      display_name: "Stale Project",
      github: "org/stale",
      github_default_branch: "main",
      zeabur_project_name: null,
      runtime_report_url: null,
      expected_cadence_hours: 24,
      enabled: true,
    },
    {
      slug: "undeployed",
      display_name: "Undeployed Merge",
      github: "org/undeployed",
      github_default_branch: "main",
      zeabur_project_name: "undeployed",
      runtime_report_url: null,
      expected_cadence_hours: 24,
      enabled: true,
    },
  ],
};

function repoNote(
  project: string,
  updatedAt: string,
  report: Record<string, unknown>,
): PortfolioReportNote {
  return {
    id: `${project}-repo-${updatedAt}`,
    updated_at: updatedAt,
    frontmatter: {
      type: "report",
      project,
      edge: "repo",
      source_sha: typeof report.source_sha === "string" ? report.source_sha : null,
    },
    body: `<!-- orbita-hub-report-json\n${JSON.stringify(report)}\n-->`,
    parsed_report: report,
  };
}

function deployNote(
  project: string,
  updatedAt: string,
  report: Record<string, unknown>,
): PortfolioReportNote {
  return {
    id: `${project}-deploy-${updatedAt}`,
    updated_at: updatedAt,
    frontmatter: {
      type: "report",
      project,
      edge: "deploy",
      source_sha: typeof report.source_sha === "string" ? report.source_sha : null,
    },
    body: `<!-- orbita-hub-report-json\n${JSON.stringify(report)}\n-->`,
    parsed_report: report,
  };
}

describe("buildPortfolioBrief", () => {
  const period = {
    since: "2026-08-17T00:00:00.000Z",
    until: "2026-08-18T12:00:00.000Z",
  };
  const referenceTime = "2026-08-18T12:00:00.000Z";

  it("includes healthy project with fresh repo+deploy lines and no staleness", () => {
    const notes = [
      repoNote("healthy", "2026-08-18T06:00:00.000Z", {
        schema_version: "1.1",
        edge: "repo",
        project: "healthy",
        generated_at: "2026-08-18T06:00:00.000Z",
        status: "ok",
        source_sha: "abc123def456",
        period,
        sections: [
          { id: "shipped", title: "Shipped", body: "- abc123d [T-0001]: feat" },
        ],
      }),
      deployNote("healthy", "2026-08-18T06:30:00.000Z", {
        schema_version: "1.1",
        edge: "deploy",
        project: "healthy",
        generated_at: "2026-08-18T06:30:00.000Z",
        status: "ok",
        source_sha: "abc123def456",
        period,
        sections: [],
      }),
    ];

    const brief = buildPortfolioBrief({
      registry,
      notes,
      period,
      referenceTime,
      projectFilter: "healthy",
    });

    expect(brief.projects).toHaveLength(1);
    const project = brief.projects[0]!;
    expect(project.staleness).toHaveLength(0);
    expect(project.lines.find((l) => l.edge === "repo")?.status).toBe("present");
    expect(project.lines.find((l) => l.edge === "deploy")?.status).toBe("present");
    expect(project.sha_chains.some((c) => c.flags.value.length === 0)).toBe(true);
  });

  it("flags stale project when repo line is overdue", () => {
    const notes = [
      repoNote("stale-project", "2026-08-15T06:00:00.000Z", {
        schema_version: "1.1",
        edge: "repo",
        project: "stale-project",
        generated_at: "2026-08-15T06:00:00.000Z",
        status: "ok",
        source_sha: "oldsha1",
        period: {
          since: "2026-08-14T00:00:00.000Z",
          until: "2026-08-15T12:00:00.000Z",
        },
        sections: [],
      }),
    ];

    const brief = buildPortfolioBrief({
      registry,
      notes,
      period,
      referenceTime,
      projectFilter: "stale-project",
    });

    const project = brief.projects[0]!;
    expect(project.staleness).toHaveLength(1);
    expect(project.staleness[0]?.edge).toBe("repo");
    expect(project.staleness[0]?.status).toBe("stale");
    expect(project.staleness[0]?.message.value).toMatch(/silent/i);
    expect(project.lines.find((l) => l.edge === "repo")?.status).toBe("stale");
  });

  it("flags sha merged without successful deploy", () => {
    const notes = [
      repoNote("undeployed", "2026-08-18T08:00:00.000Z", {
        schema_version: "1.1",
        edge: "repo",
        project: "undeployed",
        generated_at: "2026-08-18T08:00:00.000Z",
        status: "ok",
        source_sha: "deadbeef9999",
        period,
        sections: [
          {
            id: "shipped",
            title: "Shipped",
            body: "- deadbee [T-0002]: merge task",
          },
        ],
      }),
      deployNote("undeployed", "2026-08-18T08:30:00.000Z", {
        schema_version: "1.1",
        edge: "deploy",
        project: "undeployed",
        generated_at: "2026-08-18T08:30:00.000Z",
        status: "failed",
        source_sha: "deadbeef9999",
        period,
        sections: [{ id: "risks", title: "Risks", body: "build failed" }],
      }),
    ];

    const brief = buildPortfolioBrief({
      registry,
      notes,
      period,
      referenceTime,
      projectFilter: "undeployed",
    });

    const project = brief.projects[0]!;
    const chain = project.sha_chains.find((c) =>
      c.task_ids.value.includes("T-0002"),
    );
    expect(chain).toBeDefined();
    expect(chain?.flags.value).toContain("merged_without_successful_deploy");
    expect(chain?.repo_report?.status.value).toBe("ok");
    expect(chain?.deploy_report?.status.value).toBe("failed");
  });

  it("never omits enabled projects even with zero notes", () => {
    const brief = buildPortfolioBrief({
      registry,
      notes: [],
      period,
      referenceTime,
    });

    expect(brief.projects.map((p) => p.slug.value).sort()).toEqual([
      "healthy",
      "stale-project",
      "undeployed",
    ]);
    for (const project of brief.projects) {
      expect(project.staleness.length).toBeGreaterThan(0);
      expect(project.lines.some((l) => l.status === "absent" || l.status === "stale")).toBe(
        true,
      );
    }
  });
});
