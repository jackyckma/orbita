import type { AgentAuditEvent, AgentPrincipal } from "./types.js";

export type PrincipalRow = {
  id: string;
  client_id: string;
  kind: string;
  name: string;
  bound_api_key_id: string;
  scopes: string[] | unknown;
  mandate_ids: string[] | unknown;
  status: string;
  created_at: Date;
  updated_at: Date | null;
};

export type AuditRow = {
  id: string;
  principal_id: string;
  client_id: string;
  surface: string;
  operation: string;
  decision: string;
  reason_code: string;
  at: Date;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((v): v is string => typeof v === "string");
}

export function principalFromRow(row: PrincipalRow): AgentPrincipal {
  const principal: AgentPrincipal = {
    id: row.id,
    client_id: row.client_id,
    kind: row.kind as AgentPrincipal["kind"],
    name: row.name,
    bound_api_key_id: row.bound_api_key_id,
    scopes: asStringArray(row.scopes),
    mandate_ids: asStringArray(row.mandate_ids),
    status: row.status as AgentPrincipal["status"],
    created_at: row.created_at.toISOString(),
  };
  if (row.updated_at) {
    principal.updated_at = row.updated_at.toISOString();
  }
  return principal;
}

export function auditFromRow(row: AuditRow): AgentAuditEvent {
  return {
    id: row.id,
    principal_id: row.principal_id,
    client_id: row.client_id,
    surface: row.surface as AgentAuditEvent["surface"],
    operation: row.operation,
    decision: row.decision as AgentAuditEvent["decision"],
    reason_code: row.reason_code,
    at: row.at.toISOString(),
  };
}
