import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlatformEnv } from "@orbita/platform";
import {
  buildMcpTicketsDeps,
  resetSharedTicketsDepsCache,
} from "./mcp-tickets-deps.js";

const createTicketsDbMock = vi.fn((_databaseUrl: string) => ({ pool: "mock" }));

vi.mock("@orbita/tickets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@orbita/tickets")>();
  return {
    ...actual,
    createTicketsDb: (databaseUrl: string) => createTicketsDbMock(databaseUrl),
  };
});

afterEach(() => {
  createTicketsDbMock.mockClear();
  resetSharedTicketsDepsCache();
});

describe("buildMcpTicketsDeps", () => {
  it("does not create a DB client when ORBITA_TICKETS_ENABLED is off", () => {
    const env = {} as PlatformEnv;
    const first = buildMcpTicketsDeps(env, "postgresql://localhost/orbita");
    const second = buildMcpTicketsDeps(env, "postgresql://localhost/orbita");
    expect(first).toEqual({ ticketsEnabled: false });
    expect(second).toEqual({ ticketsEnabled: false });
    expect(createTicketsDbMock).not.toHaveBeenCalled();
  });

  it("returns the same repository instance across calls when enabled", () => {
    const env = {
      ORBITA_TICKETS_ENABLED: "1",
    } as PlatformEnv;
    const url = "postgresql://localhost/orbita";
    const a = buildMcpTicketsDeps(env, url);
    const b = buildMcpTicketsDeps(env, url);
    expect(a.ticketsEnabled).toBe(true);
    expect(b.ticketsEnabled).toBe(true);
    expect(a.tickets?.repository).toBe(b.tickets?.repository);
    expect(createTicketsDbMock).toHaveBeenCalledTimes(1);
    expect(createTicketsDbMock).toHaveBeenCalledWith(url);
  });
});
