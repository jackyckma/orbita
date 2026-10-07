import type { Sql } from "postgres";
import { FakeTicketRepository } from "./fake-repository.js";
import type {
  CreateTicketParams,
  GetTicketParams,
  GetTicketResult,
  ListTicketsQuery,
  ListTicketsResult,
  MandateSubtreeHealth,
  ProposeTicketParams,
  RepositoryResult,
  TicketRepository,
  TransitionParams,
  TransitionSuccess,
} from "./repository/index.js";
import {
  acquireTenantAdvisoryLock,
  flushClientTicketData,
  loadClientTicketData,
} from "./repository/pg-persistence.js";

/**
 * Postgres-backed ticket repository: in-memory engine inside a transaction with
 * per-tenant pg_advisory_xact_lock (serialises empty tenants for idempotency).
 */
export class PgTicketRepository implements TicketRepository {
  constructor(private readonly sql: Sql) {}

  private async withClientWrite<T>(
    client_id: string,
    fn: (repo: FakeTicketRepository) => Promise<RepositoryResult<T>>,
  ): Promise<RepositoryResult<T>> {
    return this.sql.begin(async (tx) => {
      await acquireTenantAdvisoryLock(tx, client_id);
      const data = await loadClientTicketData(tx, client_id, { forUpdate: true });
      const repo = new FakeTicketRepository(data);
      const result = await fn(repo);
      if (result.ok) {
        await flushClientTicketData(tx, data, client_id);
      }
      return result;
    }) as Promise<RepositoryResult<T>>;
  }

  private async withClientRead<T>(
    client_id: string,
    fn: (repo: FakeTicketRepository) => Promise<RepositoryResult<T>>,
  ): Promise<RepositoryResult<T>> {
    return this.sql.begin(async (tx) => {
      await acquireTenantAdvisoryLock(tx, client_id);
      const data = await loadClientTicketData(tx, client_id, { forUpdate: false });
      const repo = new FakeTicketRepository(data);
      return await fn(repo);
    }) as Promise<RepositoryResult<T>>;
  }

  async create(
    params: CreateTicketParams,
  ): Promise<RepositoryResult<TransitionSuccess>> {
    return this.withClientWrite(params.client_id, (repo) => repo.create(params));
  }

  async get(
    params: GetTicketParams,
  ): Promise<RepositoryResult<GetTicketResult>> {
    return this.withClientRead(params.client_id, (repo) => repo.get(params));
  }

  async list(
    query: ListTicketsQuery,
  ): Promise<RepositoryResult<ListTicketsResult>> {
    return this.withClientRead(query.client_id, (repo) => repo.list(query));
  }

  async transition(
    params: TransitionParams,
  ): Promise<RepositoryResult<TransitionSuccess>> {
    return this.withClientWrite(params.client_id, (repo) =>
      repo.transition(params),
    );
  }

  async propose(
    params: ProposeTicketParams,
  ): Promise<RepositoryResult<TransitionSuccess>> {
    return this.withClientWrite(params.client_id, (repo) => repo.propose(params));
  }

  async getMandateSubtreeHealth(
    client_id: string,
    mandate_id: string,
  ): Promise<RepositoryResult<MandateSubtreeHealth>> {
    return this.withClientRead(client_id, (repo) =>
      repo.getMandateSubtreeHealth(client_id, mandate_id),
    );
  }
}
