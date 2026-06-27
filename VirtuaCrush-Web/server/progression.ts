// Relationship pacing knobs — tune RPG-style investment here.

/** Multiplier on positive affinity from classified chat intents (negatives unchanged). */
export const CHAT_AFFINITY_SCALE = 0.5;

/** Affinity awarded when a meet-cute arc completes. */
export const MEET_AFFINITY_REWARD = 3;

/** Default pack/story completion reward when the pack omits affinityReward. */
export const DEFAULT_PACK_AFFINITY_REWARD = 4;

/** Affinity required before a probing player can unlock a character's secret. */
export const SECRET_REVEAL_AFFINITY = 70;

/** Secret trust bar fills slower than raw affinity (feels earned over many sessions). */
export const SECRET_PROGRESS_SCALE = 0.85;

export function secretTrustProgress(affinity: number, threshold = SECRET_REVEAL_AFFINITY): number {
  const ratio = Math.max(0, affinity / threshold) * SECRET_PROGRESS_SCALE;
  return Math.min(100, Math.round(ratio * 100));
}

/** Desire-event choice affinity bumps. */
export const DESIRE_ENCOURAGE_AFFINITY = 1;
export const DESIRE_DECLINE_AFFINITY = -1;

// ---------------------------------------------------------------------------
// Affinity tiers — relationship milestones that become achievements when first
// crossed. `{name}` is replaced with the companion's display name at emit time.
// ---------------------------------------------------------------------------
export interface AffinityTier {
  threshold: number;
  key: string;
  title: string;
  description: string;
}

export const AFFINITY_TIERS: AffinityTier[] = [
  { threshold: 25, key: 'affinity:25', title: 'Warming Up', description: 'You and {name} are starting to click.' },
  { threshold: 50, key: 'affinity:50', title: 'Close', description: 'You and {name} have a real connection now.' },
  { threshold: 75, key: 'affinity:75', title: 'Inseparable', description: '{name} lights up the moment you show up.' },
  { threshold: 100, key: 'affinity:100', title: 'Soulbound', description: 'You and {name} are completely in sync.' },
];

/** Tiers newly crossed moving from `prev` to `next` affinity (exclusive→inclusive). */
export function crossedAffinityTiers(prev: number, next: number): AffinityTier[] {
  return AFFINITY_TIERS.filter((t) => prev < t.threshold && next >= t.threshold);
}
