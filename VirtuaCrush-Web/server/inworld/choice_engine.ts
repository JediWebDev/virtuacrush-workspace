// Generates a timed, two-option dialogue choice tied to the character's current
// story state. One option advances their goal / resolves a challenge (and is
// worth a celebratory social post); the other is a softer, divergent path.
// Fails soft: returns null so the caller simply doesn't offer a choice.
import { getLLM } from './client';
import { getLore } from './lore';
import { parseGeneratedChoice, DEFAULT_TIMEOUT_REACTION, type GeneratedChoice } from '../db/choice_util';
import { DATE_LOCATION_SLUGS, LOCATIONS, getLocation, coerceDateLocation } from './scenes';

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

// --- Date & bill choices (dating loop) ---------------------------------------

function llmComplete() {
  return getLLM().then(
    (llm) =>
      llm as unknown as {
        generateContentComplete: (
          opts: { prompt: string },
        ) => Promise<string | { text?: string; content?: string }>;
      },
  );
}

/**
 * A "where should we go / what should we do" date choice. Both options are
 * appealing date ideas at real venues; selecting one moves the scene there.
 */
export async function generateDateChoice(params: {
  characterId: string;
  displayName: string;
  activity: string;
  mood: string;
}): Promise<GeneratedChoice | null> {
  const lore = getLore(params.characterId);
  const menu = DATE_LOCATION_SLUGS.map((s) => `${s} (${LOCATIONS[s].label})`).join(', ');
  const prompt = `You write a short, flirty date invitation for a companion-chat game.

CHARACTER: ${params.displayName}
- Personality: ${lore.personality}
- Right now: ${params.activity || 'free for the evening'} (mood: ${params.mood || 'easy'})

${params.displayName} suggests doing something together and offers the user TWO date ideas to pick from. Each idea must be one of these locations (use the exact slug): ${menu}. Pick two DIFFERENT locations.

Respond with ONLY this JSON (no prose/fences):
{
  "prompt": "<1-2 sentence in-character invite ending in a choice>",
  "options": [
    {"label": "<short, fun button text>", "location": "<slug>", "advancesGoal": false, "reaction": "<their excited reply if chosen>"},
    {"label": "<short, fun button text>", "location": "<slug>", "advancesGoal": false, "reaction": "<their excited reply if chosen>"}
  ],
  "timeoutReaction": "<a brief stage action if the user doesn't answer, e.g. *shrugs and looks away*>"
}`;

  try {
    const llm = await llmComplete();
    const parsed = parseGeneratedChoice(await llm.generateContentComplete({ prompt }));
    if (!parsed) return null;
    // Coerce each option's location to a known date slug.
    parsed.options[0].location = coerceDateLocation(parsed.options[0].location);
    parsed.options[1].location = coerceDateLocation(parsed.options[1].location);
    return parsed;
  } catch (err) {
    console.warn(`[choice] date generation failed for ${params.characterId}:`, err);
    return null;
  }
}

/**
 * A bill choice for when the date is at a paid venue. Option 0 = the user picks
 * up the bill; option 1 = the character pays. Both get a humorous in-voice
 * reaction. Labels are fixed server-side so the semantics are unambiguous.
 */
export async function generateBillChoice(params: {
  characterId: string;
  displayName: string;
  locationSlug: string;
}): Promise<GeneratedChoice | null> {
  const loc = getLocation(params.locationSlug);
  const venue = loc ? loc.description : 'out together';
  const lore = getLore(params.characterId);

  const prompt = `The bill just arrived while ${params.displayName} and the user are ${venue}. Write a light, funny beat about who pays.

CHARACTER personality: ${lore.personality}

Respond with ONLY this JSON (no prose/fences):
{
  "prompt": "<1 sentence: the bill arrives; in-character, a little playful>",
  "reactions": [
    "<funny/grateful reply if the USER insists on paying>",
    "<playful reply if ${params.displayName} pays instead>"
  ],
  "timeoutReaction": "<brief stage action if the user freezes, e.g. *awkwardly slides the bill back and forth*>"
}`;

  const fallback: GeneratedChoice = {
    prompt: 'The bill lands on the table between you...',
    options: [
      { label: "I've got this one 💳", advancesGoal: false, reaction: 'Oh — you didn’t have to, but I’m absolutely letting you. Smooth.' },
      { label: `Let ${params.displayName} get it`, advancesGoal: false, reaction: 'Nope, put your wallet away, this one’s on me. I insist.' },
    ],
    timeoutReaction: '*awkwardly slides the bill back and forth*',
  };

  try {
    const llm = await llmComplete();
    const raw = await llm.generateContentComplete({ prompt });
    const text = typeof raw === 'string' ? raw : (raw?.content ?? raw?.text ?? '');
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return fallback;
    const obj = JSON.parse(m[0]);
    const r = Array.isArray(obj?.reactions) ? obj.reactions : [];
    const pay = typeof r[0] === 'string' && r[0].trim() ? r[0].trim().slice(0, 400) : fallback.options[0].reaction;
    const letPay = typeof r[1] === 'string' && r[1].trim() ? r[1].trim().slice(0, 400) : fallback.options[1].reaction;
    return {
      prompt: typeof obj?.prompt === 'string' && obj.prompt.trim() ? obj.prompt.trim().slice(0, 400) : fallback.prompt,
      options: [
        { label: "I've got this one 💳", advancesGoal: false, reaction: pay },
        { label: `Let ${params.displayName} get it`, advancesGoal: false, reaction: letPay },
      ],
      timeoutReaction:
        typeof obj?.timeoutReaction === 'string' && obj.timeoutReaction.trim()
          ? obj.timeoutReaction.trim().slice(0, 200)
          : DEFAULT_TIMEOUT_REACTION,
    };
  } catch (err) {
    console.warn(`[choice] bill generation failed for ${params.characterId}:`, err);
    return fallback;
  }
}
