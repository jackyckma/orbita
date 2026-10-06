import type {
  StoredTicket,
  TicketEventRecord,
  TransitionSuccess,
} from "./index.js";

export class MemoryTicketDataAccess {
  readonly tickets = new Map<string, StoredTicket>();
  readonly events = new Map<string, TicketEventRecord[]>();
  readonly idempotency = new Map<string, TransitionSuccess>();

  private readonly dirtyTicketKeys = new Set<string>();
  private readonly dirtyEventTicketIds = new Set<string>();
  private readonly dirtyIdempotencyKeys = new Set<string>();

  rowKey(client_id: string, id: string): string {
    return `${client_id}:${id}`;
  }

  getStored(client_id: string, ticket_id: string): StoredTicket | undefined {
    return this.tickets.get(this.rowKey(client_id, ticket_id));
  }

  setStored(row: StoredTicket, markDirty = true): void {
    this.tickets.set(this.rowKey(row.client_id, row.id), row);
    if (markDirty) {
      this.dirtyTicketKeys.add(this.rowKey(row.client_id, row.id));
    }
  }

  allForClient(client_id: string): StoredTicket[] {
    return [...this.tickets.values()].filter((t) => t.client_id === client_id);
  }

  getEvents(ticket_id: string): TicketEventRecord[] {
    return this.events.get(ticket_id) ?? [];
  }

  setEvents(ticket_id: string, events: TicketEventRecord[], markDirty = true): void {
    this.events.set(ticket_id, events);
    if (markDirty) {
      this.dirtyEventTicketIds.add(ticket_id);
    }
  }

  idempotencyGet(key: string): TransitionSuccess | undefined {
    return this.idempotency.get(key);
  }

  idempotencySet(key: string, value: TransitionSuccess, markDirty = true): void {
    this.idempotency.set(key, value);
    if (markDirty) {
      this.dirtyIdempotencyKeys.add(key);
    }
  }

  ticketIdsPendingFlush(): string[] {
    const ids = new Set<string>();
    for (const key of this.dirtyTicketKeys) {
      const row = this.tickets.get(key);
      if (row) ids.add(row.id);
    }
    for (const ticket_id of this.dirtyEventTicketIds) {
      ids.add(ticket_id);
    }
    return [...ids];
  }

  idempotencyKeysPendingFlush(): string[] {
    return [...this.dirtyIdempotencyKeys];
  }
}
