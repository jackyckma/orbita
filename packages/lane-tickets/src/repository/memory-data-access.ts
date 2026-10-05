import type {
  StoredTicket,
  TicketEventRecord,
  TransitionSuccess,
} from "./index.js";

export class MemoryTicketDataAccess {
  readonly tickets = new Map<string, StoredTicket>();
  readonly events = new Map<string, TicketEventRecord[]>();
  readonly idempotency = new Map<string, TransitionSuccess>();

  rowKey(client_id: string, id: string): string {
    return `${client_id}:${id}`;
  }

  getStored(client_id: string, ticket_id: string): StoredTicket | undefined {
    return this.tickets.get(this.rowKey(client_id, ticket_id));
  }

  setStored(row: StoredTicket): void {
    this.tickets.set(this.rowKey(row.client_id, row.id), row);
  }

  allForClient(client_id: string): StoredTicket[] {
    return [...this.tickets.values()].filter((t) => t.client_id === client_id);
  }

  getEvents(ticket_id: string): TicketEventRecord[] {
    return this.events.get(ticket_id) ?? [];
  }

  setEvents(ticket_id: string, events: TicketEventRecord[]): void {
    this.events.set(ticket_id, events);
  }

  idempotencyGet(key: string): TransitionSuccess | undefined {
    return this.idempotency.get(key);
  }

  idempotencySet(key: string, value: TransitionSuccess): void {
    this.idempotency.set(key, value);
  }
}
