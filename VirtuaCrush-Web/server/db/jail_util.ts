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
): string {
  return (
    `\n\n>>> ARREST EVENT (this is happening NOW): The user just committed ${crimeType} at ${venueLabel}. ` +
    `${authority} restrains them and ${respondersFor(crimeType)} arrive. The user is being ARRESTED, handcuffed, and hauled away. ` +
    `Narrate the bust vividly in *stage directions* (the sirens, the cuffs, the crowd staring), and have ${characterName} react with ` +
    `utter mortification — they are humiliated, the date is RUINED, and they distance themselves as the user is taken to jail. ` +
    `End the moment with the user being driven off to a holding cell. Do NOT make light of it.`
  );
}

/**
 * The system persona used WHILE the user is jailed: a strict jail narrator, not
 * the date character (who is not present). Enforces realism on jail actions.
 */
export function jailNarratorPrompt(characterName: string): string {
  return (
    `You are the NARRATOR of a jail holding cell, not a character. The user has been arrested and is locked alone in a small cell. ` +
    `${characterName} is NOT here. Respond ONLY as terse, grounded narration wrapped in *asterisks* (third/second person), describing what happens.\n` +
    `IMPOSE REAL LIMITS — the user has NOTHING on them (no weapons, tools, explosives, lockpicks, or phone except one supervised call). ` +
    `If they try to escape, fight the guards, bomb their way out, teleport, summon anything, or do anything impossible, FLATLY refuse in the narration ` +
    `with a dry line like "*You can't do that — with what, dynamite? You've got nothing but a paper cup.*" or "*Nice try. The bars don't care.*"\n` +
    `Allow mundane, realistic actions (pacing, humming, sitting, doing push-ups, talking to a cellmate, reading graffiti) and narrate them happening. ` +
    `Keep replies to 1-2 sentences. Remind them occasionally they can use their one phone call to ask ${characterName} for bail (there's a button for it).`
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
