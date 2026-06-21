// Character-scoped story memory — pinned beats by salience + recency.
// Stored in npc_state.memories (per user + companion). Separate from
// user_memory profile-fact RAG.

import { getNpcStates, upsertNpcState } from './npc_state';

export type StoryBeatSource = 'memorable' | 'diary' | 'disruption' | 'secret' | 'manual';

export interface StoryBeat {
  at: number;
  summary: string;
  weight: number;
  source: StoryBeatSource;
  tags?: string[];
}

const MAX_STORED = 40;
const DEFAULT_PINNED = 5;

export const HIGH_SALIENCE_RE =
  /\b(kidnap\w*|abduct\w*|rescued?|confess\w*|secret|revealed|attack\w*|injured|hurt|betray\w*|arrest\w*|gun|knife|hostage|escape\w*|trapped|bound|gagged|captured|confession|milestone|first kiss|proposal|breakup|death|died|killed|fire|explosion|crash)\b/i;
const LOW_SALIENCE_RE = /\b(banter|small talk|flirt|joke|laughed|chatted|texted|swipe|notification|refill|muted the tv)\b/i;

export const STORY_BEAT_WEIGHT: Record<StoryBeatSource, number> = {
  memorable: 75,
  diary: 60,
  disruption: 55,
  secret: 85,
  manual: 50,
};

/** Infer diary beat weight from content (option B: salience + recency at read time). */
export function inferDiaryBeatWeight(beat: string): number {
  const t = beat.trim();
  if (!t) return 40;
  if (HIGH_SALIENCE_RE.test(t)) return 82;
  if (LOW_SALIENCE_RE.test(t)) return 42;
  return STORY_BEAT_WEIGHT.diary;
}

function normalizeBeat(raw: unknown): StoryBeat | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const summary = typeof o.summary === 'string' ? o.summary.trim() : '';
  if (summary.length < 3) return null;
  const at = typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : Date.now();
  const weight = typeof o.weight === 'number' ? Math.min(100, Math.max(1, o.weight)) : 50;
  const source =
    o.source === 'memorable' || o.source === 'diary' || o.source === 'disruption' || o.source === 'secret' || o.source === 'manual'
      ? o.source
      : 'manual';
  const tags = Array.isArray(o.tags) ? o.tags.map(String).slice(0, 6) : undefined;
  return { at, summary: summary.slice(0, 300), weight, source, tags };
}

function parseMemoriesColumn(raw: unknown): StoryBeat[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeBeat).filter((b): b is StoryBeat => b != null);
}

/** Normalizes a beat summary for display and dedup. */
export function sanitizeBeatSummary(summary: string): string {
  return summary
    .trim()
    .replace(/\buser:\d+\b/gi, 'the player')
    .replace(/\s+/g, ' ')
    .slice(0, 300);
}

function beatFingerprint(summary: string): string {
  return sanitizeBeatSummary(summary).toLowerCase().replace(/[^\w\s]/g, '');
}

function tokenSet(summary: string): Set<string> {
  return new Set((beatFingerprint(summary).match(/\b\w{4,}\b/g) ?? []));
}

function beatsOverlap(a: string, b: string): boolean {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (!ta.size || !tb.size) return false;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  const ratio = shared / Math.min(ta.size, tb.size);
  if (ratio >= 0.55) return true;
  const fa = beatFingerprint(a);
  const fb = beatFingerprint(b);
  return fa.includes(fb) || fb.includes(fa);
}

/** Drop near-duplicate beats (same event phrased twice, or heavily overlapping). */
export function dedupeStoryBeats(beats: StoryBeat[]): StoryBeat[] {
  const ranked = [...beats].sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return b.at - a.at;
  });
  const kept: StoryBeat[] = [];
  for (const b of ranked) {
    const summary = sanitizeBeatSummary(b.summary);
    const fp = beatFingerprint(summary);
    if (!fp) continue;
    if (kept.some((k) => beatsOverlap(k.summary, summary))) continue;
    kept.push({ ...b, summary });
  }
  return kept;
}

/** Top beats by weight, then recency (option B). */
export function rankPinnedBeats(beats: StoryBeat[], limit = DEFAULT_PINNED): StoryBeat[] {
  return dedupeStoryBeats(beats)
    .sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      return b.at - a.at;
    })
    .slice(0, Math.max(0, limit));
}

export function formatCharacterStoryBlock(companionName: string, beats: StoryBeat[]): string {
  if (!beats.length) return '';
  const lines = rankPinnedBeats(beats).map((b) => `- ${b.summary}`);
  return (
    `\n\nYOUR SHARED STORY WITH ${companionName.toUpperCase()} (pinned beats — honor these; do not contradict):\n` +
    lines.join('\n')
  );
}

function trimStored(beats: StoryBeat[]): StoryBeat[] {
  if (beats.length <= MAX_STORED) return beats;
  return rankPinnedBeats(beats, MAX_STORED);
}

/** Loads pinned story beats for a user+companion pair. Never throws. */
export async function getCharacterStoryBeats(userId: string, characterId: string): Promise<StoryBeat[]> {
  try {
    const states = await getNpcStates(userId, [characterId]);
    return parseMemoriesColumn(states[characterId]?.memories);
  } catch {
    return [];
  }
}

/** Appends a story beat to npc_state.memories. Fire-and-forget safe. */
export async function appendCharacterStoryBeat(
  userId: string,
  characterId: string,
  input: { summary: string; weight?: number; source: StoryBeatSource; tags?: string[] },
): Promise<void> {
  try {
    const summary = input.summary.trim().slice(0, 300);
    if (summary.length < 3) return;

    const existing = await getCharacterStoryBeats(userId, characterId);
    const key = summary.toLowerCase();
    if (existing.some((b) => b.summary.toLowerCase() === key)) return;

    const beat: StoryBeat = {
      at: Date.now(),
      summary,
      weight: input.weight ?? STORY_BEAT_WEIGHT[input.source] ?? 50,
      source: input.source,
      tags: input.tags,
    };

    const next = trimStored([...existing, beat]);
    await upsertNpcState(userId, characterId, { memories: next as unknown as { at: number; summary: string; weight: number }[] });
  } catch (err) {
    console.warn('[story_memory] append failed:', err);
  }
}

/** Fire-and-forget wrapper. */
export function recordStoryBeat(
  userId: string,
  characterId: string,
  input: { summary: string; weight?: number; source: StoryBeatSource; tags?: string[] },
): void {
  void appendCharacterStoryBeat(userId, characterId, input);
}
