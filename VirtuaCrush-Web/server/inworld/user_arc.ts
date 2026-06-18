// Validation + conversion for user-authored story ARCS.
//
// The Story Studio form collects a handful of fields; we normalize them into a
// stored spec (JSONB) and, at play time, convert that spec into a StoryArc the
// existing director consumes exactly like a built-in arc. The key addition over
// the built-in arcs is `playerSituation` — an explicit statement of the PLAYER's
// role and constraints (e.g. "captive, gagged, tied to a chair in a warehouse")
// that is injected authoritatively so the director can't drift the scene.
import type { StoryArc } from './arcs';
import type { UserStory } from '../db/user_stories';
import { ARC_TONES, isArcTone, isNarrativeTag } from '../studio/schema';

export interface UserArcSpec {
  setting: string;
  situation: string;
  coPresent: boolean;
  playerSituation: string;
  introNarrative: string;
  npcInstruction: string;
  /** Optional act-specific companion behavior (setup / confrontation / resolution). */
  beginningInstruction?: string;
  middleInstruction?: string;
  endInstruction?: string;
  completionCriteria: string;
  completionExamples: string[];
  tone: StoryArc['tone'];
  arcTags: string[];
}

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export interface ArcValidation {
  ok: boolean;
  error?: string;
  spec?: UserArcSpec;
}

/** Validates raw form input into a stored UserArcSpec. Fields are clamped; the
 *  few that anchor the scene are required. */
export function validateArcSpec(input: unknown): ArcValidation {
  const o = (input ?? {}) as Record<string, unknown>;
  const setting = str(o.setting, 200);
  const situation = str(o.situation, 1500);
  const npcInstruction = str(o.npcInstruction, 1500);
  const completionCriteria = str(o.completionCriteria, 600);

  if (!setting) return { ok: false, error: 'setting is required' };
  if (!situation) return { ok: false, error: 'situation is required' };
  if (!npcInstruction) return { ok: false, error: 'character behavior (npcInstruction) is required' };
  if (!completionCriteria) return { ok: false, error: 'completion criteria is required' };

  const toneRaw = str(o.tone, 20);
  const tone: StoryArc['tone'] = isArcTone(toneRaw) ? (toneRaw as StoryArc['tone']) : 'dramatic';

  const arcTags = Array.isArray(o.arcTags)
    ? o.arcTags.map((t) => str(t, 24)).filter((t) => t && isNarrativeTag(t)).slice(0, 6)
    : [];
  const completionExamples = Array.isArray(o.completionExamples)
    ? o.completionExamples.map((e) => str(e, 240)).filter(Boolean).slice(0, 4)
    : [];

  const beginningInstruction = str(o.beginningInstruction, 800);
  const middleInstruction = str(o.middleInstruction, 800);
  const endInstruction = str(o.endInstruction, 800);

  return {
    ok: true,
    spec: {
      setting,
      situation,
      coPresent: o.coPresent !== false, // default true
      playerSituation: str(o.playerSituation, 600),
      introNarrative: str(o.introNarrative, 1000),
      npcInstruction,
      ...(beginningInstruction ? { beginningInstruction } : {}),
      ...(middleInstruction ? { middleInstruction } : {}),
      ...(endInstruction ? { endInstruction } : {}),
      completionCriteria,
      completionExamples,
      tone,
      arcTags,
    },
  };
}

/** Builds a director-ready StoryArc from a stored user story. The companion's
 *  persona still comes from the chat's character; this only supplies scene,
 *  behavior, and completion. `playerSituation` is appended to the authoritative
 *  situation so the director treats the player's constraints as ground truth. */
export function userStoryToArc(story: UserStory): StoryArc | null {
  if (story.format !== 'arc') return null;
  const s = story.spec as unknown as Partial<UserArcSpec>;
  if (!s || typeof s.situation !== 'string') return null;

  const playerLine = s.playerSituation
    ? `\n\nPLAYER'S CURRENT SITUATION (authoritative — honor this exactly): ${s.playerSituation}`
    : '';

  const phaseInstructions = {
    ...(s.beginningInstruction ? { beginning: s.beginningInstruction } : {}),
    ...(s.middleInstruction ? { middle: s.middleInstruction } : {}),
    ...(s.endInstruction ? { end: s.endInstruction } : {}),
  };

  return {
    id: `user:${story.id}`,
    characterId: story.characterId,
    isMeetArc: false,
    sceneAnchor: {
      setting: s.setting ?? '',
      situation: `${s.situation}${playerLine}`,
      coPresent: s.coPresent !== false,
    },
    introNarrative: s.introNarrative ?? '',
    npcInstruction: s.npcInstruction ?? '',
    ...(Object.keys(phaseInstructions).length ? { phaseInstructions } : {}),
    completionCriteria: s.completionCriteria ?? 'The scene reaches a satisfying resolution.',
    completionExamples: Array.isArray(s.completionExamples) ? s.completionExamples : [],
    tone: (s.tone as StoryArc['tone']) ?? 'dramatic',
    rarity: 'common',
    repeatable: true,
    arcTags: Array.isArray(s.arcTags) ? (s.arcTags as StoryArc['arcTags']) : [],
  };
}
