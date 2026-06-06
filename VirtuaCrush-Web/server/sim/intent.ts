// Layer 1 contract. The Referee LLM classifies the player's action into one of a
// small CLOSED set of categories (stable for persistence) plus a free-text
// subtype SUGGESTION. The engine then NORMALIZES that suggestion to a canonical
// subtype per category, so "cute teasing flirt", "soft_flirt_attempt", and
// "charismatic flirt" all collapse to `flirt` and the schema never rots.
// Pure + fail-soft.

export const INTENT_CATEGORIES = [
  'social',       // talking, bonding, general interaction (incl. lies, jokes, comfort)
  'romance',      // flirting, dating, intimacy attempts
  'transaction',  // buying, gifting, tipping, paying
  'movement',     // travel, entering/leaving, following
  'conflict',     // insults, threats, arguments (non-criminal aggression)
  'crime',        // illegal acts (handled by the law system)
  'work',         // job-related actions (NPC or player)
  'observation',  // watching, inspecting, gathering info (no state change)
] as const;
export type IntentCategory = (typeof INTENT_CATEGORIES)[number];

// SOCIAL vs CRIME — the deception boundary (engine rule, not a morality call):
// the dividing line is SYSTEMIC CONSEQUENCE, not how "bad" the act feels.
//   - Verbal manipulation inside the interaction (a white lie, flattery, a bluff)
//     stays in `social` (subtype 'lie' / 'manipulate') -> affinity/trust effects only.
//   - Deception with systemic impact (fraud, scams, theft) is `crime` -> handled by
//     the law system (arrest, restitution, responders).
// Examples: "I lie about liking her dress" -> social/lie;
//           "I scam her out of her money" -> crime/fraud.
export type SpendTier = 'modest' | 'big' | 'lavish';

export interface PlayerIntent {
  type: IntentCategory;
  subtype: string;        // canonical after normalization
  target?: string;        // npc id or 'venue'
  magnitude?: SpendTier;
  detail?: string;
}

export interface RefereeOutput {
  interpretation: string;
  intent: PlayerIntent;
  affectedNpcs: string[];
  npcIntentHints: { npc: string; wants: string }[];
}

// --- Canonical subtype sets + synonym normalization (engine-owned) -----------

const CANONICAL: Record<IntentCategory, string[]> = {
  social: ['smalltalk', 'compliment', 'tease', 'joke', 'share', 'apologize', 'comfort', 'help', 'boast', 'lie', 'manipulate'],
  romance: ['flirt', 'affection', 'confession', 'date_request', 'kiss_attempt', 'proposition', 'breakup', 'reject'],
  transaction: ['buy', 'gift', 'tip', 'pay'],
  movement: ['go', 'leave', 'arrive', 'follow'],
  conflict: ['insult', 'provoke', 'threaten', 'intimidate', 'argue'],
  crime: ['theft', 'shoplift', 'armed_robbery', 'arson', 'assault', 'vandalism', 'kidnapping', 'fraud', 'reckless_endangerment'],
  work: ['do_job', 'ask_about_work', 'help_with_work'],
  observation: ['look', 'wait', 'inspect', 'watch', 'eavesdrop'],
};
const SYNONYMS: Record<IntentCategory, Record<string, string>> = {
  social: { praise: 'compliment', thank: 'compliment', greet: 'smalltalk', chat: 'smalltalk', vent: 'share', sorry: 'apologize', console: 'comfort', assist: 'help', brag: 'boast', trick: 'manipulate', deceiv: 'lie' },
  romance: { kiss: 'kiss_attempt', date: 'date_request', propose: 'proposition', 'break up': 'breakup', dump: 'breakup', confess: 'confession', adore: 'affection' },
  transaction: { purchase: 'buy', spend: 'buy', present: 'gift', give: 'gift' },
  movement: { walk: 'go', travel: 'go', head: 'go', enter: 'arrive', exit: 'leave', depart: 'leave', tail: 'follow', chase: 'follow' },
  conflict: { mock: 'insult', yell: 'argue', fight_words: 'argue', menace: 'threaten' },
  crime: { rob: 'armed_robbery', mug: 'armed_robbery', steal: 'theft', burn: 'arson', torch: 'arson', attack: 'assault', punch: 'assault', hit: 'assault', vandal: 'vandalism', smash: 'vandalism', destroy: 'vandalism', kidnap: 'kidnapping', hostage: 'kidnapping', scam: 'fraud', reckless: 'reckless_endangerment' },
  work: { job: 'do_job', shift: 'do_job', working: 'do_job' },
  observation: { spy: 'watch', observe: 'look', listen: 'eavesdrop', stare: 'look' },
};
const DEFAULT: Record<IntentCategory, string> = {
  social: 'smalltalk', romance: 'flirt', transaction: 'buy', movement: 'go',
  conflict: 'argue', crime: 'theft', work: 'do_job', observation: 'look',
};

/** Collapses an LLM's free-text subtype to the canonical one for its category. */
export function normalizeSubtype(category: IntentCategory, raw: string): string {
  const low = (raw || '').toLowerCase().replace(/[_-]+/g, ' ').trim();
  if (low) {
    for (const c of CANONICAL[category]) {
      if (low.includes(c.replace(/_/g, ' '))) return c;
    }
    const syn = SYNONYMS[category];
    for (const k of Object.keys(syn)) {
      if (low.includes(k.replace(/_/g, ' '))) return syn[k];
    }
  }
  return DEFAULT[category];
}

const CATEGORY_SET = new Set<string>(INTENT_CATEGORIES);
const TIERS = new Set<SpendTier>(['modest', 'big', 'lavish']);
function str(v: unknown): string { return typeof v === 'string' ? v.trim() : ''; }

/** Validates + normalizes a raw intent. Unknown CATEGORY -> null (fail soft). */
export function validateIntent(raw: unknown): PlayerIntent | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const type = str(o.type) as IntentCategory;
  if (!CATEGORY_SET.has(type)) return null;
  const tier = str(o.magnitude) as SpendTier;
  return {
    type,
    subtype: normalizeSubtype(type, str(o.subtype)),
    target: str(o.target) || undefined,
    magnitude: TIERS.has(tier) ? tier : undefined,
    detail: str(o.detail) || undefined,
  };
}

export function parseRefereeOutput(raw: string | { text?: string; content?: string }): RefereeOutput {
  const fallback: RefereeOutput = {
    interpretation: '', intent: { type: 'observation', subtype: 'wait' }, affectedNpcs: [], npcIntentHints: [],
  };
  const text = typeof raw === 'string' ? raw : (raw?.content ?? raw?.text ?? '');
  if (!text) return fallback;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return fallback;
  let obj: Record<string, unknown>;
  try { obj = JSON.parse(m[0]); } catch { return fallback; }
  const intent = validateIntent(obj.intent) ?? fallback.intent;
  const affectedNpcs = Array.isArray(obj.affectedNpcs) ? obj.affectedNpcs.map(str).filter(Boolean) : [];
  const npcIntentHints = Array.isArray(obj.npcIntentHints)
    ? (obj.npcIntentHints as unknown[]).map((h) => {
        const ho = (h ?? {}) as Record<string, unknown>;
        return { npc: str(ho.npc), wants: str(ho.wants) };
      }).filter((h) => h.npc && h.wants)
    : [];
  return { interpretation: str(obj.interpretation), intent, affectedNpcs, npcIntentHints };
}
