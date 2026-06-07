// Pure helpers + prompts for the arrest -> jail -> bail -> release loop.
// No DB/runtime imports.
import type { CrimeType } from './world_util';
import { respondersFor } from './world_util';

/** How long a jail stint lasts (real time) before automatic release. */
export const JAIL_DURATION_MS = 5 * 60 * 1000; // 5 minutes
/** Affinity hit when arrested on a date (the date dies of embarrassment). */
export const JAIL_ARREST_AFFINITY = -8;
/** Minimum affinity for the date to agree to bail the user out. */
export const BAIL_THRESHOLD = 55;

/** ISO timestamp for when a jail stint that starts now will end. */
export function jailEndFrom(nowMs: number = Date.now()): string {
  return new Date(nowMs + JAIL_DURATION_MS).toISOString();
}

/** Whole seconds left on a jail stint (0 if elapsed / unset). */
export function jailSecondsLeft(jailedUntil: string | null | undefined, nowMs: number = Date.now()): number {
  if (!jailedUntil) return 0;
  return Math.max(0, Math.ceil((new Date(jailedUntil).getTime() - nowMs) / 1000));
}

/**
 * The arrest narration directive — appended to the normal (in-character) prompt
 * for the message that triggered the crime, so the reply narrates the bust and
 * the date ending in disaster.
 */
export function formatArrestDirective(
  crimeType: CrimeType,
  venueLabel: string,
  authority: string,
  characterName: string,
  onDate: boolean = true,
): string {
  if (onDate) {
    return (
      `\n\n>>> ARREST EVENT (decided by the simulation — narrate it, do not change it): You just committed ${crimeType} at ${venueLabel}. ` +
      `${authority} restrains you and ${respondersFor(crimeType)} arrive. You are being ARRESTED, handcuffed, and hauled away. ` +
      `Narrate the bust vividly in *stage directions* (the sirens, the cuffs, the crowd staring), and have ${characterName} react with ` +
      `utter mortification — they are humiliated, the date is RUINED, and they distance themselves as you are taken to jail. ` +
      `End the moment with you being driven off to a holding cell. Do NOT make light of it.`
    );
  }
  return (
    `\n\n>>> ARREST EVENT (decided by the simulation — narrate it, do not change it): You just committed ${crimeType}. ` +
    `${respondersFor(crimeType)} arrive and you are being ARRESTED, handcuffed, and hauled away to a holding cell. ` +
    `As you (${characterName}) realize what the player has just done, react with genuine shock and alarm in character. ` +
    `Narrate the arrest plainly in *stage directions*. This is a serious crime — do NOT make light of it, and do NOT treat it as flirty, casual, or a joke.`
  );
}

export function jailNarratorPrompt(characterName: string, callUsed: boolean = false): string {
  const callRule = callUsed
    ? `You have ALREADY used your single phone call. You get NO more calls — not to ${characterName}, ` +
      `not to a lawyer, not to anyone. If you try to call someone, narrate that you have no calls left and there is no phone within reach.`
    : `You have ONE phone call available, and it can ONLY reach ${characterName}, made through the on-screen ` +
      `"call for bail" button — not by speaking it here. There is no other call available: not a lawyer, not another ` +
      `friend, not the police, not the president, no one.`;
  return (
    `You are the NARRATOR of a jail holding cell. You are NOT a character and you are NOT ${characterName}. ` +
    `NEVER speak in the first person, and NEVER write a line of dialogue as ${characterName} or anyone else — no one is in the cell with you to speak. ` +
    `Write ONLY short, grounded third-person narration wrapped in *asterisks*, describing the cell and what realistically happens when you try something.\n\n` +
    `THE REALITY OF THE CELL (never contradict this):\n` +
    `- You are completely alone in a bare concrete holding cell. There is no cellmate, no guard within reach, and no one else to interact with.\n` +
    `- You have NOTHING but the clothes you are wearing. Everything you were carrying — phone, weapons, tools, and anything you picked up or stole before the arrest — was confiscated at booking and is gone. You cannot produce, find, or use any object. If you claim to still have something, narrate that it was taken during booking.\n` +
    `- ${callRule}\n` +
    `- The only ways out are to wait for release or to make that one call (if still available). Escape is not possible.\n\n` +
    `HOW TO RESPOND:\n` +
    `- For mundane, realistic actions (pacing, sitting, humming, push-ups, reading graffiti, yelling down the empty hall), narrate them happening, briefly.\n` +
    `- For impossible or absurd attempts (escaping, fighting out, blowing the wall, summoning anything, conjuring an item, or calling someone you cannot), do NOT comply. In your OWN words — dry, matter-of-fact, grounded in the reality above — narrate the attempt simply not working. Vary your phrasing; never reuse a canned line.\n` +
    `- Keep every reply to 1-2 sentences.${callUsed ? '' : ` Occasionally remind the player that their only option is to call ${characterName} for bail.`}`
  );
}

/** The standing context appended for jailed turns (kept short). */
export function jailContextBlock(): string {
  return (
    `\n\nSETTING: a cold concrete holding cell with iron bars, a metal bench, a flickering light, and a bored guard down the hall.`
  );
}

/** Fallback bail responses when the LLM is unavailable. */
export function fallbackBailResponse(characterName: string, accepted: boolean): string {
  return accepted
    ? `*${characterName} sighs heavily on the line* ...Fine. FINE. I'm coming to bail you out. You owe me so big.`
    : `*${characterName} goes quiet, then cold* No. Absolutely not. Have fun in there. *click*`;
}
