/**
 * Starter CYOA graph templates — valid graphs only; mood copy can overlay phrasing later.
 */
import type { PackGraphTemplate, PackMoodCopyTemplate } from './types';

/** Linear three-beat story: setup → complication → ending. */
export const PACK_GRAPH_TEMPLATES: PackGraphTemplate[] = [
  {
    id: 'pack_linear_three_beat',
    label: 'Linear three-beat',
    moods: ['dramatic', 'romantic', 'tense', 'cozy', 'playful'],
    arcTags: ['growth'],
    coPresent: true,
    titleTemplate: 'One Night at {{setting}}',
    blurbTemplate: 'A short {{mood}} story with one choice that matters.',
    settingTemplate: '{{setting}}',
    situationTemplate:
      `You and {{companionName}} are thrown into a {{mood}} situation at {{setting}} — ` +
      `something small goes wrong, and how you respond sets the tone for the whole night.`,
    systemInstructionTemplate:
      `Keep pacing tight: {{mood}} tone throughout. {{companionName}} reacts in character. ` +
      `Player choices should feel distinct; no fake branches.`,
    nodes: {
      start: {
        act: 'beginning',
        introNarrativeTemplate: `The night starts ordinary — then it isn't.`,
        npcInstructionTemplate:
          `{{companionName}} notices the problem first and looks to the player — curious how they'll handle it.`,
        choices: [
          { labelTemplate: 'Take charge', userMessageTemplate: 'I’ve got this — follow my lead.', next: 'middle' },
          { labelTemplate: 'Ask what they think', userMessageTemplate: 'What do you want to do?', next: 'middle' },
        ],
      },
      middle: {
        act: 'middle',
        npcInstructionTemplate:
          `The complication escalates. {{companionName}} mirrors the player's earlier choice — bolder if they led, collaborative if they asked.`,
        choices: [
          { labelTemplate: 'Double down', userMessageTemplate: 'No backing out now.', next: 'end' },
          { labelTemplate: 'Find a compromise', userMessageTemplate: 'There has to be a middle ground.', next: 'end' },
        ],
      },
      end: {
        act: 'end',
        terminal: true,
        npcInstructionTemplate:
          `Bring the night to a {{mood}} landing — payoff the player's approach and close on an emotional button.`,
      },
    },
    weight: 2,
  },
  {
    id: 'pack_fork_two_endings',
    label: 'Fork with two endings',
    moods: ['thriller', 'mystery', 'gothic', 'dramatic'],
    arcTags: ['chaos', 'trust'],
    coPresent: true,
    titleTemplate: 'The Door at {{setting}}',
    blurbTemplate: 'Two paths, two endings — choose carefully.',
    settingTemplate: 'a dusty community theater backstage',
    situationTemplate:
      `Backstage after hours, you and {{companionName}} find a door that shouldn't open — and footsteps in the dark.`,
    systemInstructionTemplate:
      `{{mood}} mystery energy. {{companionName}} is scared but functional. Never resolve the unknown too early.`,
    nodes: {
      start: {
        act: 'beginning',
        introNarrativeTemplate: `Backstage is supposed to be empty after hours. The door in front of you says otherwise.`,
        npcInstructionTemplate:
          `{{companionName}} whispers what they heard and waits for the player's call — investigate or leave.`,
        choices: [
          { labelTemplate: 'Open the door', userMessageTemplate: 'We’re opening it. Stand back.', next: 'bold' },
          { labelTemplate: 'Get out now', userMessageTemplate: 'Nope — we’re leaving. Now.', next: 'cautious' },
        ],
      },
      bold: {
        act: 'end',
        terminal: true,
        npcInstructionTemplate:
          `The bold path pays off with a reveal — unsettling but survivable. {{companionName}} respects the nerve.`,
      },
      cautious: {
        act: 'end',
        terminal: true,
        npcInstructionTemplate:
          `The cautious path escapes clean — but something follows you in memory. {{companionName}} is quietly grateful.`,
      },
    },
    weight: 1,
  },
];

export const PACK_MOOD_COPY: PackMoodCopyTemplate[] = [
  {
    graphId: 'pack_linear_three_beat',
    mood: 'comedic',
    systemInstructionTemplate:
      `Play it for laughs — {{mood}} banter, physical comedy, and affectionate roasting. Still complete in three beats.`,
    nodeOverrides: {
      start: {
        npcInstructionTemplate:
          `{{companionName}} overreacts comedically to the problem and pretends it's a documentary.`,
      },
    },
  },
  {
    graphId: 'pack_linear_three_beat',
    mood: 'romantic',
    systemInstructionTemplate:
      `Soft {{mood}} tension — lingering looks, small touches, sincere compliments between the beats.`,
  },
];

export function getPackGraph(id: string): PackGraphTemplate | undefined {
  return PACK_GRAPH_TEMPLATES.find((t) => t.id === id);
}

export function packGraphsForMood(mood: PackGraphTemplate['moods'][number]): PackGraphTemplate[] {
  return PACK_GRAPH_TEMPLATES.filter((t) => t.moods.includes(mood));
}

export function moodCopyForGraph(graphId: string, mood: PackMoodCopyTemplate['mood']): PackMoodCopyTemplate | undefined {
  return PACK_MOOD_COPY.find((c) => c.graphId === graphId && c.mood === mood);
}
