// Conversation-driven vitals. The Referee already classifies every player
// message into a canonical PlayerIntent; these pure helpers translate that
// intent into IMMEDIATE drive movement and mood shifts, so the meters breathe
// with the conversation instead of only drifting on the wall clock (which is
// imperceptible within a single session). "LLM classifies, sim decides."
import type { PlayerIntent } from './intent';
import type { DriveDef, DriveKey } from './drives';

const clamp = (n: number) => Math.max(0, Math.min(100, n));

// --- Intent -> drive deltas ---------------------------------------------------
// Per-drive tables keyed by canonical intent subtype. Quirk tables are keyed by
// DRIVE key (not character id) so future generated characters can reuse them.

const DESIRE_DELTAS: Record<string, number> = {
  // romance
  flirt: 6,
  affection: 7,
  confession: 9,
  kiss_attempt: 10,
  proposition: 8,
  date_request: 4,
  reject: -18,
  breakup: -25,
  // warm socials
  compliment: 3,
  comfort: 3,
  share: 2,
};

const PLAYFUL_DELTAS: Record<string, number> = {
  tease: 8,
  joke: 6,
  compliment: 2,
  flirt: 4,
  boast: 1,
  reject: -10,
  breakup: -15,
};

const QUIRK_DELTAS: Record<DriveKey, Record<string, number>> = {
  thirst: { flirt: 5, affection: 4, kiss_attempt: 8, proposition: 8 },
  mischief: { joke: 7, tease: 6, lie: 4, manipulate: 3 },
  spotlight: { compliment: 9, flirt: 4, boast: -4 },
  challenge: { tease: 8, provoke: 6, joke: 4, boast: 5 },
};

const NEGATIVE_ROMANCE = new Set(['reject', 'breakup']);

const CONFLICT_DELTAS: Record<DriveKey, number> = { desire: -10, playful: -12 };

function tableFor(key: DriveKey): Record<string, number> {
  if (key === 'desire') return DESIRE_DELTAS;
  if (key === 'playful') return PLAYFUL_DELTAS;
  return QUIRK_DELTAS[key] ?? {};
}

/**
 * Drive movement caused by the player's classified action this turn.
 * Returns only the keys that actually move.
 */
export function driveDeltasForIntent(
  intent: PlayerIntent,
  defs: DriveDef[],
): Record<DriveKey, number> {
  const out: Record<DriveKey, number> = {};
  for (const d of defs) {
    let delta = 0;
    if (intent.type === 'conflict') {
      delta = CONFLICT_DELTAS[d.key] ?? -8;
    } else if (intent.type === 'crime') {
      delta = -10;
    } else if (intent.type === 'social' || intent.type === 'romance') {
      delta = tableFor(d.key)[intent.subtype] ?? 0;
      if (!delta && intent.type === 'romance') {
        // Generic romance fallback for quirk drives without a specific entry.
        const isCommon = d.key === 'desire' || d.key === 'playful';
        delta = NEGATIVE_ROMANCE.has(intent.subtype) ? (isCommon ? 0 : -8) : isCommon ? 0 : 3;
      }
    }
    if (delta) out[d.key] = delta;
  }
  return out;
}

/** Applies deltas to meter values, clamped to [0, 100]. Pure. */
export function applyDriveDeltas(
  values: Record<DriveKey, number>,
  defs: DriveDef[],
  deltas: Record<DriveKey, number>,
): Record<DriveKey, number> {
  const out: Record<DriveKey, number> = { ...values };
  for (const d of defs) {
    const delta = deltas[d.key];
    if (!delta) continue;
    out[d.key] = clamp((out[d.key] ?? d.baseline) + delta);
  }
  return out;
}

// --- Intent -> mood shift ------------------------------------------------------
// Notable actions overwrite the character's current mood word (the daily story
// engine still sets the morning baseline; this makes it move intra-session).
// Neutral chatter returns null and leaves the existing mood alone.

const pick = (arr: string[], seed: number) => arr[Math.abs(seed) % arr.length];

export function moodShiftForIntent(intent: PlayerIntent, seed = Date.now()): string | null {
  const s = intent.subtype;
  switch (intent.type) {
    case 'conflict':
      return pick(['stung', 'guarded', 'prickly'], seed);
    case 'crime':
      return pick(['shaken', 'rattled'], seed);
    case 'romance':
      if (NEGATIVE_ROMANCE.has(s)) return pick(['crushed', 'hollow'], seed);
      if (s === 'kiss_attempt' || s === 'proposition') return pick(['flustered', 'breathless'], seed);
      if (s === 'confession' || s === 'affection') return pick(['giddy', 'glowing'], seed);
      return pick(['flirty', 'warm'], seed);
    case 'social':
      if (s === 'compliment') return pick(['flattered', 'pleased'], seed);
      if (s === 'comfort' || s === 'apologize') return pick(['soothed', 'softened'], seed);
      if (s === 'tease' || s === 'joke') return pick(['amused', 'bubbly'], seed);
      if (s === 'lie' || s === 'manipulate') return null; // she may not know
      return null; // smalltalk etc: keep the daily mood
    default:
      return null;
  }
}
