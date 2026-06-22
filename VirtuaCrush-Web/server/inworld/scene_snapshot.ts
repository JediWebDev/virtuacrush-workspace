// Structured scene continuity — engine-owned merge of location, cast, and
// player/companion conditions. Survives beyond the recent-history window and
// is harder for the director to accidentally erase than a free-text blob.

import type { SceneDirectiveInput } from './story_structure';
import { nameInSceneState, requiredCastNames } from './story_structure';
import { normalizeSnapshotSpatial } from '../sim/spatial';
import { resolveVenueSlug } from './locations';

export type PlayerMobility = 'free' | 'restrained' | 'incapacitated';
export type PlayerVoice = 'free' | 'gagged' | 'muted';

export interface PlayerSnapshot {
  mobility: PlayerMobility;
  voice: PlayerVoice;
  notes: string;
}

export interface CompanionSnapshot {
  mobility: PlayerMobility;
  voice: PlayerVoice;
  notes: string;
}

export interface SceneSnapshot {
  /** Engine-derived display label (from venueSlug + roomId). */
  location: string;
  /** Registry slug — authoritative travel state. null = remote / not at a venue. */
  venueSlug: string | null;
  /** Room within venue (e.g. living_room). Optional. */
  roomId: string | null;
  coPresent: boolean;
  present: string[];
  player: PlayerSnapshot;
  companion: CompanionSnapshot;
  openThreads: string[];
  updatedAt: string;
  /** Schema-driven chaos NPCs that already fired this session (pack threads). */
  firedNpcChaos?: string[];
}

/** Partial update — engine-owned fields are set by scene_delta / spatial; director hints are sanitized. */
export interface SceneSnapshotPatch {
  location?: string;
  venueSlug?: string | null;
  roomId?: string | null;
  coPresent?: boolean;
  present?: string[];
  departed?: string[];
  playerMobility?: PlayerMobility;
  playerVoice?: PlayerVoice;
  playerNotes?: string;
  companionMobility?: PlayerMobility;
  companionVoice?: PlayerVoice;
  companionNotes?: string;
  openThreads?: string[];
  addThreads?: string[];
}

const MOBILITY = new Set<PlayerMobility>(['free', 'restrained', 'incapacitated']);
const VOICE = new Set<PlayerVoice>(['free', 'gagged', 'muted']);
const MAX_THREADS = 5;
const CLEAR_MOBILITY_RE =
  /\b(released|untied|unbound|escaped|loose|wriggled?\s+free|broke\s+free|can move|wrists?\s+(?:are|were)\s+free)\b/i;
const CLEAR_VOICE_RE =
  /\b(ungagged|can speak|spit(s)? out|removed the gag|free to talk|peel(s|ed)? (the )?tape|rip(s|ped)? (the )?tape|pull(s|ed)? (the )?(tape|gag) off|take(s|ing)? (the )?gag off|remove(s|d)? (the )?(tape|gag)|ungag)\b/i;
const RESTRAINED_RE = /\b(tied|bound|restrained|cuffed|handcuffed|zip-?tied|ropes?)\b/i;
const GAGGED_RE = /\b(gag(ged)?|muzzled|can't speak|cannot speak)\b/i;

export function defaultPlayerSnapshot(): PlayerSnapshot {
  return { mobility: 'free', voice: 'free', notes: '' };
}

export function defaultCompanionSnapshot(): CompanionSnapshot {
  return { mobility: 'free', voice: 'free', notes: '' };
}

export function emptySceneSnapshot(): SceneSnapshot {
  return {
    location: '',
    venueSlug: null,
    roomId: null,
    coPresent: true,
    present: [],
    player: defaultPlayerSnapshot(),
    companion: defaultCompanionSnapshot(),
    openThreads: [],
    updatedAt: new Date().toISOString(),
  };
}

export function buildInitialSceneSnapshot(input: SceneDirectiveInput): SceneSnapshot {
  const snap = emptySceneSnapshot();
  snap.location = input.setting.trim() || 'unspecified location';
  snap.coPresent = input.coPresent;
  snap.present = input.presentCharacters.map((c) => c.name);
  const sit = input.situation.trim();
  if (sit) snap.openThreads = [sit.slice(0, 200)];
  snap.updatedAt = new Date().toISOString();
  return snap;
}

export function buildFreeRoamSceneSnapshot(opts: {
  companionName: string;
  location?: string | null;
  venueSlug?: string | null;
  coPresent: boolean;
  extraPresent?: string[];
  situationNote?: string;
}): SceneSnapshot {
  const snap = emptySceneSnapshot();
  snap.coPresent = opts.coPresent;
  snap.venueSlug = opts.venueSlug ?? null;
  if (!snap.venueSlug && opts.location?.trim()) {
    snap.venueSlug = resolveVenueSlug(opts.location);
  }
  if (snap.venueSlug) {
    normalizeSnapshotSpatial(snap);
  } else {
    const namedLocation = opts.location?.trim();
    snap.location = namedLocation
      ? namedLocation
      : opts.coPresent
        ? 'unspecified location'
        : `${opts.companionName}'s place (remote)`;
  }
  // Remote/texting: player is not in the companion's physical space.
  snap.present = opts.coPresent
    ? ['you', opts.companionName, ...(opts.extraPresent ?? [])]
    : [opts.companionName, ...(opts.extraPresent ?? [])];
  if (opts.situationNote?.trim()) snap.openThreads = [opts.situationNote.trim().slice(0, 200)];
  return snap;
}

function normName(s: string): string {
  return s.trim();
}

function parseMobility(v: unknown): PlayerMobility | undefined {
  return typeof v === 'string' && MOBILITY.has(v as PlayerMobility) ? (v as PlayerMobility) : undefined;
}

function parseVoice(v: unknown): PlayerVoice | undefined {
  return typeof v === 'string' && VOICE.has(v as PlayerVoice) ? (v as PlayerVoice) : undefined;
}

/** Parses a director `sceneSnapshot` object (fail-soft). */
export function parseSceneSnapshotPatch(raw: unknown): SceneSnapshotPatch | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const patch: SceneSnapshotPatch = {};

  if (typeof o.location === 'string' && o.location.trim()) patch.location = o.location.trim().slice(0, 200);
  if (typeof o.venueSlug === 'string') patch.venueSlug = o.venueSlug.trim() || null;
  if (o.venueSlug === null) patch.venueSlug = null;
  if (typeof o.roomId === 'string') patch.roomId = o.roomId.trim().slice(0, 80) || null;
  if (o.roomId === null) patch.roomId = null;
  if (typeof o.coPresent === 'boolean') patch.coPresent = o.coPresent;

  const present = Array.isArray(o.present)
    ? o.present.map((x) => (typeof x === 'string' ? normName(x) : '')).filter(Boolean).slice(0, 12)
    : [];
  if (present.length) patch.present = present;

  const departed = Array.isArray(o.departed)
    ? o.departed.map((x) => (typeof x === 'string' ? normName(x) : '')).filter(Boolean)
    : [];
  if (departed.length) patch.departed = departed;

  const mob = parseMobility(o.playerMobility);
  if (mob) patch.playerMobility = mob;
  const voice = parseVoice(o.playerVoice);
  if (voice) patch.playerVoice = voice;
  if (typeof o.playerNotes === 'string' && o.playerNotes.trim()) {
    patch.playerNotes = o.playerNotes.trim().slice(0, 240);
  }
  if (typeof o.companionNotes === 'string' && o.companionNotes.trim()) {
    patch.companionNotes = o.companionNotes.trim().slice(0, 240);
  }
  const compMob = parseMobility(o.companionMobility);
  if (compMob) patch.companionMobility = compMob;
  const compVoice = parseVoice(o.companionVoice);
  if (compVoice) patch.companionVoice = compVoice;

  const threads = Array.isArray(o.openThreads)
    ? o.openThreads.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean).slice(0, MAX_THREADS)
    : [];
  if (threads.length) patch.openThreads = threads.map((t) => t.slice(0, 200));

  const addThreads = Array.isArray(o.addThreads)
    ? o.addThreads.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean).slice(0, 3)
    : [];
  if (addThreads.length) patch.addThreads = addThreads.map((t) => t.slice(0, 200));

  return Object.keys(patch).length ? patch : null;
}

/**
 * Strip engine-authoritative fields from director hints.
 * Director may suggest cast/thread notes only; spatial + conditions are engine-owned.
 */
export function sanitizeDirectorSnapshotPatch(
  patch: SceneSnapshotPatch | null,
): SceneSnapshotPatch | null {
  if (!patch) return null;
  const safe: SceneSnapshotPatch = {};
  if (patch.present?.length) safe.present = patch.present;
  if (patch.departed?.length) safe.departed = patch.departed;
  if (patch.openThreads?.length) safe.openThreads = patch.openThreads;
  if (patch.addThreads?.length) safe.addThreads = patch.addThreads;
  if (patch.playerNotes?.trim()) safe.playerNotes = patch.playerNotes;
  if (patch.companionNotes?.trim()) safe.companionNotes = patch.companionNotes;
  return Object.keys(safe).length ? safe : null;
}

const CLEAR_COMPANION_BIND_RE =
  /\b(cut\s+(the\s+)?(zip\s*-?\s*ties?|restraints?|rope)|untied|unbound|released\s+from|wrists?\s+(?:are|were)\s+free|freed?\s+(?:her|his|their)\s+(?:wrists|hands)|get\s+(?:her|him|them)\s+loose)\b/i;

function narratorClearsMobility(narratorTexts: string[]): boolean {
  const blob = narratorTexts.join(' ').toLowerCase();
  return CLEAR_MOBILITY_RE.test(blob) && !RESTRAINED_RE.test(blob);
}

/** Ungagging in narration must not clear bind — require explicit untie/cut language. */
function narratorClearsCompanionMobility(narratorTexts: string[], companionName?: string): boolean {
  const blob = narratorTexts.join(' ').toLowerCase();
  if (!CLEAR_COMPANION_BIND_RE.test(blob) || RESTRAINED_RE.test(blob)) return false;
  const name = companionName?.trim().toLowerCase();
  if (name && blob.includes(name)) return true;
  return /\b(cut|untie|unbind|release)\b/.test(blob);
}

function narratorClearsVoice(narratorTexts: string[]): boolean {
  return CLEAR_VOICE_RE.test(narratorTexts.join(' ').toLowerCase());
}

function narratorClearsCompanionVoice(narratorTexts: string[], companionName?: string): boolean {
  const blob = narratorTexts.join(' ').toLowerCase();
  if (!CLEAR_VOICE_RE.test(blob) || GAGGED_RE.test(blob)) return false;
  const name = companionName?.trim().toLowerCase();
  if (name && blob.includes(name)) return true;
  return /\b(peel|rip|remove|pull).*(tape|gag).*(mouth|lips|her|him)\b/.test(blob);
}

function mergePresent(prior: string[], patch: SceneSnapshotPatch, required: string[]): string[] {
  let next = patch.present?.length ? [...patch.present] : [...prior];
  for (const name of patch.departed ?? []) {
    next = next.filter((n) => n.toLowerCase() !== name.toLowerCase());
  }
  for (const name of required) {
    if (!next.some((n) => n.toLowerCase() === name.toLowerCase())) next.push(name);
  }
  const seen = new Set<string>();
  return next.filter((n) => {
    const k = n.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function mergeThreads(prior: string[], patch: SceneSnapshotPatch): string[] {
  if (patch.openThreads?.length) return patch.openThreads.slice(0, MAX_THREADS);
  const merged = [...prior, ...(patch.addThreads ?? [])];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of merged) {
    const k = t.toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.slice(-MAX_THREADS);
}

/**
 * Engine merge: conditions persist until explicitly cleared or updated.
 * Required cast names are re-injected if the model drops them.
 */
export function mergeSceneSnapshot(
  prior: SceneSnapshot,
  patch: SceneSnapshotPatch | null,
  opts: { requiredNames?: string[]; narratorTexts?: string[]; companionName?: string } = {},
): SceneSnapshot {
  if (!patch) return prior;

  const narr = opts.narratorTexts ?? [];
  const required = opts.requiredNames ?? [];
  const player = { ...prior.player };
  const companion = { ...prior.companion };

  if (patch.playerMobility) {
    player.mobility = patch.playerMobility;
  } else if (player.mobility !== 'free' && narratorClearsMobility(narr)) {
    player.mobility = 'free';
  }

  if (patch.playerVoice) {
    player.voice = patch.playerVoice;
  } else if (player.voice !== 'free' && narratorClearsVoice(narr)) {
    player.voice = 'free';
  }

  if (patch.playerNotes) player.notes = patch.playerNotes;

  const voiceOnlyClear = patch.companionVoice === 'free' && !patch.companionMobility;
  if (patch.companionMobility) {
    companion.mobility = patch.companionMobility;
  } else if (
    companion.mobility !== 'free' &&
    !voiceOnlyClear &&
    narratorClearsCompanionMobility(narr, opts.companionName)
  ) {
    companion.mobility = 'free';
  }

  if (patch.companionVoice) {
    companion.voice = patch.companionVoice;
  } else if (companion.voice !== 'free' && narratorClearsCompanionVoice(narr, opts.companionName)) {
    companion.voice = 'free';
  }

  if (patch.companionNotes) companion.notes = patch.companionNotes;

  const next: SceneSnapshot = {
    venueSlug: patch.venueSlug !== undefined ? patch.venueSlug : prior.venueSlug,
    roomId: patch.roomId !== undefined ? patch.roomId : prior.roomId,
    coPresent: patch.coPresent ?? prior.coPresent,
    present: mergePresent(prior.present, patch, required),
    player,
    companion,
    openThreads: mergeThreads(prior.openThreads, patch),
    updatedAt: new Date().toISOString(),
    location: prior.location,
    firedNpcChaos: prior.firedNpcChaos,
  };

  if (patch.location && patch.venueSlug === undefined) {
    const slug = resolveVenueSlug(patch.location);
    if (slug) next.venueSlug = slug;
  }
  normalizeSnapshotSpatial(next);
  return next;
}

/** Reads a snapshot stored in npc knowledge JSON. */
export function readSceneSnapshot(knowledge: Record<string, unknown> | undefined): SceneSnapshot | null {
  const raw = knowledge?.sceneSnapshot;
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const playerRaw = o.player;
  const playerObj = playerRaw && typeof playerRaw === 'object' ? (playerRaw as Record<string, unknown>) : {};
  const mob = parseMobility(playerObj.mobility) ?? 'free';
  const voice = parseVoice(playerObj.voice) ?? 'free';
  const companionRaw = o.companion;
  const compObj = companionRaw && typeof companionRaw === 'object' ? (companionRaw as Record<string, unknown>) : {};

  const coPresent = o.coPresent !== false;

  let present = Array.isArray(o.present)
    ? o.present.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean)
    : [];
  if (!coPresent) present = present.filter((n) => n.toLowerCase() !== 'you');

  const openThreads = Array.isArray(o.openThreads)
    ? o.openThreads.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean).slice(0, MAX_THREADS)
    : [];

  const snap: SceneSnapshot = {
    location: typeof o.location === 'string' ? o.location : '',
    venueSlug: typeof o.venueSlug === 'string' ? o.venueSlug : o.venueSlug === null ? null : resolveVenueSlug(typeof o.location === 'string' ? o.location : '') ?? null,
    roomId: typeof o.roomId === 'string' ? o.roomId : null,
    coPresent,
    present,
    player: {
      mobility: mob,
      voice,
      notes: typeof playerObj.notes === 'string' ? playerObj.notes : '',
    },
    companion: {
      mobility: parseMobility(compObj.mobility) ?? 'free',
      voice: parseVoice(compObj.voice) ?? 'free',
      notes: typeof compObj.notes === 'string' ? compObj.notes : '',
    },
    openThreads,
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : new Date().toISOString(),
  };
  normalizeSnapshotSpatial(snap);
  return snap;
}

/** Serializes snapshot for npc_state.knowledge.sceneSnapshot. */
export function writeSceneSnapshot(snap: SceneSnapshot): Record<string, unknown> {
  return { ...snap };
}

/** Prose fallback stored in sceneState / pack_sessions.scene_state. */
export function snapshotToSceneState(snap: SceneSnapshot): string {
  const present = snap.present.length
    ? snap.present.join('; ')
    : snap.coPresent
      ? 'companion and player'
      : 'companion only';
  const prox = snap.coPresent
    ? 'Companion and player are physically together.'
    : 'Companion and player are NOT in the same physical space (remote/texting).';
  const playerCond = [
    snap.player.mobility !== 'free' ? `mobility: ${snap.player.mobility}` : '',
    snap.player.voice !== 'free' ? `voice: ${snap.player.voice}` : '',
    snap.player.notes.trim(),
  ].filter(Boolean).join('; ');
  const playerLine = playerCond ? `Player condition: ${playerCond}.` : 'Player condition: free.';
  const compCond = [
    snap.companion.mobility !== 'free' ? `mobility: ${snap.companion.mobility}` : '',
    snap.companion.voice !== 'free' ? `voice: ${snap.companion.voice}` : '',
    snap.companion.notes.trim(),
  ].filter(Boolean).join('; ');
  const compLine = compCond ? `Companion condition: ${compCond}.` : '';
  const threads = snap.openThreads.length ? ` Open threads: ${snap.openThreads.join(' | ')}` : '';
  return `Location: ${snap.location || 'unspecified'}. ${prox} Present: ${present}. ${playerLine}${compLine ? ` ${compLine}` : ''}${threads}`.slice(
    0,
    1200,
  );
}

/** Prose lines for prompt injection (no section header). */
export function formatSceneSnapshotBody(snap: SceneSnapshot | null): string {
  if (!snap) return '';
  const withCompanion = snap.present.length
    ? snap.present.join(', ')
    : snap.coPresent
      ? 'companion and player'
      : 'companion only';
  const playerParts = [
    snap.player.mobility !== 'free' ? snap.player.mobility : '',
    snap.player.voice !== 'free' ? snap.player.voice : '',
    snap.player.notes.trim(),
  ].filter(Boolean);
  const playerLine = playerParts.length ? playerParts.join('; ') : 'free';
  const compParts = [
    snap.companion.mobility !== 'free' ? snap.companion.mobility : '',
    snap.companion.voice !== 'free' ? snap.companion.voice : '',
    snap.companion.notes.trim(),
  ].filter(Boolean);
  const compLine = compParts.length ? compParts.join('; ') : 'free';
  const lines = [
    `Place: ${snap.location || 'unspecified'}${snap.venueSlug ? ` [venue=${snap.venueSlug}${snap.roomId ? `, room=${snap.roomId}` : ''}]` : ''}`,
    snap.coPresent
      ? 'Proximity: together in the same place.'
      : 'Proximity: remote / not co-located (text or call — player is elsewhere).',
    snap.coPresent ? `Present: ${withCompanion}` : `With companion (player is remote): ${withCompanion}`,
    `Player condition (DO NOT drop until explicitly cleared in narration): ${playerLine}`,
    `Companion condition (DO NOT drop until explicitly cleared in narration): ${compLine}`,
  ];
  if (snap.companion.notes.trim() && !compParts.includes(snap.companion.notes.trim())) {
    lines.push(`Companion notes: ${snap.companion.notes.trim()}`);
  }
  if (snap.openThreads.length) lines.push(`Open threads: ${snap.openThreads.map((t) => `- ${t}`).join(' ')}`);
  return lines.join('\n');
}

/** Prompt block — authoritative structured continuity. */
export function formatSceneSnapshotBlock(snap: SceneSnapshot | null): string {
  const body = formatSceneSnapshotBody(snap);
  if (!body) return '';
  return (
    `\n\n=== SCENE CONTINUITY (ENGINE — authoritative; do NOT change location or conditions in JSON) ===\n` +
    body
  );
}

/** Validates merged snapshot still includes required cast (mirrors sceneState check). */
export function validateSnapshotCast(
  snap: SceneSnapshot,
  requiredNames: string[],
  narratorTexts: string[] = [],
): { ok: boolean; dropped?: string[] } {
  const prose = snapshotToSceneState(snap);
  const dropped: string[] = [];
  for (const name of requiredNames) {
    if (!nameInSceneState(prose, name)) dropped.push(name);
  }
  if (!dropped.length) return { ok: true };
  const narr = narratorTexts.join(' ');
  const stillPresent = dropped.filter((n) => !narr.toLowerCase().includes(n.toLowerCase()));
  return stillPresent.length ? { ok: false, dropped: stillPresent } : { ok: true };
}

export function repairSnapshotCast(snap: SceneSnapshot, dropped: string[]): SceneSnapshot {
  const present = [...snap.present];
  for (const name of dropped) {
    if (!present.some((n) => n.toLowerCase() === name.toLowerCase())) present.push(name);
  }
  return { ...snap, present, updatedAt: new Date().toISOString() };
}

export function requiredNamesFromDirective(input: SceneDirectiveInput | null): string[] {
  return input ? requiredCastNames(input) : [];
}

/** Applies a director turn's scene continuity fields with engine merge + cast repair. */
export function applySceneContinuityUpdate(opts: {
  priorSnapshot: SceneSnapshot | null;
  sceneSnapshotPatch: SceneSnapshotPatch | null;
  sceneStateProse: string;
  narratorTexts: string[];
  requiredNames?: string[];
  seedSnapshot?: SceneSnapshot | null;
  companionName?: string;
}): { snapshot: SceneSnapshot; sceneState: string } {
  const base =
    opts.priorSnapshot ??
    opts.seedSnapshot ??
    emptySceneSnapshot();

  const directorPatch = sanitizeDirectorSnapshotPatch(opts.sceneSnapshotPatch);

  let snapshot = mergeSceneSnapshot(base, directorPatch, {
    requiredNames: opts.requiredNames ?? [],
    narratorTexts: opts.narratorTexts,
    companionName: opts.companionName,
  });

  const castCheck = validateSnapshotCast(snapshot, opts.requiredNames ?? [], opts.narratorTexts);
  if (!castCheck.ok && castCheck.dropped?.length) {
    snapshot = repairSnapshotCast(snapshot, castCheck.dropped);
  }

  const sceneState =
    directorPatch || !opts.sceneStateProse.trim()
      ? snapshotToSceneState(snapshot)
      : opts.sceneStateProse.trim().slice(0, 1200);

  return { snapshot, sceneState };
}
