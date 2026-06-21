export function windowStartForMinute(now: Date): Date {
  const start = new Date(now);
  start.setUTCSeconds(0, 0);
  return start;
}

export function retryAfterSeconds(now: Date): number {
  const start = windowStartForMinute(now);
  const nextWindow = new Date(start.getTime() + 60_000);
  return Math.max(1, Math.ceil((nextWindow.getTime() - now.getTime()) / 1000));
}

export function isOverLimit(count: number, limit: number): boolean {
  return count > limit;
}
