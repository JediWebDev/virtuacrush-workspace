// The player as a first-class entity. The PlayerProfile (in world.user.profile)
// is GROUND TRUTH; what any given NPC may use is only the subset they have
// learned — projected through their knownPlayerFacts, exactly like NPC-to-NPC
// beliefs. Appearance becomes knowable when an NPC actually meets the player in
// person; biography facts are learned by sharing them. Pure + testable.
import type { PlayerProfile, NpcEntity } from './world';

export const PLAYER_FACT_KEYS = ['name', 'appearance', 'interests', 'hobbies', 'goals', 'fears', 'values'] as const;
export type PlayerFactKey = (typeof PLAYER_FACT_KEYS)[number];

/** A blank profile (all fields optional/empty) for a brand-new player. */
export function emptyProfile(displayName = ''): PlayerProfile {
  return {
    displayName,
    appearance: {},
    biography: { interests: [], hobbies: [], goals: [], fears: [], values: [] },
  };
}

/** Records that an NPC has learned some player facts (pure; returns a new set). */
export function learnAboutPlayer(known: string[], facts: PlayerFactKey[]): string[] {
  return Array.from(new Set([...known, ...facts]));
}

function knows(npc: NpcEntity, key: PlayerFactKey): boolean {
  return npc.knowledge.knownPlayerFacts.includes(key);
}

/** Projects the ground-truth profile down to only what `npc` actually knows. */
export function knownPlayerProfile(profile: PlayerProfile, npc: NpcEntity): Partial<PlayerProfile> {
  const view: Partial<PlayerProfile> = {};
  if (knows(npc, 'name')) view.displayName = profile.displayName;
  if (knows(npc, 'appearance')) view.appearance = profile.appearance;
  const bio: Partial<PlayerProfile['biography']> = {};
  for (const k of ['interests', 'hobbies', 'goals', 'fears', 'values'] as const) {
    if (knows(npc, k)) bio[k] = profile.biography[k];
  }
  if (Object.keys(bio).length) view.biography = { interests: [], hobbies: [], goals: [], fears: [], values: [], ...bio };
  return view;
}

/** A prompt-ready line describing ONLY what `npc` knows about the player. Empty
 *  string when they know nothing — so the model is never tempted to invent. */
export function describeKnownPlayer(profile: PlayerProfile, npc: NpcEntity): string {
  const v = knownPlayerProfile(profile, npc);
  const parts: string[] = [];
  const name = v.displayName || 'the user';
  if (v.appearance) {
    const d = describeAppearance(v.appearance);
    if (d) parts.push(`appearance: ${d}`);
  }
  if (v.biography) {
    const b = v.biography;
    if (b.interests?.length) parts.push(`interests: ${b.interests.join(', ')}`);
    if (b.hobbies?.length) parts.push(`hobbies: ${b.hobbies.join(', ')}`);
    if (b.goals?.length) parts.push(`goals: ${b.goals.join(', ')}`);
    if (b.fears?.length) parts.push(`fears: ${b.fears.join(', ')}`);
    if (b.values?.length) parts.push(`values: ${b.values.join(', ')}`);
  }
  if (parts.length === 0) return '';
  return `\n\nWHAT YOU KNOW ABOUT ${name.toUpperCase()}: ${parts.join('; ')}. Do not assume anything beyond this about their looks or background.`;
}


/** Which biography categories the player's message reveals (a fact is "shared"
 *  when the message references something they listed). Pure. */
export function detectSharedFacts(message: string, profile: PlayerProfile): PlayerFactKey[] {
  const low = (message || '').toLowerCase();
  if (!low.trim()) return [];
  const out: PlayerFactKey[] = [];
  const bio = profile.biography;
  const mentions = (arr: string[]) => arr.some((v) => v && v.trim() && low.includes(v.toLowerCase()));
  if (mentions(bio.interests)) out.push('interests');
  if (mentions(bio.hobbies)) out.push('hobbies');
  if (mentions(bio.goals)) out.push('goals');
  if (mentions(bio.fears)) out.push('fears');
  if (mentions(bio.values)) out.push('values');
  return out;
}

/**
 * Computes the player facts an NPC now knows after a turn. They always learn the
 * player's name (you're talking) and any bio facts the message shares; they learn
 * appearance only when CO-PRESENT (they can see you). Returns the merged fact set.
 */
export function observePlayer(opts: {
  coPresent: boolean;
  message: string;
  profile: PlayerProfile;
  existingFacts: string[];
}): string[] {
  const learned: PlayerFactKey[] = ['name', ...detectSharedFacts(opts.message, opts.profile)];
  if (opts.coPresent) learned.push('appearance');
  return learnAboutPlayer(opts.existingFacts, learned);
}

/** Joins a permanent appearance into a readable phrase ('' if nothing set). */
export function describeAppearance(a: import('./world').PermanentAppearance): string {
  return [
    a.age && `age ${a.age}`, a.height, a.build, a.hair && `${a.hair} hair`,
    a.eyes && `${a.eyes} eyes`, a.features,
  ].filter(Boolean).join(', ');
}

