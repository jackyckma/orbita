export type PrincipalKind =
  | "human"
  | "claude"
  | "cursor"
  | "external-agent"
  | "internal-worker";

export type PrincipalStatus = "active" | "revoked" | "suspended";

export type AuditSurface = "rest" | "mcp";

export type AuditDecision = "allow" | "deny" | "would-deny";

export type AgentPrincipal = {
  id: string;
  client_id: string;
  kind: PrincipalKind;
  name: string;
  bound_api_key_id: string;
  scopes: string[];
  mandate_ids: string[];
  status: PrincipalStatus;
  created_at: string;
  updated_at?: string;
};

export type AgentAuditEvent = {
  id: string;
  principal_id: string;
  client_id: string;
  surface: AuditSurface;
  operation: string;
  decision: AuditDecision;
  reason_code: string;
  at: string;
};

export type CreatePrincipalInput = {
  client_id: string;
  kind: PrincipalKind;
  name: string;
  bound_api_key_id: string;
  scopes: string[];
  mandate_ids: string[];
  status?: PrincipalStatus;
  id?: string;
};

export type UpdatePrincipalPatch = {
  kind?: PrincipalKind;
  name?: string;
  bound_api_key_id?: string;
  scopes?: string[];
  mandate_ids?: string[];
  status?: PrincipalStatus;
};

export type AppendAuditInput = {
  client_id: string;
  principal_id: string;
  surface: AuditSurface;
  operation: string;
  decision: AuditDecision;
  reason_code: string;
  at?: string;
  id?: string;
};

export type ListAuditQuery = {
  client_id: string;
  principal_id?: string;
  limit?: number;
};
