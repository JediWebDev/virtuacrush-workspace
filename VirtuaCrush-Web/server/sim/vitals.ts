// Conversation-driven vitals. The Referee already classifies every player
// message into a canonical PlayerIntent; mood shifts translate that intent
// into an immediate mood word so the daily story baseline moves intra-session.
// Emotional gauge movement lives in emotions.ts.
import type { PlayerIntent } from './intent';

const NEGATIVE_ROMANCE = new Set(['reject', 'breakup']);

const pick = (arr: string[], seed: number) => arr[Math.abs(seed) % arr.length];

export function moodShiftForIntent(intent: PlayerIntent, seed = Date.now()): string | null {
  const s = intent.subtype;
  switch (intent.type) {
    case 'conflict':
      return pick(['stung', 'guarded', 'prickly'], seed);
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
