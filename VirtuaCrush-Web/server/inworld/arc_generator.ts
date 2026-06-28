// Emergent story-arc generation. In free roam, when no arc is active, an LLM
// "story designer" reads the recent conversation + the companion's lore and
// proposes a SHORT, in-character arc that deepens the relationship — or skips.
// The result is validated into a UserArcSpec and played through the same
// user:<id> arc runtime as Studio-authored arcs.
import { completePrompt } from '../llm';
import { getLore } from './lore';
import { validateArcSpec, type UserArcSpec } from './user_arc';

export interface EmergentArcInput {
  characterId: string;
  displayName: string;
  affinity: number;
  history: { role: 'user' | 'assistant'; content: string }[];
  recentBeats?: string[];
}

export interface GeneratedArc {
  spec: UserArcSpec;
  title: string;
  blurb: string;
}

const MIN_AFFINITY = Math.max(0, Number(process.env.EMERGENT_ARC_MIN_AFFINITY ?? 8));
const MIN_HISTORY = 6;
// Steady, cheap pacing: at most one generation ATTEMPT per character per window.
const COOLDOWN_MS = Math.max(0, Number(process.env.EMERGENT_ARC_COOLDOWN_MS ?? 3 * 60 * 60 * 1000));

export function emergentArcCooldownMs(): number {
  return COOLDOWN_MS;
}

/** Cheap pre-gate so we only spend an LLM call when conditions are right. */
export function shouldAttemptEmergentArc(opts: {
  meetComplete: boolean;
  hasActiveArc: boolean;
  affinity: number;
  historyLen: number;
  lastAttemptAt: Date | null;
  now?: number;
}): boolean {
  if (!opts.meetComplete) return false;
  if (opts.hasActiveArc) return false;
  if (opts.affinity < MIN_AFFINITY) return false;
  if (opts.historyLen < MIN_HISTORY) return false;
  const now = opts.now ?? Date.now();
  if (opts.lastAttemptAt && now - opts.lastAttemptAt.getTime() < COOLDOWN_MS) return false;
  return true;
}

const NARRATIVE_TAGS =
  'romance, friendship, conflict, trust, jealousy, work, family, health, money, social, stress, growth, isolation, stability, chaos';

function buildPrompt(input: EmergentArcInput): string {
  const lore = getLore(input.characterId);
  const name = input.displayName;
  const transcript = input.history
    .slice(-12)
    .map((m) => `${m.role === 'user' ? 'Player' : name}: ${m.content}`)
    .join('\n');
  const beats = (input.recentBeats ?? []).slice(-6).map((b) => `- ${b}`).join('\n');

  return (
`You are a story designer for a relationship sim. Propose a SHORT, in-character story arc ONLY if the recent conversation creates a natural opportunity that genuinely fits this companion.

COMPANION: ${name}
Personality: ${lore.personality}
Goal: ${lore.goal}
Fears: ${lore.fears}
Desires: ${lore.desires.join(', ')}
Voice: ${lore.voice}
Logistics: ${lore.hasCar ? 'has a car' : 'no car'}; ${lore.transport}. Ideal dates: ${lore.datePreference}.
Current closeness with the player: ${Math.round(input.affinity)}/100.

RECENT CONVERSATION (newest last):
${transcript || '(not much yet)'}
${beats ? `\nRECENT MEMORIES:\n${beats}\n` : ''}
DECIDE honestly: is there a strong, natural next step that (a) grows out of something you've actually been talking about, (b) fits ${name}'s personality, goals, desires, and fears, and (c) deepens the relationship? Weigh fit against character: a cautious homebody would NOT agree to skydiving; a reckless thrill-seeker would. A small, believable next step beats a wild leap.

If there is NO genuinely good, in-character opportunity right now, output exactly: {"skip": true}

If there IS, output ONLY this JSON (no prose):
{
  "title": "<short arc title>",
  "blurb": "<one-sentence summary>",
  "setting": "<short phrase for where it happens>",
  "situation": "<authoritative present-tense scene: where ${name} and the player are and what is happening; they are physically together>",
  "coPresent": true,
  "introNarrative": "<1-2 sentence neutral third-person scene opener>",
  "npcInstruction": "<how ${name} should behave in this arc, in character>",
  "completionCriteria": "<what must happen for this arc to resolve>",
  "completionExamples": ["<example beat>", "<example beat>"],
  "tone": "light | serious | romantic | dramatic",
  "arcTags": ["<2-3 from: ${NARRATIVE_TAGS}>"]
}`
  );
}

/**
 * Calls the LLM to propose an emergent arc. Returns a validated arc (spec +
 * title/blurb) or null when the model skips or output is unusable. Fails soft.
 */
export async function generateEmergentArc(input: EmergentArcInput): Promise<GeneratedArc | null> {
  let raw: string;
  try {
    raw = await completePrompt(buildPrompt(input), { json: true, maxTokens: 700, temperature: 0.9 });
  } catch (e) {
    console.warn('[arc_gen] generation call failed:', e);
    return null;
  }

  let obj: Record<string, unknown>;
  try {
    const s = raw.indexOf('{');
    const e = raw.lastIndexOf('}');
    obj = JSON.parse(s >= 0 && e > s ? raw.slice(s, e + 1) : raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (obj.skip === true) return null;

  const v = validateArcSpec(obj);
  if (!v.ok || !v.spec) return null;

  const title =
    typeof obj.title === 'string' && obj.title.trim()
      ? obj.title.trim().slice(0, 120)
      : `A moment with ${input.displayName}`;
  const blurb = typeof obj.blurb === 'string' ? obj.blurb.trim().slice(0, 400) : '';
  return { spec: v.spec, title, blurb };
}
