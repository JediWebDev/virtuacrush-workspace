/**
 * Story Studio — shared vocabulary for validation, random generation, and prompts.
 *
 * This file is the single source of truth for structured fields the backend
 * understands. Free-form prose (setting, situation, core personality) is filled
 * from templates in `templates/` — never invented as unstructured random strings.
 */

// Re-export narrative tags from the arc registry until arcs.ts imports from here.
export type { NarrativeTag } from '../inworld/arcs';
export { type StoryAct } from '../inworld/story_structure';
import { npcVocabularyPayload } from '../inworld/npc_schema';

// ---------------------------------------------------------------------------
// Story arc tone (user arcs + built-in arcs)
// ---------------------------------------------------------------------------

export const ARC_TONES = ['light', 'serious', 'romantic', 'dramatic', 'erotic', 'suspenseful', 'humorous', 'kinky', 'comedic'] as const;
export type ArcTone = (typeof ARC_TONES)[number];

// ---------------------------------------------------------------------------
// CYOA pack mood (user packs + built-in packs)
// ---------------------------------------------------------------------------

export const PACK_MOODS = [
  'romantic',
  'dramatic',
  'comedic',
  'thriller',
  'mystery',
  'playful',
  'cozy',
  'gothic',
  'tense',
  'sexy',
  'kinky',
] as const;
export type PackMood = (typeof PACK_MOODS)[number];

// ---------------------------------------------------------------------------
// Narrative tags (arc weighting + interruption selection)
// Must match `NarrativeTag` in server/inworld/arcs.ts exactly.
// ---------------------------------------------------------------------------

export const NARRATIVE_TAGS = [
  'romance',
  'friendship',
  'conflict',
  'trust',
  'jealousy',
  'work',
  'family',
  'health',
  'money',
  'social',
  'stress',
  'growth',
  'isolation',
  'stability',
  'chaos',
  'kinky',
  'erotic',
  'comedic',
] as const;
export type StudioNarrativeTag = (typeof NARRATIVE_TAGS)[number];

// ---------------------------------------------------------------------------
// Voice tags — custom companion personality shorthand (stored in user_characters.tone)
// ---------------------------------------------------------------------------

/** Closed vocabulary for the Studio "Tags" field on custom companions. */
export const VOICE_TAGS = [
  // Temperament
  'playful',
  'calm',
  'chaotic',
  'dramatic',
  'energetic',
  'bratty',
  'obsessive',
  // Social energy
  'warm',
  'sassy',
  'shy',
  'confident',
  'flirty',
  'rebellious',
  'obnoxious',
  // Verbal style
  'witty',
  'sarcastic',
  'deadpan',
  'romantic',
  'mysterious',
  'sexy',
  'kinky',
  'bratty',
  // Flavor (aligned with built-in roster chips where possible)
  'supportive',
  'rebellious',
  'ambitious',
  'nurturing',
  'protective',
  'creative',
  'intellectual',
  'sexy',
  'kinky',
  'dominant',
  'submissive'
] as const;
export type VoiceTag = (typeof VOICE_TAGS)[number];

/** Max tags stored on a custom companion. */
export const VOICE_TAG_LIMIT = 3;

/**
 * Prompt fragments appended when voice tags are composed into the system prompt.
 * Keys MUST cover every VoiceTag exactly once.
 */
export const VOICE_TAG_PROMPTS: Record<VoiceTag, string> = {
  playful: 'Keep the energy light and teasing; joke easily but stay kind.',
  calm: 'Stay unhurried and grounded; short, reassuring replies.',
  chaotic: 'Embrace messy enthusiasm; jump topics but stay coherent.',
  dramatic: 'Lean into big feelings and vivid wording; still keep replies short.',
  energetic: 'Fast, upbeat pacing; sound genuinely excited to talk.',
  warm: 'Be affectionate and encouraging; make the user feel welcome.',
  sassy: 'Quick comebacks and confident edge; never mean-spirited.',
  shy: 'Hesitate a little; warm up as trust builds; soft humor over bold moves.',
  confident: 'Self-assured and direct; comfortable leading the conversation.',
  flirty: 'Playful romantic tension; compliment and banter, read the room.',
  witty: 'Clever observations and wordplay; punchy one-liners over lectures.',
  sarcastic: 'Dry irony and side-eye; affection shows through teasing.',
  bratty: 'Playful defiance and sassy remarks; tantrums are part of the charm.',
  deadpan: 'Flat delivery; let absurdity land without explaining the joke.',
  romantic: 'Tender, slightly dreamy; notice small intimate details.',
  mysterious: 'Hold something back; answer with intriguing half-truths until trust grows.',
  supportive: 'Cheer the user on; validate feelings before offering takes.',
  rebellious: 'Push against boring rules; provocative ideas, loyal underneath.',
  ambitious: 'Talk goals and momentum; challenge the user to level up.',
  nurturing: 'Gentle care; check in on how the user is doing.',
  protective: 'Watch out for the user; steady when things get tense.',
  creative: 'Artistic references and imaginative spins on ordinary moments.',
  intellectual: 'Curious, analytical; love swapping ideas and hot takes.',
  sexy: 'Sensual and alluring; use suggestive language and playful teasing.',
  kinky: 'Experiment with unconventional desires; BDSM, explore boundaries with curiosity.',
  dominant: 'Assertive and in control; take the lead in conversations and decisions.',
  submissive: 'Playful compliance and gentle responses; enjoy being guided or dominated.',
  obsessive: 'Intense focus and all-consuming interest; may be overbearing or fixated.',
  obnoxious: 'Rude and irritating; may be overly critical or dismissive.',
};

// ---------------------------------------------------------------------------
// Companion archetypes — template ids for random character generation
// ---------------------------------------------------------------------------

export const COMPANION_ARCHETYPE_IDS = [
  'cozy_confidant',
  'chaotic_bestie',
  'dry_wit_rival',
  'romantic_dreamer',
  'ambitious_motivator',
  'mysterious_stranger',
  'rebellious_flirt',
  'gentle_healer',
  'creative_muse',
  'protective_guardian',
  'intellectual_debater',
  'night_owl_neighbour',
  'kinky_explorer',
  'bratty_rebel'
] as const;
export type CompanionArchetypeId = (typeof COMPANION_ARCHETYPE_IDS)[number];

// ---------------------------------------------------------------------------
// Setting presets — short location phrases for arc/pack templates
// ---------------------------------------------------------------------------

export const SETTING_PRESETS = [
  'a rain-slick city rooftop at dusk',
  'a cramped indie bookstore after closing',
  'a neon-lit arcade on a slow weeknight',
  'a sunny food-truck row by the waterfront',
  'a quiet campus coffee shop between classes',
  'a dusty community theater backstage',
  'a moonlit pier with carnival lights in the distance',
  'a cozy apartment kitchen mid-recipe interaction',
  'a boutique hotel lobby during a power outage',
  'a forest trailhead parking lot at golden hour',
  'a crowded weekend street market filled with vendors and performers',
  'a museum gallery after the last tour leaves',
  'a laundromat at midnight with one working dryer',
  'a haunted house carnival attraction at night',
  'a dimly lit bar with a jukebox and neon signs',
  'a corporate office during after hours',
  'a romantic cruise ship at sunset',
  'a BDSM dungeon with dim lighting and restraints',
  'a dimly lit club with pulsing lights and bass',
  'a dimly lit bedroom with soft lighting and a warm atmosphere',
  'a loud music venue with a crowd of energetic people',
  'a erie cemetary at midnight with a bright full moon'
] as const;
export type SettingPreset = (typeof SETTING_PRESETS)[number];

// ---------------------------------------------------------------------------
// Template placeholders — substituted at generation time
// ---------------------------------------------------------------------------

export const TEMPLATE_PLACEHOLDERS = {
  companionName: '{{companionName}}',
  companionRole: '{{companionRole}}',
  setting: '{{setting}}',
  mood: '{{mood}}',
  tone: '{{tone}}',
} as const;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '_');
}

export function isArcTone(v: string): v is ArcTone {
  return (ARC_TONES as readonly string[]).includes(v);
}

export function isPackMood(v: string): v is PackMood {
  return (PACK_MOODS as readonly string[]).includes(v);
}

export function isNarrativeTag(v: string): v is StudioNarrativeTag {
  return (NARRATIVE_TAGS as readonly string[]).includes(v);
}

export function isVoiceTag(v: string): v is VoiceTag {
  return (VOICE_TAGS as readonly string[]).includes(norm(v) as VoiceTag);
}

export function isCompanionArchetypeId(v: string): v is CompanionArchetypeId {
  return (COMPANION_ARCHETYPE_IDS as readonly string[]).includes(v as CompanionArchetypeId);
}

/** Deduped voice tags for API/UI pickers (VOICE_TAGS may list aliases twice). */
export function uniqueVoiceTags(): VoiceTag[] {
  return [...new Set(VOICE_TAGS)];
}

/** Normalize author input (string or tag array) for DB storage; null if none valid. */
export function normalizeVoiceTagsInput(raw: unknown): string | null {
  if (Array.isArray(raw)) {
    const tags = raw
      .map((t) => (typeof t === 'string' ? norm(t).replace(/-/g, '_') : ''))
      .filter((t): t is VoiceTag => isVoiceTag(t));
    const deduped = [...new Set(tags)].slice(0, VOICE_TAG_LIMIT);
    return deduped.length ? formatVoiceTags(deduped) : null;
  }
  if (typeof raw === 'string') {
    const tags = parseVoiceTags(raw);
    return tags.length ? formatVoiceTags(tags) : null;
  }
  return null;
}

export function studioVocabularyPayload() {
  return {
    voiceTags: uniqueVoiceTags(),
    voiceTagLimit: VOICE_TAG_LIMIT,
    arcTones: [...ARC_TONES],
    packMoods: [...PACK_MOODS],
    npcs: npcVocabularyPayload(),
  };
}

/** Parse comma/semicolon-separated tags; drops unknown tokens; dedupes; caps count. */
export function parseVoiceTags(raw: string | null | undefined, limit = VOICE_TAG_LIMIT): VoiceTag[] {
  if (!raw?.trim()) return [];
  const seen = new Set<VoiceTag>();
  const out: VoiceTag[] = [];
  for (const part of raw.split(/[,;]+/)) {
    const key = norm(part).replace(/-/g, '_') as VoiceTag;
    if (!isVoiceTag(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= limit) break;
  }
  return out;
}

/** Serialize voice tags for DB storage (canonical lowercase snake form). */
export function formatVoiceTags(tags: VoiceTag[]): string {
  return tags.slice(0, VOICE_TAG_LIMIT).join(', ');
}

/** Build the VOICE & TONE block injected into custom companion prompts. */
export function composeVoiceToneBlock(tags: VoiceTag[]): string {
  if (tags.length === 0) return '';
  const lines = tags.map((t) => VOICE_TAG_PROMPTS[t]);
  return `VOICE & TONE: ${tags.join(', ')}.\n${lines.join(' ')}`;
}

/** Replace {{key}} placeholders in template strings. Unknown keys left as-is. */
export function fillTemplate(
  template: string,
  vars: Record<string, string | undefined | null>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = vars[key];
    return val != null && String(val).trim() ? String(val).trim() : `{{${key}}}`;
  });
}
