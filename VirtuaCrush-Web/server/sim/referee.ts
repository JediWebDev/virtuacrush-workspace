// Layer 1: the Referee. Builds the prompt that asks an LLM to CLASSIFY the
// player's action into the locked {type, subtype} taxonomy and name affected
// NPCs — never consequences. The completion function is injected, so this module
// is pure-testable and carries no model-runtime dependency. Output is parsed by
// the already-tested parseRefereeOutput (fail-soft).
import { parseRefereeOutput, INTENT_CATEGORIES, type RefereeOutput } from './intent';
import type { WorldState } from './world';

export interface RefereeActor { id: string; name: string; role?: string }
export interface RefereeInput {
  message: string;
  scene: { phase: string; where: string; companion?: RefereeActor | null; present: RefereeActor[] };
  roster: RefereeActor[]; // known people the referee may reference by id
  history?: { role: 'user' | 'assistant'; content: string }[];
}

const CATEGORY_GUIDE: Record<string, string> = {
  social: 'talking/bonding — smalltalk, compliment, tease, joke, comfort, help, lie, manipulate',
  romance: 'flirting/dating/intimacy — flirt, affection, confession, date_request, kiss_attempt, breakup, reject',
  transaction: 'ONLY when the player explicitly buys, pays for, gifts, or tips something specific (buy, gift, tip) — NOT ordinary talk or merely being at a venue. Set "magnitude": modest|big|lavish for a real purchase.',
  movement: 'going places — go, leave, arrive, follow (set "target" to the destination)',
  conflict: 'non-criminal aggression — insult, provoke, threaten, intimidate, argue',
  crime: 'illegal acts — theft, shoplift, armed_robbery, arson, assault, vandalism, kidnapping, fraud, reckless_endangerment. Setting off fireworks/explosives or starting a fire indoors IS a crime (arson if it ignites, otherwise reckless_endangerment).',
  work: 'job actions — do_job, ask_about_work, help_with_work',
  observation: 'looking/waiting/gathering info — look, wait, inspect, watch, eavesdrop',
};

const MAX_HISTORY = 3;

/** Pure: builds the referee classification prompt from a compact world view. */
export function buildRefereePrompt(input: RefereeInput): string {
  const categories = INTENT_CATEGORIES.map((c) => `- ${c}: ${CATEGORY_GUIDE[c] ?? ''}`).join('\n');
  const companion = input.scene.companion ? `${input.scene.companion.name} (${input.scene.companion.id})` : 'none';
  const present = input.scene.present.length ? input.scene.present.map((a) => a.name).join(', ') : 'no one else';
  const roster = input.roster.length ? input.roster.map((a) => `${a.id} (${a.name})`).join(', ') : 'none';
  const history = (input.history ?? [])
    .slice(-MAX_HISTORY)
    .map((m) => `${m.role === 'user' ? 'PLAYER' : 'SCENE'}: ${m.content}`)
    .join('\n');

  return (
`You are the REFEREE of a social simulation (a dating game). Your ONLY job is to CLASSIFY what the player just did into a structured intent. You do NOT decide consequences — no arrests, no affinity numbers, no outcomes. The engine decides those. Classify only.

CATEGORIES (choose exactly one "type"):
${categories}
"subtype" is your best short label within that category; the engine normalizes it.
When in doubt, prefer "social" or "romance". Reserve "crime", "conflict", and "transaction" for clear, deliberate, explicit actions — never for ordinary conversation.

INPUT CONVENTION: text wrapped in *asterisks* is a physical ACTION the player performs; other text is them speaking aloud.

CURRENT SCENE: phase=${input.scene.phase}, location=${input.scene.where}. Companion: ${companion}. Present: ${present}.
KNOWN PEOPLE (use these ids for "target" and "affectedNpcs"): ${roster}

${history ? 'RECENT:\n' + history + '\n' : ''}PLAYER: ${input.message}

Respond with ONLY this JSON (no prose, no code fences):
{
  "interpretation": "<one plain sentence describing what the player did>",
  "intent": { "type": "<category>", "subtype": "<short label>", "target": "<npc id, 'venue', or omit>", "magnitude": "<modest|big|lavish or omit>", "detail": "<optional>" },
  "affectedNpcs": ["<npc id>"],
  "npcIntentHints": [ { "npc": "<npc id>", "wants": "<what they might want to do in response>" } ]
}`
  );
}

/** Runs the referee. `complete` is the injected one-shot completion fn. Fail-soft. */
export async function extractIntent(
  input: RefereeInput,
  complete: (prompt: string) => Promise<string>,
): Promise<RefereeOutput> {
  try {
    const raw = await complete(buildRefereePrompt(input));
    return parseRefereeOutput(raw);
  } catch {
    return { interpretation: '', intent: { type: 'observation', subtype: 'wait' }, affectedNpcs: [], npcIntentHints: [] };
  }
}

/** Builds a RefereeInput from a WorldState + the player's message. Pure. */
export function refereeInputFromWorld(
  world: WorldState,
  message: string,
  history?: { role: 'user' | 'assistant'; content: string }[],
): RefereeInput {
  const companion = world.npcs[world.scene.companionId];
  const present = world.scene.presentNpcIds.map((id) => ({ id, name: world.npcs[id]?.name ?? id }));
  const roster = Object.values(world.npcs).map((n) => ({ id: n.id, name: n.name, role: n.role }));
  return {
    message,
    scene: {
      phase: world.scene.phase,
      where: world.scene.where,
      companion: companion ? { id: companion.id, name: companion.name } : null,
      present,
    },
    roster,
    history,
  };
}

