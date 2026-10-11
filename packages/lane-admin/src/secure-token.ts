import { timingSafeEqual } from "node:crypto";

export function secureCompareToken(
  provided: string | undefined,
  expected: string,
): boolean {
  if (provided === undefined) {
    return false;
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
