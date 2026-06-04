// Detects when the user is roleplaying ARRIVING / showing up / being physically
// present (or coming to pick the character up). Used to flip the scene to
// co-present so the prompt stops insisting they're apart — the root cause of the
// "you're texting from a distance" vs "I'm at your door" contradiction.
// Pure + testable.

// Clear arrival / physical-presence / pickup signals.
const ARRIVAL: RegExp[] = [
  /\bi'?m (out\s?side|here|at your (place|door|house|apartment|spot)|outside your)\b/i,
  /\bwaiting (right )?out\s?side\b/i,
  /\bi'?m (just )?(waiting|standing|parked|posted up) (right )?out\s?side\b/i,
  /\bout\s?side your (door|place|house|building|apartment)\b/i,
  /\bi (ring|knock|buzz|am ringing|am knocking)\b/i,
  /\bdoor\s?bell\b/i,
  /\bknock(ing)? on (the|your) door\b/i,
  /\bi (show up|showed up|arrive|arrived|pull up|pulled up|walk up|walk in|walked in|come over|came over|stop by|stopped by|swing by)\b/i,
  /\bi(?:'ll| will|'m gonna| am going to)? ?pick (you|u) up\b/i,
  /\bi'?m (picking|gonna pick) (you|u) up\b/i,
  /\bopen (the|your) door\b/i,
  /\blet me in\b/i,
  /\bi'?m downstairs\b/i,
  /\bcome (out|outside)\b/i,
  /\bi'?m at the door\b/i,
];

// Agreeing to meet at the venue (date begins there).
const MEET_THERE: RegExp[] = [
  /\b(i'?ll |i will |let'?s )?meet (you )?there\b/i,
  /\bsee you there\b/i,
  /\bi'?ll be there\b/i,
  /\bmeet (you )?at the\b/i,
];

/** True when the user is arriving / showing up / picking up / agreeing to meet there. */
export function detectArrivalIntent(message: string): boolean {
  if (!message) return false;
  return ARRIVAL.some((re) => re.test(message)) || MEET_THERE.some((re) => re.test(message));
}
