import type { RiskTier } from "./types.js";

export const RISK_TIER_ORDER: Record<RiskTier, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  money: 3,
};

export function riskWithinAutoTier(
  risk: RiskTier | undefined,
  max: RiskTier | undefined,
): boolean {
  if (!risk || !max) {
    return false;
  }
  return RISK_TIER_ORDER[risk] <= RISK_TIER_ORDER[max];
}
