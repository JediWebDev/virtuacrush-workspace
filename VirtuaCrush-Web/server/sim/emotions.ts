// Emotion engine. Each companion carries an 8-axis emotional state (0-100)
// that moves with every classified player action, decays toward a per-character
// baseline over time, and is fed BACK into the prompt so the character's tone
// matches the gauges the user sees. Event cards (encourage/redirect/decline)
// fire from emotion thresholds. Pure + testable.
import type { PlayerIntent } from './intent';

export const EMOTIONS = [
  'aroused',
  'playful',
  'amused',
  'happy',
  'sad',
  'angry',
  'scared',
  'annoyed',
] as const;
export type EmotionKey = (typeof EMOTIONS)[number];
export type EmotionState = Record<EmotionKey, number>;

export const EMOTION_LABELS: Record<EmotionKey, string> = {
  aroused: 'Aroused',
  playful: 'Playful',
  amused: 'Amused',
  happy: 'Happy',
  sad: 'Sad',
  angry: 'Angry',
  scared: 'Scared',
  annoyed: 'Annoyed',
};

const clamp = (n: number) => Math.max(0, Math.min(100, n));

// Resting baseline; per-character biases keep personalities distinct (the old
// quirk drives live on here as emotional temperament).
const DEFAULT_BASELINE: EmotionState = {
  aroused: 15, playful: 30, amused: 25, happy: 40, sad: 5, angry: 0, scared: 0, annoyed: 5,
};

const CHARACTER_BASELINE_BIAS: Record<string, Partial<EmotionState>> = {
  serena: { playful: 40, amused: 35 },          // mischief
  mina: { playful: 40, amused: 30 },
  riot: { playful: 35, annoyed: 10 },
  jordan: { playful: 40, happy: 45 },           // challenge-seeker
  madison: { happy: 45, playful: 35 },          // spotlight
  ash: { aroused: 25 },                          // thirst
  becca: { happy: 45 },
  lexi: { playful: 35 },
};

export function emotionBaseline(characterId: string): EmotionState {
  return { ...DEFAULT_BASELINE, ...(CHARACTER_BASELINE_BIAS[characterId] ?? {}) };
}

export function initEmotions(characterId: string): EmotionState {
  return emotionBaseline(characterId);
}

/** Time decay: drift toward baseline (~12%/hour, capped). Pure. */
export function decayEmotions(state: EmotionState, characterId: string, hours: number): EmotionState {
  const base = emotionBaseline(characterId);
  const f = Math.min(1, 0.12 * Math.max(0, hours));
  const out = {} as EmotionState;
  for (const k of EMOTIONS) {
    const v = state[k] ?? base[k];
    out[k] = clamp(v + (base[k] - v) * f);
  }
  return out;
}

// --- Intent -> emotion deltas ----------------------------------------------------
type Deltas = Partial<Record<EmotionKey, number>>;

const ROMANCE_DELTAS: Record<string, Deltas> = {
  flirt: { aroused: 8, playful: 5, happy: 3 },
  affection: { happy: 10, aroused: 5, sad: -5 },
  confession: { happy: 12, aroused: 6, scared: 3 },
  date_request: { happy: 8, playful: 4 },
  kiss_attempt: { aroused: 12, happy: 5 },
  proposition: { aroused: 12, scared: 2 },
  reject: { sad: 20, happy: -15, aroused: -20, playful: -10 },
  breakup: { sad: 30, happy: -25, aroused: -25, angry: 10 },
};

const SOCIAL_DELTAS: Record<string, Deltas> = {
  compliment: { happy: 8, amused: 3, aroused: 2 },
  tease: { amused: 8, playful: 8, annoyed: 2 },
  joke: { amused: 10, happy: 4 },
  comfort: { happy: 6, sad: -8, scared: -5 },
  apologize: { annoyed: -10, angry: -10, sad: -3 },
  share: { happy: 3 },
  help: { happy: 5, annoyed: -3 },
  boast: { amused: 3, annoyed: 3 },
  lie: { annoyed: 4 },
  manipulate: { annoyed: 6 },
  smalltalk: {},
};

const CONFLICT_DELTAS: Record<string, Deltas> = {
  insult: { angry: 15, annoyed: 12, happy: -10, sad: 6 },
  provoke: { annoyed: 12, angry: 8, amused: 2 },
  threaten: { scared: 18, angry: 10, happy: -10 },
  intimidate: { scared: 15, angry: 8 },
  argue: { angry: 10, annoyed: 10, happy: -5 },
};

/** Emotional movement caused by the player's classified action this turn. */
export function emotionDeltasForIntent(intent: PlayerIntent): Deltas {
  // The victim guard rewrites in-fiction crimes against the player to
  // observation/share with a victim note — fear (and protective anger) rise.
  if (intent.detail?.includes('victim')) return { scared: 18, angry: 10, happy: -8 };
  switch (intent.type) {
    case 'romance':
      return ROMANCE_DELTAS[intent.subtype] ?? { aroused: 4, happy: 3 };
    case 'social':
      return SOCIAL_DELTAS[intent.subtype] ?? {};
    case 'conflict':
      return CONFLICT_DELTAS[intent.subtype] ?? { angry: 10, annoyed: 8 };
    case 'crime':
      return { scared: 20, angry: 10, happy: -10 };
    case 'transaction':
      return intent.subtype === 'gift' ? { happy: 10, amused: 4 } : {};
    default:
      return {};
  }
}

export function applyEmotionDeltas(state: EmotionState, deltas: Deltas): EmotionState {
  const out = { ...state };
  for (const k of Object.keys(deltas) as EmotionKey[]) {
    out[k] = clamp((out[k] ?? 0) + (deltas[k] ?? 0));
  }
  return out;
}

/** Strongest emotions for the UI gauges (top n, floor keeps it meaningful). */
export function topEmotions(state: EmotionState, n = 3, floor = 10): { key: EmotionKey; label: string; value: number }[] {
  return EMOTIONS
    .map((k) => ({ key: k, label: EMOTION_LABELS[k], value: Math.round(state[k] ?? 0) }))
    .filter((e) => e.value >= floor)
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

/**
 * Prompt block so the reply tone tracks the gauges. Only meaningful emotions
 * are included; empty string when she's emotionally neutral.
 */
export function emotionToneBlock(state: EmotionState, name: string): string {
  const active = EMOTIONS
    .map((k) => ({ k, v: Math.round(state[k] ?? 0) }))
    .filter((e) => e.v >= 35)
    .sort((a, b) => b.v - a.v)
    .slice(0, 3);
  if (active.length === 0) return '';
  const desc = active.map((e) => `${e.k} ${e.v}/100`).join(', ');
  return (
    `\n\nCURRENT EMOTIONAL STATE (${name} right now): ${desc}. ` +
    `Let the strongest feelings visibly color your tone, word choice, and pacing this reply — ` +
    `react like a person actually feeling this, and never name the numbers. Keep anything physical suggestive, not explicit.`
  );
}

// --- Emotion event cards (encourage / redirect / decline) -----------------------
export type ChoiceKind = 'encourage' | 'redirect' | 'decline';

/** Legacy `drive` id kept for API compatibility with pendingDriveEvent payloads. */
export interface DriveEventCard {
  drive: string;
  prompt: string;
  options: { id: ChoiceKind; label: string }[];
}

interface EmotionEventDef {
  emotion: EmotionKey;
  min: number;
  driveId: string;
  promptSuffix: string;
  encourage: string;
  redirect: string;
  decline: string;
}

const COMMON_EVENTS: EmotionEventDef[] = [
  {
    emotion: 'aroused',
    min: 85,
    driveId: 'desire',
    promptSuffix: 'has been thinking about you all evening and wants to get closer tonight.',
    encourage: 'Lean in',
    redirect: 'Slow down',
    decline: 'Not tonight',
  },
  {
    emotion: 'playful',
    min: 88,
    driveId: 'playful',
    promptSuffix: 'is in a wicked mood and wants to play a daring little game with you.',
    encourage: 'Play along',
    redirect: 'Maybe later',
    decline: 'Behave',
  },
];

const CHARACTER_EVENTS: Record<string, EmotionEventDef[]> = {
  ash: [{
    emotion: 'aroused',
    min: 80,
    driveId: 'thirst',
    promptSuffix: 'pulls you close as the night deepens and bares the edge of his hunger, asking for a taste.',
    encourage: 'Offer your wrist',
    redirect: 'Just hold me',
    decline: 'Not that',
  }],
  serena: [{
    emotion: 'playful',
    min: 85,
    driveId: 'mischief',
    promptSuffix: 'wants to try a little real spellwork — with you as her willing volunteer.',
    encourage: 'Be her volunteer',
    redirect: 'Show me first',
    decline: 'Hard pass',
  }],
  madison: [{
    emotion: 'happy',
    min: 85,
    driveId: 'spotlight',
    promptSuffix: 'wants you to make her feel like the only person in the room tonight.',
    encourage: 'Hype her up',
    redirect: 'Tease her',
    decline: 'Stay cool',
  }],
  jordan: [{
    emotion: 'playful',
    min: 85,
    driveId: 'challenge',
    promptSuffix: 'throws down a flirty dare and bets you will not keep up.',
    encourage: 'Take the bet',
    redirect: 'Name the stakes',
    decline: 'Pass',
  }],
};

function eventCardFromDef(def: EmotionEventDef, name: string): DriveEventCard {
  return {
    drive: def.driveId,
    prompt: `${name} ${def.promptSuffix}`,
    options: [
      { id: 'encourage', label: def.encourage },
      { id: 'redirect', label: def.redirect },
      { id: 'decline', label: def.decline },
    ],
  };
}

export interface EmotionChoiceOutcome {
  emotions: EmotionState;
  affinityDelta: number;
  moodHint: string;
  reaction: string;
}

/** Apply a player's response to a surfaced emotion event. Pure. */
export function applyEmotionChoice(
  emotions: EmotionState,
  driveId: string,
  choice: ChoiceKind,
  name: string,
): EmotionChoiceOutcome {
  const emoKey = emotionKeyForDrive(driveId);
  const v = emotions[emoKey] ?? 0;
  const next = { ...emotions };
  let affinityDelta = 0;
  let moodHint = 'content';
  let reaction = '';
  switch (choice) {
    case 'encourage':
      next[emoKey] = clamp(v - 45);
      affinityDelta = 3;
      moodHint = 'flushed';
      reaction = `The player welcomed it warmly — ${name} is delighted and a little breathless; lean into the moment, tasteful and warm.`;
      break;
    case 'redirect':
      next[emoKey] = clamp(v - 20);
      moodHint = 'playful';
      reaction = `The player wants to take it slower — ${name} happily eases off but keeps the spark, teasing about later.`;
      break;
    case 'decline':
      next[emoKey] = clamp(v - 30);
      affinityDelta = -2;
      moodHint = 'sheepish';
      reaction = `The player passed — ${name} plays it off but is a touch deflated; recover gracefully, no guilt-tripping.`;
      break;
  }
  return { emotions: next, affinityDelta, moodHint, reaction };
}

/** Maps event-card drive keys back to the emotion that powers them. */
export function emotionKeyForDrive(driveKey: string): EmotionKey {
  if (driveKey === 'desire' || driveKey === 'thirst') return 'aroused';
  if (driveKey === 'spotlight') return 'happy';
  return 'playful';
}

export function pendingEventFromEmotions(
  state: EmotionState,
  characterId: string,
  displayName: string,
): DriveEventCard | null {
  const defs = [...COMMON_EVENTS, ...(CHARACTER_EVENTS[characterId] ?? [])];
  let best: { def: EmotionEventDef; v: number } | null = null;
  for (const def of defs) {
    const v = state[def.emotion] ?? 0;
    if (v >= def.min && (!best || v > best.v)) best = { def, v };
  }
  return best ? eventCardFromDef(best.def, displayName) : null;
}
