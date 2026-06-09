// Pure helpers for the character-trait mechanics: persona/voice/desire prompt
// blocks, the hybrid secret-discovery gate, mood-proneness bias, and desire
// nudges for the off-screen world tick. No IO — easy to unit test.
import type { CharacterLore } from '../inworld/lore';

/** Affinity needed before a probing player can unlock a secret. */
export const SECRET_REVEAL_AFFINITY = 65;

/** Heuristic: is the player digging at who the character really is / their secret? */
export function isProbing(message: string): boolean {
  const m = (message || '').toLowerCase();
  const direct =
    /(secret|hiding|hide|the truth|come clean|confess|what are you|who are you|who really|real you|being honest|tell me the truth|what'?s with you|something off)/;
  if (direct.test(m)) return true;
  // A pointed question about *them* counts too.
  return m.includes('?') && /\byou(r)?\b/.test(m) && /(really|actually|hiding|secret|honest|true|real|weird|strange)/.test(m);
}

/** Hybrid gate: reveal only when undiscovered, trust is high, and they're probing. */
export function shouldRevealSecret(params: {
  affinity: number;
  discovered: boolean;
  message: string;
  threshold?: number;
}): boolean {
  const threshold = params.threshold ?? SECRET_REVEAL_AFFINITY;
  return !params.discovered && params.affinity >= threshold && isProbing(params.message);
}

/**
 * Prompt block describing voice + moods + desires, and the secret-handling rule.
 * The full `reveal` text is withheld unless the secret is discovered or being
 * revealed this turn, so the model can't leak it early.
 */
export function formatPersonaTraitsBlock(
  lore: CharacterLore,
  opts: { discovered: boolean; revealNow: boolean },
): string {
  const moods = lore.moodProneness?.length ? lore.moodProneness.join(', ') : '';
  const desires = lore.desires?.length ? lore.desires.join(', ') : '';
  let secretRule: string;
  if (opts.discovered || opts.revealNow) {
    secretRule =
      `SECRET (now in the open): ${lore.secret.reveal} ` +
      (opts.revealNow
        ? `The player has earned your trust and is asking directly — reveal it now, in your own voice, the way only you would.`
        : `The player already knows this; you can speak about it openly.`);
  } else {
    secretRule =
      `SECRET (guard it): You are hiding something. Never state it outright or confirm it. ` +
      `If pressed, you may be evasive or drop the faintest hint (${lore.secret.hint}) — then change the subject. Stay a little mysterious.`;
  }
  return (
    `\n\nVOICE: ${lore.voice}` +
    (moods ? ` You naturally swing toward feeling ${moods}; let your current mood color your tone.` : '') +
    (desires ? `\nWHAT DRIVES YOU: ${desires}. Let it quietly motivate what you bring up and chase — never state it bluntly.` : '') +
    `\n${secretRule}`
  );
}

/** Deterministic mood pick biased toward the character's proneness (roll in [0,1)). */
export function proneMood(lore: CharacterLore, fallback: string, roll: number): string {
  const pool = lore.moodProneness ?? [];
  if (pool.length === 0) return fallback;
  const idx = Math.min(pool.length - 1, Math.max(0, Math.floor(roll * pool.length)));
  return pool[idx] || fallback;
}

/** Small additive nudge [0..~0.2] for a tick intent kind, from the character's desires. */
export function desireNudge(desires: string[] | undefined, kind: string): number {
  const d = new Set((desires ?? []).map((x) => x.toLowerCase()));
  const wantsSeen = d.has('attention') || d.has('validation') || d.has('recognition');
  const wantsThrill = d.has('excitement') || d.has('novelty') || d.has('freedom');
  const wantsCalm = d.has('stability') || d.has('security');
  switch (kind) {
    case 'post':
      return wantsSeen ? 0.18 : 0;
    case 'move':
      return (wantsThrill ? 0.15 : 0) - (wantsCalm ? 0.12 : 0);
    case 'bond':
      return d.has('connection') ? 0.15 : 0;
    case 'rest':
      return wantsCalm ? 0.12 : 0;
    case 'argue':
      return d.has('control') ? 0.12 : 0;
    default:
      return 0;
  }
}
