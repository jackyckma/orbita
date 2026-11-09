import type {
  AgentAuditEvent,
  AgentPrincipal,
  AppendAuditInput,
  CreatePrincipalInput,
  ListAuditQuery,
  UpdatePrincipalPatch,
} from "./types.js";

export type AgentPrincipalRepository = {
  createPrincipal(input: CreatePrincipalInput): Promise<AgentPrincipal>;
  getPrincipal(client_id: string, id: string): Promise<AgentPrincipal | null>;
  getPrincipalByApiKeyId(
    client_id: string,
    bound_api_key_id: string,
  ): Promise<AgentPrincipal | null>;
  listPrincipals(client_id: string): Promise<AgentPrincipal[]>;
  updatePrincipal(
    client_id: string,
    id: string,
    patch: UpdatePrincipalPatch,
  ): Promise<AgentPrincipal | null>;
  appendAudit(input: AppendAuditInput): Promise<AgentAuditEvent>;
  listAudit(query: ListAuditQuery): Promise<AgentAuditEvent[]>;
};
