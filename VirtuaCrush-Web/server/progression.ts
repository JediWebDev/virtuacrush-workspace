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
