// Generates a timed, two-option dialogue choice tied to the character's current
// story state. One option advances their goal / resolves a challenge (and is
// worth a celebratory social post); the other is a softer, divergent path.
// Fails soft: returns null so the caller simply doesn't offer a choice.
import { getLLM } from './client';
import { getLore } from './lore';
import { parseGeneratedChoice, type GeneratedChoice } from '../db/choice_util';

function buildChoicePrompt(params: {
  displayName: string;
  characterId: string;
  activity: string;
  mood: string;
  goalProgress: number;
}): string {
  const lore = getLore(params.characterId);
  return `You write a short, in-character branch point for a companion-chat game.

CHARACTER: ${params.displayName}
- Goal: ${lore.goal}
- Challenges: ${lore.challenges}
- Personality: ${lore.personality}
- Setting: ${lore.setting}
- Right now they are: ${params.activity || 'going about their day'} (mood: ${params.mood || 'neutral'})
- Goal progress: ${params.goalProgress}/100

Create a small dilemma where ${params.displayName} asks the USER to help decide something tied to their current situation or goal. Give exactly TWO options:
- Option 1 ADVANCES the goal or resolves a challenge (set advancesGoal true) and includes a short, upbeat social-media "post" they'd make if the user helps.
- Option 2 is a softer, more personal/divergent choice (advancesGoal false, no post).

Keep it warm and in-voice. Labels are short button text (max ~8 words). Reactions are one sentence, in character.

Respond with ONLY this JSON (no prose, no fences):
{
  "prompt": "<1-2 sentence in-character setup ending in a choice>",
  "options": [
    {"label": "<option 1 button text>", "advancesGoal": true, "reaction": "<their reply if chosen>", "post": "<short celebratory social post>"},
    {"label": "<option 2 button text>", "advancesGoal": false, "reaction": "<their reply if chosen>"}
  ],
  "timeoutReaction": "<a brief stage action for when the user doesn't answer in time, e.g. *sighs and turns away*>"
}`;
}

export async function generateChoice(params: {
  characterId: string;
  displayName: string;
  activity: string;
  mood: string;
  goalProgress: number;
}): Promise<GeneratedChoice | null> {
  try {
    const llm = await getLLM();
    const llmAny = llm as unknown as {
      generateContentComplete: (
        opts: { prompt: string },
      ) => Promise<string | { text?: string; content?: string }>;
    };
    const result = await llmAny.generateContentComplete({ prompt: buildChoicePrompt(params) });
    return parseGeneratedChoice(result);
  } catch (err) {
    console.warn(`[choice] generation failed for ${params.characterId}:`, err);
    return null;
  }
}
