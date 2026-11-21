import { randomUUID } from "node:crypto";
import type { AgentPrincipalRepository } from "./repository.js";
import type {
  AgentAuditEvent,
  AgentPrincipal,
  AppendAuditInput,
  CreatePrincipalInput,
  ListAuditQuery,
  UpdatePrincipalPatch,
} from "./types.js";

function nowIso(): string {
  return new Date().toISOString();
}

export class FakeAgentPrincipalRepository implements AgentPrincipalRepository {
  private readonly principals = new Map<string, AgentPrincipal>();
  private readonly audit: AgentAuditEvent[] = [];

  private key(client_id: string, id: string): string {
    return `${client_id}\0${id}`;
  }

  async createPrincipal(input: CreatePrincipalInput): Promise<AgentPrincipal> {
    const id = input.id ?? randomUUID();
    const created_at = nowIso();
    const row: AgentPrincipal = {
      id,
      client_id: input.client_id,
      kind: input.kind,
      name: input.name,
      bound_api_key_id: input.bound_api_key_id,
      scopes: [...input.scopes],
      mandate_ids: [...input.mandate_ids],
      status: input.status ?? "active",
      created_at,
    };
    const dup = await this.getPrincipalByApiKeyId(
      input.client_id,
      input.bound_api_key_id,
    );
    if (dup) {
      throw new Error("bound_api_key_id already bound for client");
    }
    this.principals.set(this.key(input.client_id, id), row);
    return { ...row };
  }

  async getPrincipal(
    client_id: string,
    id: string,
  ): Promise<AgentPrincipal | null> {
    const row = this.principals.get(this.key(client_id, id));
    return row ? { ...row } : null;
  }

  async getPrincipalByApiKeyId(
    client_id: string,
    bound_api_key_id: string,
  ): Promise<AgentPrincipal | null> {
    for (const row of this.principals.values()) {
      if (
        row.client_id === client_id &&
        row.bound_api_key_id === bound_api_key_id
      ) {
        return { ...row };
      }
    }
    return null;
  }

  async listPrincipals(client_id: string): Promise<AgentPrincipal[]> {
    return [...this.principals.values()]
      .filter((p) => p.client_id === client_id)
      .map((p) => ({ ...p }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async updatePrincipal(
    client_id: string,
    id: string,
    patch: UpdatePrincipalPatch,
  ): Promise<AgentPrincipal | null> {
    const existing = this.principals.get(this.key(client_id, id));
    if (!existing || existing.client_id !== client_id) {
      return null;
    }
    if (
      patch.bound_api_key_id &&
      patch.bound_api_key_id !== existing.bound_api_key_id
    ) {
      const dup = await this.getPrincipalByApiKeyId(
        client_id,
        patch.bound_api_key_id,
      );
      if (dup && dup.id !== id) {
        throw new Error("bound_api_key_id already bound for client");
      }
    }
    const updated: AgentPrincipal = {
      ...existing,
      ...patch,
      scopes: patch.scopes ? [...patch.scopes] : existing.scopes,
      mandate_ids: patch.mandate_ids
        ? [...patch.mandate_ids]
        : existing.mandate_ids,
      updated_at: nowIso(),
    };
    this.principals.set(this.key(client_id, id), updated);
    return { ...updated };
  }

  async appendAudit(input: AppendAuditInput): Promise<AgentAuditEvent> {
    const row: AgentAuditEvent = {
      id: input.id ?? randomUUID(),
      principal_id: input.principal_id,
      client_id: input.client_id,
      surface: input.surface,
      operation: input.operation,
      decision: input.decision,
      reason_code: input.reason_code,
      at: input.at ?? nowIso(),
    };
    this.audit.push(row);
    return { ...row };
  }

  async listAudit(query: ListAuditQuery): Promise<AgentAuditEvent[]> {
    const limit = query.limit ?? 100;
    let rows = this.audit.filter((e) => e.client_id === query.client_id);
    if (query.principal_id) {
      rows = rows.filter((e) => e.principal_id === query.principal_id);
    }
    rows.sort((a, b) => b.at.localeCompare(a.at));
    return rows.slice(0, limit).map((e) => ({ ...e }));
  }
}
