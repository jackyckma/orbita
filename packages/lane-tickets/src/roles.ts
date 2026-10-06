import type { Actor, TicketRole } from "./types.js";

export function isFounder(actor: Actor): boolean {
  return actor.role === "founder";
}

export function isIntegrator(actor: Actor): boolean {
  return actor.role === "integrator";
}

export function isExecutor(actor: Actor): boolean {
  return actor.role === "executor";
}

export function isFounderOrIntegrator(actor: Actor): boolean {
  return isFounder(actor) || isIntegrator(actor);
}

/** Founder-only mandate lifecycle (activate draft→active, retire). */
export function canActivateMandate(actor: Actor): boolean {
  return isFounder(actor);
}

export function canCreateMandate(actor: Actor): boolean {
  return isFounderOrIntegrator(actor);
}

export function canApproveEpicOrWork(actor: Actor): boolean {
  return isFounderOrIntegrator(actor);
}

export function canCancelApprovedEpic(actor: Actor): boolean {
  return isFounderOrIntegrator(actor);
}

export function canUpdateCharter(actor: Actor): boolean {
  return isFounderOrIntegrator(actor);
}

/** Decision tickets resolve only on founder approval. */
export function canResolveDecision(actor: Actor): boolean {
  return isFounder(actor);
}

export function privilegedRoleLabel(role: TicketRole): string {
  switch (role) {
    case "founder":
      return "founder";
    case "integrator":
      return "integrator or founder";
    default:
      return "founder, integrator, or founder-only";
  }
}
