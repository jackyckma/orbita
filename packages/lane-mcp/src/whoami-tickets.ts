import {
  deriveTicketActor,
  type MandateCharter,
  type TicketActorConfig,
  type TicketAuthForActor,
  type TicketRepository,
} from "@orbita/tickets";

export type MandateCharterSummary = {
  mandate_id: string;
  status: string;
  title: string;
  charter: {
    purpose: string;
    hard_limits: Array<{
      id: string;
      description: string;
      enforcement: string;
    }>;
    exception_types: Array<{ type: string; description: string }>;
    cadence: { description: string; interval_hours?: number };
  };
};

function summarizeCharter(charter: MandateCharter) {
  return {
    purpose: charter.purpose,
    hard_limits: (charter.hard_limits ?? []).map((h) => ({
      id: h.id,
      description: h.description,
      enforcement: h.enforcement,
    })),
    exception_types: (charter.exception_types ?? []).map((e) => ({
      type: e.type,
      description: e.description,
    })),
    cadence: charter.cadence,
  };
}

export async function buildTicketsWhoamiExtension(
  deps: {
    clientId: string;
    auth: TicketAuthForActor;
    actorConfig: TicketActorConfig;
    repository: TicketRepository;
  },
): Promise<{
  ticket_role: string;
  mandates: MandateCharterSummary[];
}> {
  const actor = deriveTicketActor(deps.auth, deps.actorConfig);
  const mandateIds =
    actor.role === "executor"
      ? (actor.mandate_ids ?? [])
      : [...(deps.actorConfig.keyMandates.get(deps.auth.apiKey.id) ?? [])];

  const mandates: MandateCharterSummary[] = [];
  for (const mandateId of mandateIds) {
    const loaded = await deps.repository.get({
      client_id: deps.clientId,
      ticket_id: mandateId,
      actor,
    });
    if (!loaded.ok || loaded.value.ticket.kind !== "mandate") {
      continue;
    }
    const ticket = loaded.value.ticket;
    if (!ticket.charter) {
      continue;
    }
    mandates.push({
      mandate_id: ticket.id,
      status: ticket.status,
      title: ticket.title,
      charter: summarizeCharter(ticket.charter),
    });
  }

  return {
    ticket_role: actor.role,
    mandates,
  };
}
