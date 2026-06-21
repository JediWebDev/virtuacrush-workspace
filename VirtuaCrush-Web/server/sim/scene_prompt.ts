// Prompt-time scene context: detect when conversation has left the home
// baseline, infer location/co-presence from history, and suppress stale blocks.
import type { StoryBeat } from '../db/story_memory';
import { HIGH_SALIENCE_RE } from '../db/story_memory';
import type { SceneSnapshot, SceneSnapshotPatch } from '../inworld/scene_snapshot';

export interface HistoryLine {
  role: 'user' | 'assistant';
  content: string;
}

const AWAY_ACTIVITY_RE =
  /\b(shoplift|shoplifting|department\s+store|at the store|street\s+racing|racing track|sneaking into|broke into|at the mall|at the club)\b/i;

const PHYSICAL_SCENE_RE =
  /\b(van|cargo\s+bay|rear doors|alley|stairwell|warehouse|basement|bound and gagged together|between her and|shoulder press|pressed into|forehead into|side by side|creditor|kidnap|hostage|captive)\b/i;

const LOCATION_HINTS: { re: RegExp; label: string }[] = [
  { re: /\bcargo\s+bay\b/i, label: 'cargo bay of a van' },
  { re: /\bmoving\s+van\b|\binside the van\b|\bvan'?s rear\b|\brear doors\b/i, label: 'inside a van' },
  { re: /\balley\b/i, label: 'an alley' },
  { re: /\bstairwell\b/i, label: 'a stairwell' },
  { re: /\bwarehouse\b/i, label: 'a warehouse' },
];

/** Daily activity text that cannot happen "at your own place". */
export function sanitizeHomeBaselineActivity(activity: string): string {
  const t = activity.trim();
  if (!t || AWAY_ACTIVITY_RE.test(t)) return 'hanging out at home';
  return t;
}

export function isStaleRemoteLocation(location: string | undefined | null): boolean {
  if (!location?.trim()) return true;
  return /\(remote\)$/i.test(location) || /^unspecified location$/i.test(location.trim());
}

function historyBlob(history: HistoryLine[], message: string, tail = 12): string {
  return [...history.slice(-tail), { role: 'user' as const, content: message }]
    .map((m) => m.content)
    .join('\n');
}

function inferLocationFromText(blob: string): string | undefined {
  for (const { re, label } of LOCATION_HINTS) {
    if (re.test(blob)) return label;
  }
  if (/\bvan\b/i.test(blob) && /\b(bound|gagged|creditor|cargo|rope)\b/i.test(blob)) {
    return 'inside a van';
  }
  return undefined;
}

/** Heuristic pass on recent transcript — fills coPresent/location when story moved. */
export function inferSceneDeltaFromConversation(
  history: HistoryLine[],
  message: string,
  prior: SceneSnapshot | null,
): Partial<SceneSnapshotPatch> {
  const blob = historyBlob(history, message);
  const patch: Partial<SceneSnapshotPatch> = {};

  const loc = inferLocationFromText(blob);
  if (loc) patch.location = loc;

  const playerConstrained =
    prior?.player.mobility === 'restrained' ||
    prior?.player.voice === 'gagged' ||
    prior?.player.voice === 'muted' ||
    /\b(bound|tied|restrained|cuffed|gagged|mmf|mmm?f)\b/i.test(blob);

  const physicalTogether =
    PHYSICAL_SCENE_RE.test(blob) ||
    (playerConstrained && /\b(shoulder|wrist|pressed|together|between|van)\b/i.test(blob));

  if (physicalTogether) patch.coPresent = true;

  return patch;
}

export function conversationHasPhysicalScene(history: HistoryLine[], message = ''): boolean {
  return PHYSICAL_SCENE_RE.test(historyBlob(history, message, 16));
}

export function shouldSuppressHomeBaseline(opts: {
  prior: SceneSnapshot | null;
  history: HistoryLine[];
  message: string;
  storyBeats: StoryBeat[];
}): boolean {
  if (opts.prior?.coPresent) return true;
  if (opts.prior?.player.mobility !== 'free' || opts.prior?.player.voice !== 'free') return true;
  if (opts.prior?.location && !isStaleRemoteLocation(opts.prior.location)) return true;
  if (conversationHasPhysicalScene(opts.history, opts.message)) return true;
  if (opts.storyBeats.some((b) => HIGH_SALIENCE_RE.test(b.summary))) return true;
  return false;
}

/** One-line directive when home baseline / composed facts are suppressed. */
export function formatActiveSceneDirective(snapshot: SceneSnapshot | null): string {
  const loc = snapshot?.location && !isStaleRemoteLocation(snapshot.location) ? snapshot.location : null;
  const prox = snapshot?.coPresent
    ? 'You and the player are physically together in the scene below.'
    : 'The scene follows the conversation below (not a default home/texting baseline).';
  const locLine = loc ? ` Established location: ${loc}.` : '';
  return (
    `\n\n=== CURRENT SETTING ===\n${prox}${locLine} Honor SCENE CONTINUITY and the recent messages — do NOT revert to home, remote texting, or daily idle activities unless the story clearly moved there.`
  );
}

/** Fix contradictory snapshot fields before injection into the director prompt. */
export function reconcileSceneSnapshotForPrompt(
  snap: SceneSnapshot,
  history: HistoryLine[],
  message: string,
): SceneSnapshot {
  const inferred = inferSceneDeltaFromConversation(history, message, snap);
  let next = { ...snap };

  if (inferred.coPresent === true) next.coPresent = true;
  if (inferred.location && (isStaleRemoteLocation(next.location) || !next.location?.trim())) {
    next = { ...next, location: inferred.location };
  }

  if (next.coPresent) {
    const present = [...next.present];
    if (!present.some((n) => n.toLowerCase() === 'you')) present.unshift('you');
    const comp = present.find((n) => n.toLowerCase() !== 'you');
    if (comp && isStaleRemoteLocation(next.location)) {
      next = { ...next, location: inferred.location ?? 'current scene (see conversation)' };
    }
    next = { ...next, present };
  }

  return next;
}
