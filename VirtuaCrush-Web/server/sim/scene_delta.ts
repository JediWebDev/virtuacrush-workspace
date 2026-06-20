// Engine-owned scene setting deltas — detected from user input before the
// director narrates. Phase 1: heuristics + movement intent; no extra LLM call.
import type { PlayerIntent } from './intent';
import type { WorldState } from './world';
import { getLocation, resolveVenueSlug } from '../inworld/locations';
import {
  mergeSceneSnapshot,
  type PlayerMobility,
  type PlayerVoice,
  type SceneSnapshot,
  type SceneSnapshotPatch,
} from '../inworld/scene_snapshot';

export type SceneDeltaSource = 'heuristic' | 'intent';

export interface EngineSceneDelta {
  patch: SceneSnapshotPatch;
  sources: SceneDeltaSource[];
  /** When set (including null = home), persist to character_state.scene_location. */
  venueSlug?: string | null;
  /** Fields the engine locks for this turn — director merge cannot override. */
  lockedFields: (keyof SceneSnapshotPatch)[];
}

const GO_HOME_RE =
  /\b(head(ing)?\s+(back\s+)?home|go(ing)?\s+home|leave|left|exit(ed)?|depart(ed)?|I'm\s+out\s+of\s+here|back\s+to\s+(my|the)\s+place)\b/i;
const GO_VENUE_RE =
  /\b(let'?s\s+(?:go|head|hit|meet)|go(?:ing)?\s+to|head(?:ing)?\s+to|take\s+me\s+to|meet\s+me\s+at|meet\s+at|walk\s+to|drive\s+to|swing\s+by)\s+(?:the\s+)?(.+?)(?:[.!?,]|$)/i;
const AT_LOCATION_RE =
  /\b(I'?m|we'?re|we\s+are)\s+(?:already\s+)?(?:at|in|inside)\s+(?:the\s+)?(.+?)(?:[.!?,]|$)/i;

const CLEAR_MOBILITY_RE =
  /\b(free|released|untied|unbound|escaped|loose|wriggled?\s+free|broke\s+free|slipped?\s+free|slip\s+(?:out|free)|out\s+of\s+the\s+cuffs)\b/i;
const ESCAPE_MOBILITY_RE =
  /\b(slip\s+out|wriggled?\s+free|broke\s+free|escaped|untied|unbound|released|out\s+of\s+the)\b/i;
const RESTRAINED_RE =
  /\b(tied|bound|restrained|cuffed|handcuffed|zip-?tied|ropes?|tied\s+up)\b/i;
const CLEAR_VOICE_RE = /\b(ungagged|can\s+speak|spit(s)?\s+out|removed\s+the\s+gag|free\s+to\s+talk)\b/i;
const GAGGED_RE = /\b(gag(ged|ging)?|muzzled|can't\s+speak|cannot\s+speak)\b/i;

function actionSegments(message: string): string[] {
  const segments: string[] = [];
  const re = /\*([^*]+)\*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message)) !== null) {
    if (m[1]?.trim()) segments.push(m[1].trim());
  }
  return segments;
}

function mobilityFromText(text: string): PlayerMobility | undefined {
  const t = text.toLowerCase();
  if (ESCAPE_MOBILITY_RE.test(t)) return 'free';
  if (CLEAR_MOBILITY_RE.test(t) && !RESTRAINED_RE.test(t)) return 'free';
  if (/\b(incapacitated|unconscious|knocked\s+out|passed\s+out)\b/i.test(t)) return 'incapacitated';
  if (RESTRAINED_RE.test(t)) return 'restrained';
  return undefined;
}

function voiceFromText(text: string): PlayerVoice | undefined {
  const t = text.toLowerCase();
  if (CLEAR_VOICE_RE.test(t) && !GAGGED_RE.test(t)) return 'free';
  if (GAGGED_RE.test(t)) return 'gagged';
  if (/\b(muted|silenced|can't\s+talk)\b/i.test(t)) return 'muted';
  return undefined;
}

function locationPhraseFromMessage(message: string): string | null {
  const go = GO_VENUE_RE.exec(message);
  if (go?.[2]?.trim()) return go[2].trim();
  const at = AT_LOCATION_RE.exec(message);
  if (at?.[2]?.trim()) return at[2].trim();
  return null;
}

/** Regex/heuristic pass on raw user text (fast, no LLM). */
export function extractSceneDeltaFromMessage(
  message: string,
  _prior: SceneSnapshot | null,
): Partial<SceneSnapshotPatch> & { venueSlug?: string | null } {
  const patch: Partial<SceneSnapshotPatch> & { venueSlug?: string | null } = {};
  const actions = actionSegments(message);
  const mobilitySources = actions.length ? actions : [message];

  for (const seg of mobilitySources) {
    const mob = mobilityFromText(seg);
    if (mob) patch.playerMobility = mob;
    const voice = voiceFromText(seg);
    if (voice) patch.playerVoice = voice;
  }

  if (GO_HOME_RE.test(message)) {
    patch.venueSlug = null;
    patch.coPresent = false;
    patch.location = getLocation('player_home')?.name ?? 'Your Place';
    return patch;
  }

  const phrase = locationPhraseFromMessage(message);
  if (phrase) {
    const slug = resolveVenueSlug(phrase);
    if (slug) {
      patch.venueSlug = slug;
      patch.location = getLocation(slug)?.name ?? phrase;
      patch.coPresent = true;
    } else {
      patch.location = phrase.slice(0, 200);
      patch.coPresent = true;
    }
  }

  return patch;
}

/** Map referee movement intent → scene patch. */
export function extractSceneDeltaFromIntent(
  intent: PlayerIntent,
  _world: WorldState,
): Partial<SceneSnapshotPatch> & { venueSlug?: string | null } {
  if (intent.type !== 'movement') return {};

  if (intent.subtype === 'leave') {
    return {
      venueSlug: null,
      coPresent: false,
      location: getLocation('player_home')?.name ?? 'Your Place',
    };
  }

  const rawTarget = intent.target ?? intent.detail ?? '';
  const slug = resolveVenueSlug(rawTarget);
  if (slug) {
    return {
      venueSlug: slug,
      location: getLocation(slug)?.name ?? rawTarget,
      coPresent: true,
    };
  }

  if (rawTarget.trim()) {
    return {
      location: rawTarget.trim().slice(0, 200),
      coPresent: intent.subtype === 'arrive' || intent.subtype === 'go' || intent.subtype === 'follow',
    };
  }

  return {};
}

function mergePartialPatches(
  heuristic: Partial<SceneSnapshotPatch> & { venueSlug?: string | null },
  intent: Partial<SceneSnapshotPatch> & { venueSlug?: string | null },
  allowLocationChange: boolean,
): SceneSnapshotPatch & { venueSlug?: string | null } {
  const out: SceneSnapshotPatch & { venueSlug?: string | null } = {};

  if (heuristic.playerMobility) out.playerMobility = heuristic.playerMobility;
  if (heuristic.playerVoice) out.playerVoice = heuristic.playerVoice;
  if (intent.playerMobility && !out.playerMobility) out.playerMobility = intent.playerMobility;
  if (intent.playerVoice && !out.playerVoice) out.playerVoice = intent.playerVoice;

  if (allowLocationChange) {
    const loc = intent.location ?? heuristic.location;
    const co = intent.coPresent ?? heuristic.coPresent;
    const venue =
      intent.venueSlug !== undefined ? intent.venueSlug : heuristic.venueSlug;
    if (loc) out.location = loc;
    if (co !== undefined) out.coPresent = co;
    if (venue !== undefined) out.venueSlug = venue;
  }

  return out;
}

function lockedFieldsForPatch(
  patch: SceneSnapshotPatch,
  sources: SceneDeltaSource[],
  venueSlug?: string | null,
): (keyof SceneSnapshotPatch)[] {
  const locked: (keyof SceneSnapshotPatch)[] = [];
  if (patch.playerMobility) locked.push('playerMobility');
  if (patch.playerVoice) locked.push('playerVoice');
  if (patch.location || patch.coPresent !== undefined || venueSlug !== undefined) {
    if (sources.includes('intent') || sources.includes('heuristic')) {
      if (patch.location) locked.push('location');
      if (patch.coPresent !== undefined) locked.push('coPresent');
    }
  }
  return locked;
}

/** Combines heuristic + intent deltas into one engine apply unit. */
export function buildEngineSceneDelta(opts: {
  message: string;
  intent: PlayerIntent;
  prior: SceneSnapshot | null;
  world: WorldState;
  /** When false (e.g. active arc anchor), skip location/coPresent/venue changes. */
  allowLocationChange?: boolean;
}): EngineSceneDelta | null {
  const allowLocation = opts.allowLocationChange !== false;
  const heuristicRaw = extractSceneDeltaFromMessage(opts.message, opts.prior);
  const intentRaw = allowLocation
    ? extractSceneDeltaFromIntent(opts.intent, opts.world)
    : extractSceneDeltaFromIntent({ ...opts.intent, type: 'observation' }, opts.world);

  const merged = mergePartialPatches(heuristicRaw, intentRaw, allowLocation);
  const { venueSlug, ...patch } = merged as SceneSnapshotPatch & { venueSlug?: string | null };

  const sources: SceneDeltaSource[] = [];
  const hasHeuristic =
    Boolean(heuristicRaw.playerMobility || heuristicRaw.playerVoice) ||
    (allowLocation && Boolean(heuristicRaw.location || heuristicRaw.coPresent !== undefined || heuristicRaw.venueSlug !== undefined));
  const hasIntent =
    allowLocation &&
    Boolean(intentRaw.location || intentRaw.coPresent !== undefined || intentRaw.venueSlug !== undefined);
  if (hasHeuristic) sources.push('heuristic');
  if (hasIntent) sources.push('intent');

  if (Object.keys(patch).length === 0 && venueSlug === undefined) return null;

  const lockedFields = lockedFieldsForPatch(patch, sources, venueSlug);
  return { patch, sources, venueSlug, lockedFields };
}

/** Re-apply engine-locked fields after the director merge so user-forced state sticks. */
export function reapplyEngineLocks(
  snapshot: SceneSnapshot,
  delta: EngineSceneDelta | null,
): SceneSnapshot {
  if (!delta?.lockedFields.length) return snapshot;
  const patch: SceneSnapshotPatch = {};
  for (const field of delta.lockedFields) {
    const v = delta.patch[field];
    if (v !== undefined) {
      (patch as Record<string, unknown>)[field] = v;
    }
  }
  if (Object.keys(patch).length === 0) return snapshot;
  return mergeSceneSnapshot(snapshot, patch, { narratorTexts: [] });
}

export function engineDeltaLogLine(delta: EngineSceneDelta): string {
  const parts = [`sources=${delta.sources.join('+')}`];
  if (delta.patch.location) parts.push(`location=${delta.patch.location}`);
  if (delta.venueSlug !== undefined) parts.push(`venueSlug=${delta.venueSlug ?? 'home'}`);
  if (delta.patch.playerMobility) parts.push(`mobility=${delta.patch.playerMobility}`);
  if (delta.patch.playerVoice) parts.push(`voice=${delta.patch.playerVoice}`);
  return parts.join(' ');
}
