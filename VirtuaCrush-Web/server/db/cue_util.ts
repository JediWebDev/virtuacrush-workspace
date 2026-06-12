// Conversational-cue detection for spawning date choices. Instead of a fixed
// every-N cadence, a date invite appears when the conversation naturally turns
// toward "let's do something" — gated by a cooldown so it never spams, with a
// max-gap fallback so it still happens during a lull. Pure + testable.

// Minimum user messages between choices (anti-spam).
export const CHOICE_MIN_GAP = 3;
// Lull fallback gap: after this many messages without a choice, one may fire
// without a cue — but only when the character has a surfaced drive pushing for
// it (see shouldOfferDateChoice), so it reads as motivated rather than random.
export const CHOICE_MAX_GAP = 14;

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
 * Only when the conversation naturally turns toward plans (a cue), OR when the
 * character's emotions/desires are peaking after a long gap since the last choice.
 */
export function shouldOfferDateChoice(params: {
  userMsgCount: number;
  msgsSinceLastChoice: number;
  hadPriorChoice: boolean;
  cue: boolean;
  /** Emotion gauges are high (the character is restless / wanting closeness). */
  drivePressure?: boolean;
}): boolean {
  if (params.cue) return true;
  return params.msgsSinceLastChoice >= CHOICE_MAX_GAP && params.drivePressure === true;
}

// --- Free-text venue agreements ------------------------------------------------
// When the pair agree on an outing in plain dialogue (no choice card involved),
// the sim must record it — otherwise the fiction says "see you at the arcade"
// while the engine still thinks everyone is at home. Order matters: more
// specific venues (amusement park) before generic ones (park).
const VENUE_KEYWORDS: [RegExp, string][] = [
  [/\b(amusement park|theme park|roller ?coaster|the fair\b|ferris wheel)\b/i, 'amusement_park'],
  [/\b(coffee shop|coffee|cafe|café|latte|espresso)\b/i, 'coffee_shop'],
  [/\b(restaurant|dinner|sushi|brunch|lunch)\b/i, 'restaurant'],
  [/\b(movie|cinema|film|theater|theatre)\b/i, 'movie_theater'],
  [/\b(mall|shopping)\b/i, 'mall'],
  [/\b(picnic|park)\b/i, 'park'],
  [/\b(concert|gig|live music)\b/i, 'concert'],
  [/\b(golf|driving range)\b/i, 'golf_course'],
  [/\b(stadium|ballgame|basketball game|football game|baseball game|sports game|the game)\b/i, 'sports_game'],
  [/\barcade\b/i, 'arcade'],
];

// Home venues are speaker-relative: "my place" from the user is user_home, but
// from the character it's character_home — so they're matched per speaker.
const HOME_MINE = /\b(my place|my apartment|my house|mine\b.{0,12}(tonight|later))\b/i;
const HOME_YOURS = /\b(your place|your apartment|your house)\b/i;
const COME_OVER = /\bcome over\b/i;

// Affirmative-commitment phrasing from either side.
const AGREEMENT_CUES: RegExp[] = [
  /\b(it'?s a date|see you (there|then|soon|at)|can'?t wait|i'?ll be there|i'?ll see you|sounds (perfect|great|good|amazing|like a plan)|deal)\b/i,
  /\b(yes+|yeah|yess+|okay|ok|sure)\b[^.!?]*\b(let'?s|i'?m in|i'?d love|down|in)\b/i,
  /\blet'?s (do it|do that|go|meet)\b/i,
  /\bmeet (me|you) (there|at)\b/i,
];

// A venue mentioned while reminiscing isn't a plan ("remember that concert?").
const PAST_HINTS = /\b(went|was at|were at|last (night|week|time|year)|yesterday|earlier|that time|remember when|used to|once)\b/i;

/**
 * Detects "we just agreed to go to <venue>" in the latest exchange.
 * Strict pairing: the venue must appear in a message that is ITSELF
 * plan/commitment-flavored (not merely anywhere across both messages), there
 * must be an explicit agreement somewhere, and reminiscing doesn't count.
 * Loose matching here silently flipped the scene into "planning" and made the
 * "show up for your date" button appear out of nowhere.
 */
export function detectAgreedVenue(userText: string, assistantText: string): string | null {
  const agreedUser = AGREEMENT_CUES.some((re) => re.test(userText));
  const agreedAsst = AGREEMENT_CUES.some((re) => re.test(assistantText));
  if (!agreedUser && !agreedAsst) return null;

  // A message is a venue candidate when it's forward-looking: it carries the
  // agreement itself, a plan cue, or a home invitation.
  const candidateUser =
    !PAST_HINTS.test(userText) &&
    (agreedUser || detectPlanCue(userText) || COME_OVER.test(userText) || HOME_MINE.test(userText));
  const candidateAsst =
    !PAST_HINTS.test(assistantText) &&
    (agreedAsst || detectPlanCue('', assistantText) || COME_OVER.test(assistantText) || HOME_MINE.test(assistantText));

  for (const [re, slug] of VENUE_KEYWORDS) {
    if (candidateUser && re.test(userText)) return slug;
    if (candidateAsst && re.test(assistantText)) return slug;
  }
  if (candidateUser && (HOME_MINE.test(userText) || COME_OVER.test(userText))) return 'user_home';
  if (candidateAsst && (HOME_MINE.test(assistantText) || COME_OVER.test(assistantText))) return 'character_home';
  if (candidateUser && HOME_YOURS.test(userText)) return 'character_home';
  if (candidateAsst && HOME_YOURS.test(assistantText)) return 'user_home';
  return null;
}
