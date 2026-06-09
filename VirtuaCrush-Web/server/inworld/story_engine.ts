// Emergent story engine: generates a character's daily "current situation" from
// their lore and the prior day's state, advancing them toward their goal while
// reacting to their challenges. Uses the Inworld LLM; fails soft to a
// deterministic seed-based fallback so the story never blocks chat.
import { completePrompt } from '../llm';
import { getLore } from './lore';
import {
  parseGeneratedState,
  fallbackGeneratedState,
  utcDateString,
  type GeneratedState,
} from '../db/story_util';

export interface PriorState {
  activity: string;
  mood: string;
  goalProgress: number;
}

function buildStatePrompt(params: {
  displayName: string;
  characterId: string;
  prior: PriorState | null;
  today: string;
}): string {
  const lore = getLore(params.characterId);
  const priorBlock = params.prior
    ? `Yesterday they were: ${params.prior.activity} (mood: ${params.prior.mood}). Goal progress so far: ${params.prior.goalProgress}/100.`
    : `This is the first day of their storyline. Goal progress so far: 0/100.`;

  return `You are the story simulation for a character in a companion app. Generate what ${params.displayName} is doing TODAY, continuing their ongoing story.

CHARACTER
- Backstory: ${lore.backstory}
- Long-term goal: ${lore.goal}
- Challenges: ${lore.challenges}
- Fears: ${lore.fears}
- Personality: ${lore.personality}
- Voice: ${lore.voice}
- Driven by: ${lore.desires.join(', ')}
- Prone to moods: ${lore.moodProneness.join(', ')}
- Setting: ${lore.setting}
- Example activities: ${lore.activitySeeds.join('; ')}

CONTINUITY
${priorBlock}
Today is ${params.today}.

TASK
Write today's situation as a believable next beat in their story — usually a small step toward the goal or a reaction to a challenge. Keep it concrete and grounded in their setting.

Respond with ONLY a JSON object (no prose, no markdown fences):
{
  "activity": "<present-continuous, one sentence, e.g. 'grinding the ranked ladder before tonight's stream'>",
  "mood": "<1-4 words; lean toward one of: ${lore.moodProneness.join(', ')}>",
  "headline": "<a compact status line, max ~8 words>",
  "goalDelta": <integer 0-15, how much progress today made toward the goal>
}`;
}

/**
 * Generates today's state for a character. Never throws: on any failure it
 * returns a deterministic fallback derived from the lore's activity seeds.
 */
export async function generateDailyState(params: {
  characterId: string;
  displayName: string;
  prior: PriorState | null;
  today?: string;
}): Promise<GeneratedState> {
  const today = params.today ?? utcDateString();
  const lore = getLore(params.characterId);
  try {
    const prompt = buildStatePrompt({
      displayName: params.displayName,
      characterId: params.characterId,
      prior: params.prior,
      today,
    });
    const result = await completePrompt(prompt);
    const parsed = parseGeneratedState(result);
    if (parsed) return parsed;
    console.warn(`[story] unparseable state for ${params.characterId}; using fallback`);
  } catch (err) {
    console.warn(`[story] generation failed for ${params.characterId}:`, err);
  }
  return fallbackGeneratedState(lore.activitySeeds, today);
}
