import type { Channel, KpiSlot } from "../types/deliverables";

/**
 * Computes the aggregate monthly budget allocated across all channels.
 */
export function totalBudget(channels: Channel[]): number {
  return channels.reduce(
    (sum, ch) => sum + (Number.isFinite(ch.monthlyBudget) ? ch.monthlyBudget : 0),
    0,
  );
}

/**
 * Computes the percentage share (0 - 100) of a specific channel against the total channel budget.
 */
export function budgetPct(ch: Channel, total: number): number {
  if (total <= 0 || !Number.isFinite(ch.monthlyBudget) || ch.monthlyBudget <= 0) {
    return 0;
  }
  const pct = (ch.monthlyBudget / total) * 100;
  return Math.round(pct * 10) / 10;
}

/**
 * Computes the LTV:CAC multiple for a channel given a lifetime value (LTV).
 * Returns a rounded 2-decimal multiple (e.g. 3.25x).
 */
export function ltvCacRatio(ch: Channel, ltv: number): number {
  if (!Number.isFinite(ltv) || ltv <= 0) return 0;
  if (!Number.isFinite(ch.cacHypothesis) || ch.cacHypothesis < 0) return 0;
  if (ch.cacHypothesis === 0) return Infinity;
  const ratio = ltv / ch.cacHypothesis;
  return Math.round(ratio * 100) / 100;
}

/**
 * Evaluates performance of a KPI against its numerical target:
 * - 'on-track': current >= target
 * - 'at-risk': current between 70% and 99.9% of target
 * - 'off-track': current < 70% of target
 */
export function healthOf(slot: KpiSlot): "on-track" | "at-risk" | "off-track" {
  if (!Number.isFinite(slot.target) || slot.target <= 0) {
    return slot.current >= 0 ? "on-track" : "off-track";
  }
  const ratio = slot.current / slot.target;
  if (ratio >= 1) return "on-track";
  if (ratio >= 0.7) return "at-risk";
  return "off-track";
}

/**
 * Formats a currency amount into standard human readable string.
 */
export function formatBudget(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(safe);
}
