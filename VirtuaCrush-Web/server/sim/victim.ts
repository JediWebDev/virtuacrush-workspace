// Victim guard. The Referee classifies the PLAYER's action; in user-authored
// drama ("masked men kidnapped me and held me for ransom"), small models often
// classify the CRIME IN THE FICTION as the player's own crime — and the law
// system then arrests the victim. This pure heuristic detects first-person
// victim narration so the engine can veto the arrest path.
import type { PlayerIntent } from './intent';

const VICTIM_PATTERNS: RegExp[] = [
  // "I was kidnapped", "I'm being held", "I got mugged", "I've been taken"
  /\b(i was|i am|i'?m|i got|i'?ve been|im)\s+(being\s+)?(kidnapp?ed|abducted|robbed|mugged|attacked|assaulted|jumped|ambushed|grabbed|taken( hostage)?|tied( up)?|held( hostage| captive| at gunpoint)?|threatened|cornered|trapped|locked (up|in))/i,
  // "they kidnapped me", "the men grabbed me", "he attacked me"
  /\b(kidnapp?ed|abducted|grabbed|seized|took|robbed|mugged|attacked|assaulted|jumped|ambushed|threatened|cornered|tied( up)?|bound|gagged|trapped|locked)\s+(me|us)\b/i,
  // "holding me hostage / captive / for ransom", "keeping me locked in"
  /\bhold(?:ing)?\s+(me|us)\s+(hostage|captive|prisoner|for ransom)\b/i,
  /\bkeep(?:ing)?\s+(me|us)\s+(locked|tied|prisoner|captive)\b/i,
  // "in exchange for me", "ransom for my release"
  /\b(exchange|ransom|trade)\b[^.!?]{0,40}\b(for (me|us|my release))\b/i,
];

/** True when the message reads as the player being a VICTIM of a crime. */
export function looksLikeVictimNarration(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  return VICTIM_PATTERNS.some((re) => re.test(t));
}

/**
 * Vetoes a crime classification when the player is narrating victimhood:
 * being kidnapped is not committing kidnapping. Returns the (possibly
 * replaced) intent.
 */
export function vetoVictimCrime(intent: PlayerIntent, userMessage: string): PlayerIntent {
  if (intent.type === 'crime' && looksLikeVictimNarration(userMessage)) {
    return { type: 'observation', subtype: 'share', detail: 'player is the victim of an in-fiction crime' };
  }
  return intent;
}
