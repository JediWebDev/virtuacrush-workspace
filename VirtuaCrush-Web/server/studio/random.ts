/**
 * Deterministic random drafts for Story Studio — template pick + placeholder fill.
 */
import { getCharacter, CHARACTERS as BUILTIN_CHARACTERS } from '../inworld/characters';
import { validateArcSpec } from '../inworld/user_arc';
import { validatePackSpec } from '../inworld/user_pack';
import {
  ARC_TONES,
  PACK_MOODS,
  SETTING_PRESETS,
  fillTemplate,
  formatVoiceTags,
  isArcTone,
  isPackMood,
  type ArcTone,
  type PackMood,
  type SettingPreset,
} from './schema';
import { COMPANION_ARCHETYPE_TEMPLATES } from './templates/characterArchetypes';
import { ARC_SCENARIO_TEMPLATES } from './templates/arcTemplates';
import {
  PACK_GRAPH_TEMPLATES,
  moodCopyForGraph,
  packGraphsForMood,
} from './templates/packTemplates';
import type {
  ArcScenarioTemplate,
  PackBeatTemplate,
  RandomArcDraft,
  RandomCharacterDraft,
  RandomPackDraft,
} from './templates/types';

function weightedPick<T extends { weight?: number }>(items: T[]): T {
  if (items.length === 0) throw new Error('weightedPick: empty pool');
  const total = items.reduce((s, i) => s + (i.weight ?? 1), 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item.weight ?? 1;
    if (roll <= 0) return item;
  }
  return items[items.length - 1]!;
}

function pickOne<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function resolveSetting(template: string | SettingPreset, settingRoll?: SettingPreset): string {
  if (typeof template === 'string' && !template.includes('{{setting}}')) return template;
  const setting = settingRoll ?? pickOne(SETTING_PRESETS);
  return fillTemplate(String(template), { setting });
}

export function resolveCompanionMeta(
  characterId: string,
  displayNameOverride?: string,
): { companionName: string; companionRole: string } {
  if (characterId.startsWith('user:')) {
    return {
      companionName: displayNameOverride?.trim() || 'Companion',
      companionRole: 'Custom companion',
    };
  }
  try {
    const c = getCharacter(characterId);
    return { companionName: c.displayName, companionRole: 'Companion' };
  } catch {
    return { companionName: displayNameOverride?.trim() || 'Companion', companionRole: 'Companion' };
  }
}

export function listRandomCharacterIds(customCharacterIds: string[] = []): string[] {
  return [...Object.keys(BUILTIN_CHARACTERS), ...customCharacterIds.map((id) => `user:${id}`)];
}

export function randomCharacterDraft(): RandomCharacterDraft {
  const archetype = weightedPick(COMPANION_ARCHETYPE_TEMPLATES);
  const displayName = pickOne(archetype.nameSeeds ?? ['Alex', 'Jordan', 'Casey', 'Riley']);
  const vars = { companionName: displayName, companionRole: 'Custom companion' };
  const secret =
    archetype.secretTemplate && Math.random() < 0.35
      ? fillTemplate(archetype.secretTemplate, vars)
      : undefined;

  return {
    displayName,
    core: fillTemplate(archetype.coreTemplate, vars),
    greeting: archetype.greetingTemplate ? fillTemplate(archetype.greetingTemplate, vars) : undefined,
    secret,
    tone: formatVoiceTags(archetype.voiceTags),
    meta: { archetypeId: archetype.id, voiceTags: [...archetype.voiceTags] },
  };
}

function eligibleArcTemplates(characterId: string, tone?: ArcTone): ArcScenarioTemplate[] {
  let pool = ARC_SCENARIO_TEMPLATES.filter(
    (t) => !t.companionFilter?.length || t.companionFilter.includes(characterId),
  );
  if (tone && isArcTone(tone)) pool = pool.filter((t) => t.tone === tone);
  return pool.length ? pool : ARC_SCENARIO_TEMPLATES;
}

export function randomArcDraft(
  characterId: string,
  opts: { displayName?: string; tone?: ArcTone } = {},
): RandomArcDraft {
  const tone = opts.tone && isArcTone(opts.tone) ? opts.tone : pickOne(ARC_TONES);
  const template = weightedPick(eligibleArcTemplates(characterId, tone));
  const { companionName, companionRole } = resolveCompanionMeta(characterId, opts.displayName);
  const settingRoll = pickOne(SETTING_PRESETS);
  const vars = {
    companionName,
    companionRole,
    setting: settingRoll,
    tone: template.tone,
  };

  const draft: RandomArcDraft = {
    characterId,
    title: template.label,
    setting: resolveSetting(template.settingTemplate, settingRoll),
    situation: fillTemplate(template.situationTemplate, vars),
    playerSituation: template.playerSituationTemplate
      ? fillTemplate(template.playerSituationTemplate, vars)
      : undefined,
    npcInstruction: fillTemplate(template.npcInstructionTemplate, vars),
    introNarrative: template.introNarrativeTemplate
      ? fillTemplate(template.introNarrativeTemplate, vars)
      : undefined,
    completionCriteria: fillTemplate(template.completionCriteriaTemplate, vars),
    completionExamples: template.completionExamples,
    beginningInstruction: template.beginningInstruction,
    middleInstruction: template.middleInstruction,
    endInstruction: template.endInstruction,
    coPresent: template.coPresent !== false,
    tone: template.tone,
    arcTags: [...template.arcTags],
    meta: { templateId: template.id, templateLabel: template.label },
  };

  const validated = validateArcSpec({
    setting: draft.setting,
    situation: draft.situation,
    playerSituation: draft.playerSituation,
    npcInstruction: draft.npcInstruction,
    introNarrative: draft.introNarrative,
    completionCriteria: draft.completionCriteria,
    completionExamples: draft.completionExamples,
    beginningInstruction: draft.beginningInstruction,
    middleInstruction: draft.middleInstruction,
    endInstruction: draft.endInstruction,
    coPresent: draft.coPresent,
    tone: draft.tone,
    arcTags: draft.arcTags,
  });
  if (!validated.ok || !validated.spec) {
    throw new Error(validated.error ?? 'arc_draft_invalid');
  }
  return draft;
}

function expandBeat(
  beat: PackBeatTemplate,
  vars: Record<string, string>,
): RandomPackDraft['nodes'][string] {
  return {
    npcInstruction: fillTemplate(beat.npcInstructionTemplate, vars),
    ...(beat.introNarrativeTemplate
      ? { introNarrative: fillTemplate(beat.introNarrativeTemplate, vars) }
      : {}),
    ...(beat.act ? { act: beat.act } : {}),
    choices: beat.terminal
      ? null
      : (beat.choices ?? []).map((c) => ({
          label: fillTemplate(c.labelTemplate, vars),
          userMessage: fillTemplate(c.userMessageTemplate ?? c.labelTemplate, vars),
          next: c.next,
        })),
  };
}

function mergeBeat(base: PackBeatTemplate, override?: Partial<PackBeatTemplate>): PackBeatTemplate {
  if (!override) return base;
  return {
    ...base,
    ...override,
    npcInstructionTemplate: override.npcInstructionTemplate ?? base.npcInstructionTemplate,
    introNarrativeTemplate: override.introNarrativeTemplate ?? base.introNarrativeTemplate,
  };
}

export function randomPackDraft(
  characterId: string,
  opts: { displayName?: string; mood?: PackMood } = {},
): RandomPackDraft {
  const mood = opts.mood && isPackMood(opts.mood) ? opts.mood : pickOne(PACK_MOODS);
  const graphs = packGraphsForMood(mood);
  const graph = weightedPick(graphs.length ? graphs : PACK_GRAPH_TEMPLATES);
  const moodCopy = moodCopyForGraph(graph.id, mood);
  const { companionName, companionRole } = resolveCompanionMeta(characterId, opts.displayName);
  const settingRoll = pickOne(SETTING_PRESETS);
  const vars = {
    companionName,
    companionRole,
    setting: settingRoll,
    mood,
  };

  const titleTemplate = moodCopy?.titleTemplate ?? graph.titleTemplate ?? graph.label;
  const blurbTemplate = moodCopy?.blurbTemplate ?? graph.blurbTemplate ?? '';
  const systemTemplate =
    moodCopy?.systemInstructionTemplate ?? graph.systemInstructionTemplate;

  const nodes: RandomPackDraft['nodes'] = {};
  for (const [nodeId, beat] of Object.entries(graph.nodes)) {
    const merged = mergeBeat(beat, moodCopy?.nodeOverrides?.[nodeId]);
    nodes[nodeId] = expandBeat(merged, vars);
  }

  const draft: RandomPackDraft = {
    characterId,
    title: fillTemplate(titleTemplate, vars),
    blurb: blurbTemplate ? fillTemplate(blurbTemplate, vars) : '',
    mood,
    setting: resolveSetting(graph.settingTemplate, settingRoll),
    situation: fillTemplate(graph.situationTemplate, vars),
    coPresent: graph.coPresent !== false,
    systemInstruction: fillTemplate(systemTemplate, vars),
    nodes,
    meta: { graphTemplateId: graph.id, moodCopyApplied: !!moodCopy },
  };

  const validated = validatePackSpec({
    title: draft.title,
    blurb: draft.blurb,
    mood: draft.mood,
    setting: draft.setting,
    situation: draft.situation,
    coPresent: draft.coPresent,
    systemInstruction: draft.systemInstruction,
    nodes: draft.nodes,
  });
  if (!validated.ok || !validated.spec) {
    throw new Error(validated.error ?? 'pack_draft_invalid');
  }
  return draft;
}

export function pickRandomCharacterId(customCharacterIds: string[] = []): string {
  return pickOne(listRandomCharacterIds(customCharacterIds));
}
