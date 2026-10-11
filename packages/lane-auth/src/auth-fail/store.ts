/**
 * In-memory per-IP auth-failure store (single API process).
 * Trade-off: no cross-replica sharing and counters reset on restart; cheap and
 * sufficient for L1 hardening. Use a shared store later if multi-instance limits are required.
 */
export type IpAuthFailState = {
  windowStartMs: number;
  failureCount: number;
  blockedUntilMs: number;
};

export class InMemoryAuthFailStore {
  private readonly entries = new Map<string, IpAuthFailState>();

  get(ip: string): IpAuthFailState {
    return (
      this.entries.get(ip) ?? {
        windowStartMs: 0,
        failureCount: 0,
        blockedUntilMs: 0,
      }
    );
  }

  set(ip: string, state: IpAuthFailState): void {
    this.entries.set(ip, state);
  }

  resetForTests(): void {
    this.entries.clear();
  }
}
