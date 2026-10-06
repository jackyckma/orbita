import postgres from "postgres";
import { PgTicketRepository } from "../pg-repository.js";

export type TicketsDb = PgTicketRepository;

export function createTicketsDb(databaseUrl: string): TicketsDb {
  const client = postgres(databaseUrl, { max: 5 });
  return new PgTicketRepository(client);
}
