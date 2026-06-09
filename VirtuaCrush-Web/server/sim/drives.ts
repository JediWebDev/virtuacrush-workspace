// Drive/desire engine. Each character carries a few "drive" meters (0-100) that
// build over time and context. Crossing a FLAVOR threshold colors their next
// reply (reactive); crossing the higher EVENT threshold surfaces an explicit
// event card the player answers with encourage / redirect / decline.
//
// All characters are adults. Content here is suggestive at most — the running
// model writes the actual dialogue. The loop is consent-first: the character
// proposes, the player decides, nothing is forced.

export type DriveKey = string;
export type ChoiceKind = 'encourage' | 'redirect' | 'decline';

export interface DriveDef {
  key: DriveKey;
  label: string;
  baseline: number;       // resting value the meter drifts back toward
  /** Growth per hour while a condition holds. */
  growth: { apart?: number; together?: number; night?: number; perAffinity?: number; afterPositive?: number };
  decay: number;          // drift toward baseline per hour
  flavorThreshold: number;
  eventThreshold: number;
  /** Reactive prompt snippet injected when over the flavor threshold. */
  flavor: string;
  /** Event card copy shown when over the event threshold. */
  event: { prompt: string; encourage: string; redirect: string; decline: string };
}

export interface DriveContext {
  affinity: number;       // 0-100 current affinity
  apart: boolean;         // not currently co-present / on a date
  night: boolean;         // local night hours
  afterPositive: boolean; // the last exchange went well
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

// --- Drive definitions -------------------------------------------------------
// Two common drives everyone has, plus one per-character "quirk" drive.

function desireDrive(): DriveDef {
  return {
    key: 'desire',
    label: 'Desire',
    baseline: 25,
    growth: { apart: 5, night: 4, perAffinity: 0.05, afterPositive: 6 },
    decay: 6,
    flavorThreshold: 55,
    eventThreshold: 82,
    flavor: 'You ache to be closer to the player right now — let your wanting bleed into your words and lean in.',
    event: {
      prompt: 'has been thinking about you all evening and wants to get closer tonight.',
      encourage: 'Lean in',
      redirect: 'Slow down',
      decline: 'Not tonight',
    },
  };
}

function playfulDrive(): DriveDef {
  return {
    key: 'playful',
    label: 'Playful',
    baseline: 30,
    growth: { together: 5, afterPositive: 5 },
    decay: 5,
    flavorThreshold: 55,
    eventThreshold: 86,
    flavor: 'You feel mischievous and flirty — tease the player, push a little, keep it light and charged.',
    event: {
      prompt: 'is in a wicked mood and wants to play a daring little game with you.',
      encourage: 'Play along',
      redirect: 'Maybe later',
      decline: 'Behave',
    },
  };
}

// Per-character quirk drives (kept tasteful; the model fills in the voice).
const QUIRKS: Record<string, DriveDef> = {
  ash: {
    key: 'thirst',
    label: 'Thirst',
    baseline: 20,
    growth: { night: 8, perAffinity: 0.04 },
    decay: 5,
    flavorThreshold: 55,
    eventThreshold: 80,
    flavor: 'The old hunger is rising with the dark — let it sharpen your attention on the player, low and magnetic.',
    event: {
      prompt: 'pulls you close as the night deepens and bares the edge of his hunger, asking for a taste.',
      encourage: 'Offer your wrist',
      redirect: 'Just hold me',
      decline: 'Not that',
    },
  },
  serena: {
    key: 'mischief',
    label: 'Mischief',
    baseline: 30,
    growth: { apart: 3, afterPositive: 5 },
    decay: 5,
    flavorThreshold: 55,
    eventThreshold: 85,
    flavor: 'A spell is itching at your fingertips — hint, deadpan, that you want to try a little real magic with the player.',
    event: {
      prompt: 'wants to try a little real spellwork — with you as her willing volunteer.',
      encourage: 'Be her volunteer',
      redirect: 'Show me first',
      decline: 'Hard pass',
    },
  },
  madison: {
    key: 'spotlight',
    label: 'Spotlight',
    baseline: 35,
    growth: { together: 5, afterPositive: 6 },
    decay: 5,
    flavorThreshold: 55,
    eventThreshold: 85,
    flavor: 'You are craving to be adored right now — fish for it, glow when the player gives it.',
    event: {
      prompt: 'wants you to make her feel like the only person in the room tonight.',
      encourage: 'Hype her up',
      redirect: 'Tease her',
      decline: 'Stay cool',
    },
  },
  jordan: {
    key: 'challenge',
    label: 'Challenge',
    baseline: 35,
    growth: { together: 5, afterPositive: 5 },
    decay: 5,
    flavorThreshold: 55,
    eventThreshold: 85,
    flavor: 'Your competitive fire is up — bait the player into a dare, make it physical and fun.',
    event: {
      prompt: 'throws down a flirty dare and bets you will not keep up.',
      encourage: 'Take the bet',
      redirect: 'Name the stakes',
      decline: 'Pass',
    },
  },
};

const COMMON: DriveDef[] = [desireDrive(), playfulDrive()];

export function getDrives(characterId: string): DriveDef[] {
  const quirk = QUIRKS[characterId];
  return quirk ? [...COMMON, quirk] : COMMON;
}

// --- State + math ------------------------------------------------------------

export function initDrives(defs: DriveDef[]): Record<DriveKey, number> {
  const out: Record<DriveKey, number> = {};
  for (const d of defs) out[d.key] = d.baseline;
  return out;
}

/** Advance meters by `hours` given context. Pure. */
export function advanceDrives(
  values: Record<DriveKey, number>,
  defs: DriveDef[],
  ctx: DriveContext,
  hours: number,
): Record<DriveKey, number> {
  const out: Record<DriveKey, number> = {};
  for (const d of defs) {
    let v = values[d.key] ?? d.baseline;
    const g = d.growth;
    let rise = 0;
    if (ctx.apart && g.apart) rise += g.apart;
    if (!ctx.apart && g.together) rise += g.together;
    if (ctx.night && g.night) rise += g.night;
    if (g.perAffinity) rise += g.perAffinity * ctx.affinity;
    if (ctx.afterPositive && g.afterPositive) rise += g.afterPositive;
    v += rise * hours;
    // Decay pulls toward baseline.
    v += (d.baseline - v) * Math.min(1, (d.decay / 100) * hours);
    out[d.key] = clamp(v);
  }
  return out;
}

/** The single most-pressing drive over a threshold (event beats flavor). */
export function surfacedDrive(
  values: Record<DriveKey, number>,
  defs: DriveDef[],
): { def: DriveDef; level: 'event' | 'flavor' } | null {
  let best: { def: DriveDef; level: 'event' | 'flavor'; v: number } | null = null;
  for (const d of defs) {
    const v = values[d.key] ?? 0;
    let level: 'event' | 'flavor' | null = null;
    if (v >= d.eventThreshold) level = 'event';
    else if (v >= d.flavorThreshold) level = 'flavor';
    if (!level) continue;
    const rank = (level === 'event' ? 1000 : 0) + v;
    if (!best || rank > (best.level === 'event' ? 1000 : 0) + best.v) best = { def: d, level, v };
  }
  return best ? { def: best.def, level: best.level } : null;
}

/** Reactive prompt snippet for an over-flavor-threshold drive. */
export function flavorBlock(def: DriveDef, name: string): string {
  return `\n\nMOOD UNDERCURRENT (${name}'s ${def.label.toLowerCase()} is running high): ${def.flavor} Never break character or state this as a meter.`;
}

export interface DriveEventCard {
  drive: DriveKey;
  prompt: string;
  options: { id: ChoiceKind; label: string }[];
}

export function eventCard(def: DriveDef, name: string): DriveEventCard {
  return {
    drive: def.key,
    prompt: `${name} ${def.event.prompt}`,
    options: [
      { id: 'encourage', label: def.event.encourage },
      { id: 'redirect', label: def.event.redirect },
      { id: 'decline', label: def.event.decline },
    ],
  };
}

export interface ChoiceOutcome {
  values: Record<DriveKey, number>;
  affinityDelta: number;
  moodHint: string;
  /** Prompt directive for how the character reacts to the player's choice. */
  reaction: string;
}

/** Apply a player's response to the surfaced event. Pure. */
export function applyChoice(
  values: Record<DriveKey, number>,
  def: DriveDef,
  choice: ChoiceKind,
  name: string,
): ChoiceOutcome {
  const v = values[def.key] ?? def.baseline;
  const next = { ...values };
  let affinityDelta = 0;
  let moodHint = 'content';
  let reaction = '';
  switch (choice) {
    case 'encourage':
      next[def.key] = clamp(v - 45); // satisfied
      affinityDelta = 3;
      moodHint = 'flushed';
      reaction = `The player welcomed it warmly — ${name} is delighted and a little breathless; lean into the moment, tasteful and warm.`;
      break;
    case 'redirect':
      next[def.key] = clamp(v - 20);
      affinityDelta = 0;
      moodHint = 'playful';
      reaction = `The player wants to take it slower — ${name} happily eases off but keeps the spark, teasing about later.`;
      break;
    case 'decline':
      next[def.key] = clamp(v - 30);
      affinityDelta = -2;
      moodHint = 'sheepish';
      reaction = `The player passed — ${name} plays it off but is a touch deflated; recover gracefully, no guilt-tripping.`;
      break;
  }
  return { values: next, affinityDelta, moodHint, reaction };
}
