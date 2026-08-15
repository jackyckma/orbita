import type { ReportPeriod, ZeaburDeployment } from "./types.js";
import { isFailedDeployStatus } from "./normalize-deploy.js";

export const ZEABUR_GRAPHQL_URL = "https://api.zeabur.com/graphql";

export type ZeaburGraphqlDeps = {
  token: string;
  fetchImpl?: typeof fetch;
  /** Max build-log lines to keep per failed deployment. */
  buildLogTailLines?: number;
};

type GqlResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

async function zeaburGraphql<T>(
  deps: ZeaburGraphqlDeps,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const res = await fetchImpl(ZEABUR_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${deps.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`Zeabur GraphQL HTTP ${res.status}`);
  }
  const body = (await res.json()) as GqlResponse<T>;
  if (body.errors?.length) {
    const msg = body.errors.map((e) => e.message ?? "error").join("; ");
    throw new Error(`Zeabur GraphQL: ${msg}`);
  }
  if (!body.data) {
    throw new Error("Zeabur GraphQL: empty data");
  }
  return body.data;
}

type ProjectNode = { _id: string; name: string };
type EnvNode = { _id: string; name: string };
type ServiceNode = { _id: string; name: string };
type DeploymentNode = {
  _id: string;
  projectID?: string;
  serviceID: string;
  environmentID: string;
  status: string;
  commitSHA?: string | null;
  commitMessage?: string | null;
  repoName?: string | null;
  ref?: string | null;
  createdAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};

const Q_ME_TEAMS = `
query MeAndTeams {
  me { _id username }
  teams { _id name myRole }
}`;

const Q_PROJECTS = `
query Projects($ownerID: ObjectID, $skip: Int, $limit: Int) {
  projects(ownerID: $ownerID, skip: $skip, limit: $limit) {
    edges { node { _id name } }
    pageInfo { hasNextPage }
  }
}`;

const Q_ENVS = `
query Environments($projectID: ObjectID!) {
  environments(projectID: $projectID) { _id name }
}`;

const Q_SERVICES = `
query Services($projectID: ObjectID!, $skip: Int, $limit: Int) {
  services(projectID: $projectID, skip: $skip, limit: $limit) {
    edges { node { _id name } }
    pageInfo { hasNextPage }
  }
}`;

/** Listing query — field names from official zeabur/cli pkg/model/deployment.go (not guessed). */
export const Q_DEPLOYMENTS = `
query Deployments($serviceID: ObjectID!, $environmentID: ObjectID!, $perPage: Int) {
  deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: $perPage) {
    edges {
      node {
        _id
        projectID
        serviceID
        environmentID
        status
        commitSHA
        commitMessage
        repoName
        ref
        createdAt
        startedAt
        finishedAt
      }
    }
  }
}`;

/** Failed-only logs. Signature from zeabur/cli pkg/api/log.go (deploymentID). */
export const Q_BUILD_LOGS = `
query BuildLogs($deploymentID: ObjectID!) {
  buildLogs(deploymentID: $deploymentID) {
    message
    timestamp
  }
}`;

async function listAllProjects(
  deps: ZeaburGraphqlDeps,
  ownerID: string | null,
): Promise<ProjectNode[]> {
  const out: ProjectNode[] = [];
  let skip = 0;
  for (;;) {
    const data = await zeaburGraphql<{
      projects: {
        edges: Array<{ node: ProjectNode }>;
        pageInfo?: { hasNextPage?: boolean };
      };
    }>(deps, Q_PROJECTS, {
      ownerID: ownerID ?? undefined,
      skip,
      limit: 100,
    });
    for (const e of data.projects.edges ?? []) {
      out.push(e.node);
    }
    if (!data.projects.pageInfo?.hasNextPage) break;
    skip += 100;
  }
  return out;
}

async function listServices(
  deps: ZeaburGraphqlDeps,
  projectID: string,
): Promise<ServiceNode[]> {
  const out: ServiceNode[] = [];
  let skip = 0;
  for (;;) {
    const data = await zeaburGraphql<{
      services: {
        edges: Array<{ node: ServiceNode }>;
        pageInfo?: { hasNextPage?: boolean };
      };
    }>(deps, Q_SERVICES, { projectID, skip, limit: 100 });
    for (const e of data.services.edges ?? []) {
      out.push(e.node);
    }
    if (!data.services.pageInfo?.hasNextPage) break;
    skip += 100;
  }
  return out;
}

function inPeriod(iso: string | null | undefined, period: ReportPeriod): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  const since = Date.parse(period.since);
  const until = Date.parse(period.until);
  return t >= since && t <= until;
}

function deploymentInPeriod(d: DeploymentNode, period: ReportPeriod): boolean {
  return (
    inPeriod(d.createdAt, period) ||
    inPeriod(d.startedAt, period) ||
    inPeriod(d.finishedAt, period)
  );
}

export type FetchZeaburProjectResult =
  | {
      ok: true;
      zeaburProjectId: string;
      zeaburProjectName: string;
      deployments: ZeaburDeployment[];
      failedBuildLogs: Record<string, string>;
    }
  | {
      ok: false;
      error: string;
      deployments: ZeaburDeployment[];
      failedBuildLogs: Record<string, string>;
    };

/**
 * Resolve a portfolio zeabur_project_name to deployments in the period.
 * Searches personal projects plus every team the API key can see (ownerID).
 * Read-only — never triggers redeploy/rollback.
 */
export async function fetchZeaburDeploymentsForProject(
  zeaburProjectName: string,
  period: ReportPeriod,
  deps: ZeaburGraphqlDeps,
): Promise<FetchZeaburProjectResult> {
  const want = zeaburProjectName.trim().toLowerCase();
  try {
    const meTeams = await zeaburGraphql<{
      me: { _id: string; username: string };
      teams: Array<{ _id: string; name: string }>;
    }>(deps, Q_ME_TEAMS);

    const ownerIds: Array<string | null> = [null, meTeams.me._id];
    for (const t of meTeams.teams ?? []) {
      if (t._id && !ownerIds.includes(t._id)) ownerIds.push(t._id);
    }

    let matched: ProjectNode | null = null;
    for (const ownerID of ownerIds) {
      const projects = await listAllProjects(deps, ownerID);
      const hit = projects.find((p) => p.name.trim().toLowerCase() === want);
      if (hit) {
        matched = hit;
        break;
      }
    }

    if (!matched) {
      return {
        ok: false,
        error: `No Zeabur project named "${zeaburProjectName}" visible to this API key (checked personal + teams)`,
        deployments: [],
        failedBuildLogs: {},
      };
    }

    const envs = (
      await zeaburGraphql<{ environments: EnvNode[] }>(deps, Q_ENVS, {
        projectID: matched._id,
      })
    ).environments;

    const services = await listServices(deps, matched._id);
    const deployments: ZeaburDeployment[] = [];

    for (const service of services) {
      for (const env of envs) {
        const data = await zeaburGraphql<{
          deployments: { edges: Array<{ node: DeploymentNode }> };
        }>(deps, Q_DEPLOYMENTS, {
          serviceID: service._id,
          environmentID: env._id,
          perPage: 20,
        });
        for (const edge of data.deployments.edges ?? []) {
          const n = edge.node;
          if (!deploymentInPeriod(n, period)) continue;
          deployments.push({
            id: n._id,
            projectId: n.projectID ?? matched._id,
            serviceId: n.serviceID,
            serviceName: service.name,
            environmentId: n.environmentID,
            environmentName: env.name,
            status: n.status,
            commitSha: (n.commitSHA ?? "").trim(),
            commitMessage: (n.commitMessage ?? "").trim(),
            repoName: (n.repoName ?? "").trim(),
            ref: (n.ref ?? "").trim(),
            createdAt: n.createdAt ?? null,
            startedAt: n.startedAt ?? null,
            finishedAt: n.finishedAt ?? null,
          });
        }
      }
    }

    // Newest first
    deployments.sort((a, b) => {
      const ta = Date.parse(a.createdAt ?? a.startedAt ?? "") || 0;
      const tb = Date.parse(b.createdAt ?? b.startedAt ?? "") || 0;
      return tb - ta;
    });

    const failedBuildLogs: Record<string, string> = {};
    const tail = deps.buildLogTailLines ?? 30;
    for (const d of deployments.filter((x) => isFailedDeployStatus(x.status))) {
      try {
        const logs = await zeaburGraphql<{
          buildLogs: Array<{ message?: string; timestamp?: string }>;
        }>(deps, Q_BUILD_LOGS, { deploymentID: d.id });
        const lines = (logs.buildLogs ?? []).map((l) => l.message ?? "").filter(Boolean);
        const slice = lines.slice(-tail);
        if (slice.length) {
          failedBuildLogs[d.id] = slice.join(" | ");
        }
      } catch {
        // Logs are best-effort; status already captured.
        failedBuildLogs[d.id] = "(buildLogs unavailable)";
      }
    }

    return {
      ok: true,
      zeaburProjectId: matched._id,
      zeaburProjectName: matched.name,
      deployments,
      failedBuildLogs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Never include the token in errors (Bearer header not echoed).
    return {
      ok: false,
      error: message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]"),
      deployments: [],
      failedBuildLogs: {},
    };
  }
}
