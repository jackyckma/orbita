/** Server-wide MCP initialize instructions (always set, including when tickets are off). */
export const ORBITA_MCP_SERVER_INSTRUCTIONS = `Orbita agent runtime MCP. Call orbita_whoami first to see your client_id, scopes, and (when tickets are enabled) your ticket role and mandate bindings.

Tickets (when enabled): read your mandate charter with ticket_get before acting; never mutate work when the mandate is not active. Executors: to suggest a change or ask for something, use ticket_propose — never instruct another bot directly; the integrator answers via ticket_resolve.

See https://get-orbita.com/docs/ticket-executors for executor guidance.`;
