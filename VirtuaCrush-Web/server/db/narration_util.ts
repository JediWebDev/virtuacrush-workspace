// Narration "director": a zero-latency evaluator that reads the user's message
// and decides how the character should respond — with plain dialogue, a
// non-verbal narration beat (a look/gesture lands harder than a quip), or a
// blend of both. The result conditions the chat prompt for that turn.
//
// Pure + deterministic so it's testable and tunable. The model still has
// latitude; this just nudges it toward drama when the moment calls for it.

export type NarrationMode = 'dialogue' | 'narration' | 'blend';

// The user performing a physical/roleplay action (in *asterisks* or first
// person) — the character should react with a beat, then maybe speak.
const ROLEPLAY_ASTERISK = /\*[^*]+\*/;
const PHYSICAL_ACTION =
  /\bi\s+(lean|move|step|reach|hand|give|pass|hold|grab|take|pull|push|hug|embrace|kiss|peck|poke|nudge|wink|smirk|grin|wave|bow|kneel|sit|stand|touch|brush|tuck|caress|stroke|wrap|slip|whisper|offer|present|twirl|dip|spin)\b/i;

// Provocative / teasing / backhanded / crude remarks aimed at the character —
// a facial reaction is more powerful than words here.
const PROVOCATIVE: RegExp[] = [
  /\byou'?re (so |really |pretty |awfully )?(brave|bold|confident|daring|gutsy)\b/i,
  /\bbold of you\b/i,
  /\bbrave (of you )?to\b/i,
  /\bdidn'?t (think|expect|know) you could\b/i,
  /\bfor someone (like you|your (age|size|type))\b/i,
  /\b(surprisingly|shockingly|weirdly)\b/i,
  /\bi dare you\b/i,
  /\bprove it\b/i,
  /\b(tight|short|revealing|skimpy|skin\s?tight) (dress|skirt|outfit|top|shirt|jeans)\b/i,
  /\byou (really |actually )?think you can\b/i,
  /\b(cocky|full of yourself|try ?hard|delusional|in your dreams)\b/i,
  /\bwho do you think you are\b/i,
  /\bnice try\b/i,
];

// Emotionally charged / vulnerable / confession — a tender non-verbal beat plus
// a few words.
const EMOTIONAL: RegExp[] = [
  /\bi (love|adore|need|miss|want) you\b/i,
  /\bi'?ve never told (anyone|you)\b/i,
  /\bi'?m (scared|afraid|terrified|heartbroken|falling for you|crying|in love)\b/i,
  /\b(marry me|be mine|run away with me)\b/i,
  /\bi can'?t stop thinking about you\b/i,
  /\byou mean (everything|so much|the world) to me\b/i,
];

/** Decides the response mode for a user message. Order: provocative, physical, emotional. */
export function decideNarrationMode(message: string): NarrationMode {
  if (!message) return 'dialogue';
  if (PROVOCATIVE.some((re) => re.test(message))) return 'narration';
  if (ROLEPLAY_ASTERISK.test(message) || PHYSICAL_ACTION.test(message)) return 'blend';
  if (EMOTIONAL.some((re) => re.test(message))) return 'blend';
  return 'dialogue';
}

/**
 * Returns the system-prompt directive for a mode. Empty for plain dialogue (so
 * ordinary chat stays clean); for narration/blend it teaches the *asterisk*
 * stage-direction convention and pushes the character toward a non-verbal beat.
 */
export function formatNarrationDirective(mode: NarrationMode, characterName: string): string {
  if (mode === 'dialogue') return '';

  const convention =
    `\n\nNARRATION: Wrap third-person, non-verbal stage directions in *asterisks* ` +
    `(e.g. *${characterName} raises an eyebrow*) to show facial expression and body language. ` +
    `Spoken words stay OUTSIDE the asterisks.`;

  if (mode === 'narration') {
    return (
      convention +
      ` RIGHT NOW the user's message lands harder as a LOOK than as a line. ` +
      `Lead with a vivid *non-verbal reaction* (a facial expression, a shift in posture) that clearly responds to what they just did, and use few spoken words.`
    );
  }
  // blend
  return (
    convention +
    ` RIGHT NOW react DIRECTLY to what the user just did or said — acknowledge their specific action and respond to it. ` +
    `Blend one brief *non-verbal beat* with a real spoken reply of a sentence or two. ` +
    `Do NOT give a one-word or evasive non-answer like "Huh." or "Yeah." — engage with the moment.`
  );
}
