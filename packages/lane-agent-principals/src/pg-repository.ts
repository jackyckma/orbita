import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import type { AgentPrincipalRepository } from "./repository.js";
import {
  auditFromRow,
  type AuditRow,
  principalFromRow,
  type PrincipalRow,
} from "./pg-rows.js";
import type {
  AppendAuditInput,
  CreatePrincipalInput,
  ListAuditQuery,
  UpdatePrincipalPatch,
} from "./types.js";

export class PgAgentPrincipalRepository implements AgentPrincipalRepository {
  constructor(private readonly sql: Sql) {}

  async createPrincipal(input: CreatePrincipalInput) {
    const id = input.id ?? randomUUID();
    const rows = await this.sql<PrincipalRow[]>`
      INSERT INTO agent_principals (
        id, client_id, kind, name, bound_api_key_id, scopes, mandate_ids, status
      ) VALUES (
        ${id}::uuid,
        ${input.client_id},
        ${input.kind},
        ${input.name},
        ${input.bound_api_key_id},
        ${this.sql.json(input.scopes)},
        ${this.sql.json(input.mandate_ids)},
        ${input.status ?? "active"}
      )
      RETURNING *
    `;
    const row = rows[0];
    if (!row) {
      throw new Error("insert agent_principal failed");
    }
    return principalFromRow(row);
  }

  async getPrincipal(client_id: string, id: string) {
    const rows = await this.sql<PrincipalRow[]>`
      SELECT * FROM agent_principals
      WHERE client_id = ${client_id} AND id = ${id}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    return row ? principalFromRow(row) : null;
  }

  async getPrincipalByApiKeyId(client_id: string, bound_api_key_id: string) {
    const rows = await this.sql<PrincipalRow[]>`
      SELECT * FROM agent_principals
      WHERE client_id = ${client_id} AND bound_api_key_id = ${bound_api_key_id}
      LIMIT 1
    `;
    const row = rows[0];
    return row ? principalFromRow(row) : null;
  }

  async listPrincipals(client_id: string) {
    const rows = await this.sql<PrincipalRow[]>`
      SELECT * FROM agent_principals
      WHERE client_id = ${client_id}
      ORDER BY created_at ASC, id ASC
    `;
    return rows.map((row) => principalFromRow(row));
  }

  async updatePrincipal(
    client_id: string,
    id: string,
    patch: UpdatePrincipalPatch,
  ) {
    const existing = await this.getPrincipal(client_id, id);
    if (!existing) {
      return null;
    }
    const next = {
      kind: patch.kind ?? existing.kind,
      name: patch.name ?? existing.name,
      bound_api_key_id: patch.bound_api_key_id ?? existing.bound_api_key_id,
      scopes: patch.scopes ?? existing.scopes,
      mandate_ids: patch.mandate_ids ?? existing.mandate_ids,
      status: patch.status ?? existing.status,
    };
    const rows = await this.sql<PrincipalRow[]>`
      UPDATE agent_principals
      SET
        kind = ${next.kind},
        name = ${next.name},
        bound_api_key_id = ${next.bound_api_key_id},
        scopes = ${this.sql.json(next.scopes)},
        mandate_ids = ${this.sql.json(next.mandate_ids)},
        status = ${next.status},
        updated_at = now()
      WHERE client_id = ${client_id} AND id = ${id}::uuid
      RETURNING *
    `;
    const row = rows[0];
    return row ? principalFromRow(row) : null;
  }

  async appendAudit(input: AppendAuditInput) {
    const id = input.id ?? randomUUID();
    const at = input.at ? new Date(input.at) : new Date();
    const rows = await this.sql<AuditRow[]>`
      INSERT INTO agent_audit (
        id, principal_id, client_id, surface, operation, decision, reason_code, at
      ) VALUES (
        ${id}::uuid,
        ${input.principal_id}::uuid,
        ${input.client_id},
        ${input.surface},
        ${input.operation},
        ${input.decision},
        ${input.reason_code},
        ${at}
      )
      RETURNING *
    `;
    const row = rows[0];
    if (!row) {
      throw new Error("insert agent_audit failed");
    }
    return auditFromRow(row);
  }

  async listAudit(query: ListAuditQuery) {
    const limit = query.limit ?? 100;
    const rows = query.principal_id
      ? await this.sql<AuditRow[]>`
          SELECT * FROM agent_audit
          WHERE client_id = ${query.client_id}
            AND principal_id = ${query.principal_id}::uuid
          ORDER BY at DESC
          LIMIT ${limit}
        `
      : await this.sql<AuditRow[]>`
          SELECT * FROM agent_audit
          WHERE client_id = ${query.client_id}
          ORDER BY at DESC
          LIMIT ${limit}
        `;
    return rows.map((row) => auditFromRow(row));
  }
}
