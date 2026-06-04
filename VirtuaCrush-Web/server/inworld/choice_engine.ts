// Generates a timed, two-option dialogue choice tied to the character's current
// story state. One option advances their goal / resolves a challenge (and is
// worth a celebratory social post); the other is a softer, divergent path.
// Fails soft: returns null so the caller simply doesn't offer a choice.
import { getLLM } from './client';
import { getLore } from './lore';
import { parseGeneratedChoice, DEFAULT_TIMEOUT_REACTION, type GeneratedChoice, type BillData } from '../db/choice_util';
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
  const allowed = (lore.preferredLocations.length ? lore.preferredLocations : DATE_LOCATION_SLUGS).filter(
    (slug) => LOCATIONS[slug],
  );
  const menu = allowed.map((slug) => `${slug} (${LOCATIONS[slug].label})`).join(', ');
  const prompt = `You write a short, flirty date invitation for a companion-chat game.

CHARACTER: ${params.displayName}
- Personality: ${lore.personality}
- The kinds of dates you actually like: ${lore.datePreference}
- Transport: you ${lore.hasCar ? 'have a car' : 'do NOT have a car'} (${lore.transport})
- Right now: ${params.activity || 'free for the evening'} (mood: ${params.mood || 'easy'})

${params.displayName} suggests doing something together and offers the user TWO date ideas that fit ${params.displayName}'s taste. Each idea MUST be one of these locations (use the exact slug): ${menu}. Pick two DIFFERENT locations.

IMPORTANT: each "reaction" is excited about that place and warmly tells the user to come find/meet you there when they're ready (they'll head over to start the date).

Respond with ONLY this JSON (no prose/fences):
{
  "prompt": "<1-2 sentence in-character invite ending in a choice>",
  "options": [
    {"label": "<short, fun button text>", "location": "<slug>", "advancesGoal": false, "reaction": "<excited reply telling them to come meet you there when ready>"},
    {"label": "<short, fun button text>", "location": "<slug>", "advancesGoal": false, "reaction": "<excited reply telling them to come meet you there when ready>"}
  ],
  "timeoutReaction": "<a brief stage action if the user doesn't answer, e.g. *shrugs and looks away*>"
}`;

  try {
    const llm = await llmComplete();
    const parsed = parseGeneratedChoice(await llm.generateContentComplete({ prompt }));
    if (!parsed) return null;
    // Coerce each option's location: keep it if it's one the character prefers,
    // otherwise fall back to a sensible dateable slug.
    const pick = (loc: string | undefined) =>
      loc && allowed.includes(loc) ? loc : coerceDateLocation(loc ?? allowed[0]);
    parsed.options[0].location = pick(parsed.options[0].location);
    parsed.options[1].location = pick(parsed.options[1].location);
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

// --- Itemized "end date" bill ------------------------------------------------

export interface GeneratedBill {
  prompt: string;
  bill: BillData;
  payReaction: string; // when the USER pays (grateful/teasing)
  ventReaction: string; // when the CHARACTER gets stuck paying (annoyed, viral)
  timeoutReaction: string;
}

function roundMoney(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/**
 * Generates an itemized bill for ending a date, factoring in anything chaotic
 * that happened (from the recent conversation) — e.g. broken fixtures. Fails
 * soft to a sensible default bill.
 */
export async function generateItemizedBill(params: {
  characterId: string;
  displayName: string;
  locationSlug: string;
  recentText: string;
}): Promise<GeneratedBill> {
  const loc = getLocation(params.locationSlug);
  const venue = loc ? loc.label : 'the date';
  const venueDesc = loc ? loc.description : 'out together';

  const fallback: GeneratedBill = {
    prompt: `The bill for ${venue} lands on the table...`,
    bill: { items: [{ label: `${venue} for two`, amount: 46 }], total: 46 },
    payReaction: "Oh — you're getting this? Look at you. I'm impressed, honestly.",
    ventReaction: `Wait, I'm paying? Again? Unbelievable. I'm putting this on my story, everyone needs to know.`,
    timeoutReaction: '*awkwardly slides the bill back and forth across the table*',
  };

  const prompt = `Itemize the final bill for a date that is ending. ${params.displayName} and the user were ${venueDesc}.

Base it on a realistic ${venue} outing, PLUS anything notable or chaotic that happened in the recent conversation below — if the user caused damage or mayhem (e.g. broke a bathroom fixture, knocked over a display, ordered absurdly), add a pricey, funny line item for it.

RECENT CONVERSATION:
"""
${params.recentText.slice(0, 2500)}
"""

Respond with ONLY this JSON (no prose/fences). Amounts are plain USD numbers:
{
  "prompt": "<1 sentence, in-character, the bill arrives>",
  "items": [ {"label": "<line item>", "amount": <number>}, ... 2 to 5 items ],
  "payReaction": "<${params.displayName}, grateful/teasing, when the USER pays>",
  "ventReaction": "<${params.displayName}, genuinely annoyed and venting in a funny, shareable way, when THEY get stuck with the bill>",
  "timeoutReaction": "<brief stage action if the user freezes>"
}`;

  try {
    const llm = await llmComplete();
    const raw = await llm.generateContentComplete({ prompt });
    const text = typeof raw === 'string' ? raw : (raw?.content ?? raw?.text ?? '');
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return fallback;
    const obj = JSON.parse(m[0]);

    const items = Array.isArray(obj?.items)
      ? obj.items
          .map((it: any) => ({
            label: typeof it?.label === 'string' ? it.label.trim().slice(0, 80) : '',
            amount: roundMoney(Number(it?.amount)),
          }))
          .filter((it: { label: string; amount: number }) => it.label && it.amount > 0)
          .slice(0, 6)
      : [];
    if (items.length === 0) return fallback;

    const total = roundMoney(items.reduce((s: number, it: { amount: number }) => s + it.amount, 0));
    const str = (v: unknown, fb: string) =>
      typeof v === 'string' && v.trim() ? v.trim().slice(0, 400) : fb;

    return {
      prompt: str(obj?.prompt, fallback.prompt),
      bill: { items, total },
      payReaction: str(obj?.payReaction, fallback.payReaction),
      ventReaction: str(obj?.ventReaction, fallback.ventReaction),
      timeoutReaction: str(obj?.timeoutReaction, fallback.timeoutReaction).slice(0, 200),
    };
  } catch (err) {
    console.warn(`[choice] bill generation failed for ${params.characterId}:`, err);
    return fallback;
  }
}

// --- Arrival greeting (planning -> on_date) ----------------------------------

/**
 * A short in-character greeting for when the user shows up and the date begins.
 * Returns a plain line (may contain *stage directions*). Fails soft.
 */
export async function generateArrivalGreeting(params: {
  characterId: string;
  displayName: string;
  locationSlug: string;
}): Promise<string> {
  const loc = getLocation(params.locationSlug);
  const venue = loc ? loc.description : 'together';
  const lore = getLore(params.characterId);
  const fallback = `*${params.displayName} looks up and brightens* Oh — you made it! Hi.`;

  const prompt = `You are ${params.displayName}. Personality: ${lore.personality}.
The user has just shown up and your date is beginning — you are now together ${venue}.
Greet them warmly, in character, in 1-2 sentences, reacting to them arriving. You may include a brief *stage direction* in asterisks.
Output ONLY the line, nothing else.`;

  try {
    const llm = await llmComplete();
    const raw = await llm.generateContentComplete({ prompt });
    const text = typeof raw === 'string' ? raw : (raw?.content ?? raw?.text ?? '');
    const line = text.trim().replace(/^["']|["']$/g, '').slice(0, 400);
    return line || fallback;
  } catch (err) {
    console.warn(`[choice] arrival greeting failed for ${params.characterId}:`, err);
    return fallback;
  }
}
