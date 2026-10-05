import type { Sql } from "postgres";
import { FakeTicketRepository } from "./fake-repository.js";
import type {
  CreateTicketParams,
  GetTicketParams,
  GetTicketResult,
  ListTicketsQuery,
  ListTicketsResult,
  MandateSubtreeHealth,
  RepositoryResult,
  TicketRepository,
  TransitionParams,
  TransitionSuccess,
} from "./repository/index.js";
import {
  flushClientTicketData,
  loadClientTicketData,
} from "./repository/pg-persistence.js";

/**
 * Postgres-backed ticket repository: runs the in-memory engine inside a transaction
 * with FOR UPDATE on the tenant's ticket rows (atomic claim; see concurrent claim e2e).
 */
export class PgTicketRepository implements TicketRepository {
  constructor(private readonly sql: Sql) {}

  private async withClient<T>(
    client_id: string,
    fn: (repo: FakeTicketRepository) => Promise<RepositoryResult<T>>,
  ): Promise<RepositoryResult<T>> {
    return this.sql.begin(async (tx) => {
      const data = await loadClientTicketData(tx, client_id);
      const repo = new FakeTicketRepository(data);
      const result = await fn(repo);
      if (result.ok) {
        await flushClientTicketData(tx, data, client_id);
      }
      return result;
    }) as Promise<RepositoryResult<T>>;
  }

  async create(
    params: CreateTicketParams,
  ): Promise<RepositoryResult<TransitionSuccess>> {
    return this.withClient(params.client_id, (repo) => repo.create(params));
  }

  async get(
    params: GetTicketParams,
  ): Promise<RepositoryResult<GetTicketResult>> {
    return this.withClient(params.client_id, (repo) => repo.get(params));
  }

  async list(
    query: ListTicketsQuery,
  ): Promise<RepositoryResult<ListTicketsResult>> {
    return this.withClient(query.client_id, (repo) => repo.list(query));
  }

  async transition(
    params: TransitionParams,
  ): Promise<RepositoryResult<TransitionSuccess>> {
    return this.withClient(params.client_id, (repo) => repo.transition(params));
  }

  async getMandateSubtreeHealth(
    client_id: string,
    mandate_id: string,
  ): Promise<RepositoryResult<MandateSubtreeHealth>> {
    return this.withClient(client_id, (repo) =>
      repo.getMandateSubtreeHealth(client_id, mandate_id),
    );
  }
}
