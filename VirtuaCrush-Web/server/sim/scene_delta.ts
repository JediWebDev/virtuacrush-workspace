// Engine-owned scene setting deltas — detected from user input before the
// director narrates. Phase 1: heuristics + movement intent; Phase 2: referee sceneHints.
import type { PlayerIntent, RefereeSceneHints } from './intent';
import type { WorldState } from './world';
import { getLocation, resolveVenueSlug } from '../inworld/locations';
import {
  mergeSceneSnapshot,
  type PlayerMobility,
  type PlayerVoice,
  type SceneSnapshot,
  type SceneSnapshotPatch,
} from '../inworld/scene_snapshot';

export type SceneDeltaSource = 'heuristic' | 'referee' | 'intent';

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

/** Map referee sceneHints → scene patch (declarative setting / constraints). */
export function extractSceneDeltaFromSceneHints(
  hints: RefereeSceneHints | undefined,
): Partial<SceneSnapshotPatch> & { venueSlug?: string | null } {
  if (!hints) return {};

  const patch: Partial<SceneSnapshotPatch> & { venueSlug?: string | null } = {};

  if (hints.playerMobility === 'free' || hints.playerMobility === 'restrained' || hints.playerMobility === 'incapacitated') {
    patch.playerMobility = hints.playerMobility;
  }
  if (hints.playerVoice === 'free' || hints.playerVoice === 'gagged' || hints.playerVoice === 'muted') {
    patch.playerVoice = hints.playerVoice;
  }
  if (hints.playerNotes?.trim()) {
    patch.playerNotes = hints.playerNotes.trim().slice(0, 240);
  }

  const phrase = hints.locationPhrase?.trim();
  if (phrase) {
    const slug = resolveVenueSlug(phrase);
    if (slug) {
      patch.venueSlug = slug;
      patch.location = getLocation(slug)?.name ?? phrase;
    } else {
      patch.location = phrase.slice(0, 200);
    }
  }
  if (hints.coPresent !== undefined) patch.coPresent = hints.coPresent;

  return patch;
}

type PartialPatch = Partial<SceneSnapshotPatch> & { venueSlug?: string | null };

function mergePartialPatches(
  heuristic: PartialPatch,
  referee: PartialPatch,
  intent: PartialPatch,
  allowLocationChange: boolean,
): SceneSnapshotPatch & { venueSlug?: string | null } {
  const out: SceneSnapshotPatch & { venueSlug?: string | null } = {};

  out.playerMobility = heuristic.playerMobility ?? referee.playerMobility ?? intent.playerMobility;
  out.playerVoice = heuristic.playerVoice ?? referee.playerVoice ?? intent.playerVoice;
  out.playerNotes = heuristic.playerNotes ?? referee.playerNotes ?? intent.playerNotes;

  if (allowLocationChange) {
    out.location = intent.location ?? referee.location ?? heuristic.location;
    out.coPresent =
      intent.coPresent ?? referee.coPresent ?? heuristic.coPresent;
    const venue =
      intent.venueSlug !== undefined
        ? intent.venueSlug
        : referee.venueSlug !== undefined
          ? referee.venueSlug
          : heuristic.venueSlug;
    if (venue !== undefined) out.venueSlug = venue;
  }

  // Strip undefined keys so empty merge stays empty.
  for (const k of Object.keys(out) as (keyof typeof out)[]) {
    if (out[k] === undefined) delete out[k];
  }
  return out;
}

function patchHasContent(p: PartialPatch, allowLocation: boolean): boolean {
  if (p.playerMobility || p.playerVoice || p.playerNotes) return true;
  if (!allowLocation) return false;
  return Boolean(p.location || p.coPresent !== undefined || p.venueSlug !== undefined);
}

function lockedFieldsForPatch(
  patch: SceneSnapshotPatch,
  sources: SceneDeltaSource[],
  venueSlug?: string | null,
): (keyof SceneSnapshotPatch)[] {
  const locked: (keyof SceneSnapshotPatch)[] = [];
  if (patch.playerMobility && (sources.includes('heuristic') || sources.includes('referee'))) {
    locked.push('playerMobility');
  }
  if (patch.playerVoice && (sources.includes('heuristic') || sources.includes('referee'))) {
    locked.push('playerVoice');
  }
  if (patch.playerNotes && sources.includes('referee')) locked.push('playerNotes');
  if (patch.location || patch.coPresent !== undefined || venueSlug !== undefined) {
    if (sources.includes('intent') || sources.includes('referee') || sources.includes('heuristic')) {
      if (patch.location) locked.push('location');
      if (patch.coPresent !== undefined) locked.push('coPresent');
    }
  }
  return locked;
}

/** Combines heuristic + referee hints + intent + conversation deltas into one engine apply unit. */
export function buildEngineSceneDelta(opts: {
  message: string;
  intent: PlayerIntent;
  sceneHints?: RefereeSceneHints;
  prior: SceneSnapshot | null;
  world: WorldState;
  /** Inferred from recent transcript (coPresent / location when story moved). */
  conversation?: Partial<SceneSnapshotPatch>;
  /** When false (e.g. active arc anchor), skip location/coPresent/venue changes. */
  allowLocationChange?: boolean;
}): EngineSceneDelta | null {
  const allowLocation = opts.allowLocationChange !== false;
  const heuristicRaw = extractSceneDeltaFromMessage(opts.message, opts.prior);
  const refereeRaw = allowLocation
    ? extractSceneDeltaFromSceneHints(opts.sceneHints)
    : extractSceneDeltaFromSceneHints(
        opts.sceneHints
          ? {
              playerMobility: opts.sceneHints.playerMobility,
              playerVoice: opts.sceneHints.playerVoice,
              playerNotes: opts.sceneHints.playerNotes,
            }
          : undefined,
      );
  const intentRaw = allowLocation
    ? extractSceneDeltaFromIntent(opts.intent, opts.world)
    : {};
  const conversationRaw = allowLocation ? (opts.conversation ?? {}) : {};

  const merged = mergePartialPatches(heuristicRaw, refereeRaw, intentRaw, allowLocation);
  // Conversation fills coPresent/location when the story moved but DB snapshot is stale.
  if (allowLocation) {
    if (conversationRaw.coPresent !== undefined) merged.coPresent = conversationRaw.coPresent;
    if (conversationRaw.location) {
      const priorLoc = opts.prior?.location ?? '';
      const stale = !priorLoc.trim() || /\(remote\)$/i.test(priorLoc) || /^unspecified location$/i.test(priorLoc);
      if (stale || !merged.location) merged.location = conversationRaw.location;
    }
  }

  const { venueSlug, ...patch } = merged as SceneSnapshotPatch & { venueSlug?: string | null };

  const sources: SceneDeltaSource[] = [];
  if (patchHasContent(heuristicRaw, allowLocation)) sources.push('heuristic');
  if (patchHasContent(refereeRaw, allowLocation)) sources.push('referee');
  if (patchHasContent(intentRaw, allowLocation)) sources.push('intent');
  if (conversationRaw.coPresent !== undefined || conversationRaw.location) sources.push('heuristic');

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
  if (delta.patch.playerNotes) parts.push(`notes=${delta.patch.playerNotes.slice(0, 40)}`);
  return parts.join(' ');
}
