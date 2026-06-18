/**
 * Story Studio template formats — authoring guide
 * ================================================
 *
 * Templates are deterministic building blocks for "Random" generation. They
 * NEVER bypass validation in user_arc.ts / user_pack.ts / user_characters.ts.
 *
 * PLACEHOLDERS (substituted by fillTemplate at generation time)
 * -------------------------------------------------------------
 *   {{companionName}}  — display name of the chosen companion
 *   {{companionRole}}  — short role label (built-in role or "Custom companion")
 *   {{setting}}        — a SETTING_PRESET or template-specific setting string
 *   {{tone}}           — arc tone label (light | serious | romantic | dramatic)
 *   {{mood}}           — pack mood label (romantic | comedic | …)
 *
 * CHARACTER ARCHETYPE (CompanionArchetypeTemplate)
 * ------------------------------------------------
 * Used to random-fill the Studio Characters form before save.
 *
 *   id              — must be in COMPANION_ARCHETYPE_IDS (schema.ts)
 *   label           — human-readable name for debug/UI ("Chaotic Bestie")
 *   voiceTags       — 2–3 VoiceTag values (validated against VOICE_TAGS)
 *   coreTemplate    — prose body; becomes user_characters.core after fill
 *   greetingTemplate — optional; becomes greeting
 *   secretTemplate  — optional; becomes secret (~30% roll on random)
 *   nameSeeds       — optional display-name fragments if user picks random name too
 *
 * STORY ARC TEMPLATE (ArcScenarioTemplate)
 * ----------------------------------------
 * Maps 1:1 onto UserArcSpec fields (server/inworld/user_arc.ts).
 *
 *   id, label         — registry identity
 *   tone              — ArcTone (required)
 *   arcTags           — 1–3 StudioNarrativeTag values
 *   coPresent         — default true; weighted random may flip false for remote arcs
 *   settingTemplate   — short location; may use {{setting}} or literal prose
 *   situationTemplate — ground truth paragraph (required)
 *   playerSituationTemplate — optional player constraints
 *   npcInstructionTemplate — how {{companionName}} behaves (required)
 *   introNarrativeTemplate — optional opening [NARRATOR] line
 *   completionCriteriaTemplate — one clear completion sentence (required)
 *   completionExamples — 0–4 director grounding examples (literal, no placeholders)
 *   beginningInstruction / middleInstruction / endInstruction — optional act notes
 *   weight            — relative pick weight within same tone (default 1)
 *   companionFilter   — optional allow-list of character ids; omit = any companion
 *
 * PACK GRAPH TEMPLATE (PackGraphTemplate)
 * ---------------------------------------
 * Describes a valid CYOA graph before mood-specific copy is applied.
 *
 *   id, label
 *   moods             — PackMood[] this graph supports (pick intersection with roll)
 *   arcTags           — optional narrative flavor for future weighting
 *   settingTemplate, situationTemplate, systemInstructionTemplate — pack header fields
 *   coPresent         — default true
 *   nodes             — keyed node id → PackBeatTemplate
 *
 * PACK BEAT TEMPLATE (PackBeatTemplate)
 * -------------------------------------
 *   act               — StoryAct | omit (runtime infers)
 *   terminal          — true = ending beat (choices must be null when expanded)
 *   introNarrativeTemplate — optional beat opener
 *   npcInstructionTemplate — required behavioral instruction
 *   choices           — required unless terminal; next is node id or "end"
 *
 * PACK MOOD COPY (PackMoodCopyTemplate) — optional overlay
 * --------------------------------------------------------
 * When the same graph shape should read differently per mood, define copy keyed
 * by node id + field. Random generation merges graph + mood overlay last.
 *
 * EXPANSION RULES (runtime, not stored in JSON)
 * ---------------------------------------------
 * 1. Pick template(s) from weighted pools filtered by tone/mood/companion.
 * 2. Pick setting from SETTING_PRESETS or template literal.
 * 3. fillTemplate() all string fields.
 * 4. Validate through validateArcSpec / validatePackSpec before save or preview.
 */

import type {
  ArcTone,
  CompanionArchetypeId,
  PackMood,
  SettingPreset,
  StudioNarrativeTag,
  VoiceTag,
} from '../schema';
import type { StoryAct } from '../schema';

export interface CompanionArchetypeTemplate {
  id: CompanionArchetypeId;
  label: string;
  voiceTags: VoiceTag[];
  coreTemplate: string;
  greetingTemplate?: string;
  secretTemplate?: string;
  /** Short name fragments — e.g. ["River", "Alex", "Jordan"] */
  nameSeeds?: string[];
  weight?: number;
}

export interface ArcScenarioTemplate {
  id: string;
  label: string;
  tone: ArcTone;
  arcTags: StudioNarrativeTag[];
  coPresent?: boolean;
  settingTemplate: string | SettingPreset;
  situationTemplate: string;
  playerSituationTemplate?: string;
  npcInstructionTemplate: string;
  introNarrativeTemplate?: string;
  completionCriteriaTemplate: string;
  completionExamples?: string[];
  beginningInstruction?: string;
  middleInstruction?: string;
  endInstruction?: string;
  weight?: number;
  /** When set, random arc only offers this template for listed companions. */
  companionFilter?: string[];
}

export interface PackBeatChoiceTemplate {
  labelTemplate: string;
  userMessageTemplate?: string;
  /** Target node id or the sentinel "end". */
  next: string;
}

export interface PackBeatTemplate {
  act?: StoryAct;
  terminal?: boolean;
  introNarrativeTemplate?: string;
  npcInstructionTemplate: string;
  choices?: PackBeatChoiceTemplate[];
}

export interface PackGraphTemplate {
  id: string;
  label: string;
  moods: PackMood[];
  arcTags?: StudioNarrativeTag[];
  coPresent?: boolean;
  settingTemplate: string | SettingPreset;
  situationTemplate: string;
  systemInstructionTemplate: string;
  blurbTemplate?: string;
  titleTemplate?: string;
  nodes: Record<string, PackBeatTemplate>;
  weight?: number;
}

/** Optional per-mood phrasing overrides for a graph template's beats. */
export interface PackMoodCopyTemplate {
  graphId: string;
  mood: PackMood;
  titleTemplate?: string;
  blurbTemplate?: string;
  systemInstructionTemplate?: string;
  /** nodeId → partial beat overrides */
  nodeOverrides?: Record<
    string,
    Partial<Pick<PackBeatTemplate, 'introNarrativeTemplate' | 'npcInstructionTemplate'>>
  >;
}

/** Fully expanded draft returned by random generators (preview or create). */
export interface RandomCharacterDraft {
  displayName: string;
  core: string;
  greeting?: string;
  secret?: string;
  tone: string;
  meta: { archetypeId: CompanionArchetypeId; voiceTags: VoiceTag[] };
}

export interface RandomArcDraft {
  characterId: string;
  title: string;
  setting: string;
  situation: string;
  playerSituation?: string;
  npcInstruction: string;
  introNarrative?: string;
  completionCriteria: string;
  completionExamples?: string[];
  beginningInstruction?: string;
  middleInstruction?: string;
  endInstruction?: string;
  coPresent: boolean;
  tone: ArcTone;
  arcTags: StudioNarrativeTag[];
  meta: { templateId: string; templateLabel: string };
}

export interface RandomPackDraft {
  characterId: string;
  title: string;
  blurb: string;
  mood: PackMood;
  setting: string;
  situation: string;
  coPresent: boolean;
  systemInstruction: string;
  nodes: Record<
    string,
    {
      npcInstruction: string;
      introNarrative?: string;
      act?: StoryAct;
      choices: Array<{ label: string; userMessage: string; next: string }> | null;
    }
  >;
  meta: { graphTemplateId: string; moodCopyApplied: boolean };
}
