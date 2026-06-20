/**
 * Map pack metadata to narrative tags for chaos-engine weighting.
 */
import type { NarrativeTag } from '../inworld/arcs';
import type { StoryPack } from '../inworld/pack_types';

const MOOD_TAGS: Partial<Record<StoryPack['mood'], NarrativeTag[]>> = {
  romantic: ['romance', 'trust'],
  dramatic: ['conflict', 'stress'],
  tense: ['conflict', 'stress', 'chaos'],
  thriller: ['conflict', 'chaos', 'stress'],
  mystery: ['trust', 'isolation'],
  playful: ['social', 'friendship'],
  cozy: ['stability', 'friendship'],
  gothic: ['isolation', 'chaos'],
  sexy: ['romance'],
  kinky: ['romance', 'trust'],
  comedic: ['social', 'chaos'],
};

const TAG_KEYWORDS: Array<[RegExp, NarrativeTag]> = [
  [/jealous/i, 'jealousy'],
  [/rival|tension|conflict|drama/i, 'conflict'],
  [/romance|love|date/i, 'romance'],
  [/friend/i, 'friendship'],
  [/family/i, 'family'],
  [/work|job|career/i, 'work'],
  [/money|heist|crime|rob/i, 'money'],
  [/trust|secret/i, 'trust'],
  [/stress|anxiety|scare/i, 'stress'],
  [/chaos|wild|crash/i, 'chaos'],
  [/social|party|crowd|concert/i, 'social'],
];

export function inferArcTagsFromPack(pack: StoryPack): NarrativeTag[] {
  const out = new Set<NarrativeTag>();
  for (const t of MOOD_TAGS[pack.mood] ?? []) out.add(t);
  for (const tag of pack.tags) {
    for (const [re, narrative] of TAG_KEYWORDS) {
      if (re.test(tag)) out.add(narrative);
    }
  }
  if (!out.size) out.add('social');
  return [...out];
}

/** Minimal composition stub for pack sessions (ambient disruptions disabled). */
export function packChaosComposition(
  startedAt: string,
  firedNpcChaos: string[] = [],
): { composedAt: string; firedNpcChaos: string[]; firedDisruptions: string[] } {
  return { composedAt: startedAt, firedNpcChaos, firedDisruptions: [] };
}
