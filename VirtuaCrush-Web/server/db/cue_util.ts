// Conversational-cue detection for spawning date choices. Instead of a fixed
// every-N cadence, a date invite appears when the conversation naturally turns
// toward "let's do something" — gated by a cooldown so it never spams, with a
// max-gap fallback so it still happens during a lull. Pure + testable.

// Minimum user messages between choices (anti-spam).
export const CHOICE_MIN_GAP = 3;
// If it's been this many messages without a choice, offer one regardless of cue.
export const CHOICE_MAX_GAP = 9;

// The user signaling they want to do / go somewhere together.
const USER_PLAN_CUES: RegExp[] = [
  /\bwhat (should|shall|do|are|can) we\b/i,
  /\b(wanna|want(?:ed)? to|let'?s|let us|we should|can we)\b/i,
  /\bi'?m (so )?bored\b/i,
  /\bgo (out|somewhere|on a date)\b/i,
  /\bhang ?out\b/i,
  /\bdo something\b/i,
  /\bmeet ?up\b/i,
  /\bgrab (a|some|coffee|dinner|lunch|drinks?|food|a bite)\b/i,
  /\bgo (get|grab)\b/i,
  /\b(a |on a )?date\b/i,
  /\bfree (tonight|today|tomorrow|this weekend|later|now)\b/i,
  /\bany plans\b/i,
  /\bplans (tonight|today|tomorrow|this|for)\b/i,
  /\btake me (out|to|somewhere)\b/i,
  /\bshow me (around|your)\b/i,
  /\bwhere (should|do|can) we (go|eat)\b/i,
];

// The character proposing or angling toward an outing.
const ASSISTANT_PLAN_CUES: RegExp[] = [
  /\b(want|wanna|would you like) to\b[^?]*\?/i,
  /\bhow about (we|a|grabbing|going)\b/i,
  /\bshould we\b[^?]*\?/i,
  /\bwe should (go|grab|hit|check)\b/i,
  /\blet'?s (go|grab|hang|get)\b/i,
  /\bcome with me\b/i,
];

/** True when the latest exchange suggests it's a natural moment for a date invite. */
export function detectPlanCue(userText: string, assistantText = ''): boolean {
  if (userText && USER_PLAN_CUES.some((re) => re.test(userText))) return true;
  if (assistantText && ASSISTANT_PLAN_CUES.some((re) => re.test(assistantText))) return true;
  return false;
}

/**
 * Decides whether to surface a date choice now.
 *  - never before the user has engaged a little (2 messages),
 *  - the first one fires early as a hook,
 *  - afterward only on a cue (with a cooldown) or after a long lull.
 */
export function shouldOfferDateChoice(params: {
  userMsgCount: number;
  msgsSinceLastChoice: number;
  hadPriorChoice: boolean;
  cue: boolean;
}): boolean {
  if (params.userMsgCount < 2) return false;
  if (!params.hadPriorChoice) return true; // early hook
  if (params.msgsSinceLastChoice < CHOICE_MIN_GAP) return false; // cooldown
  if (params.cue) return true;
  return params.msgsSinceLastChoice >= CHOICE_MAX_GAP; // lull fallback
}
