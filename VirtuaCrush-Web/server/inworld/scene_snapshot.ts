// Structured scene continuity — engine-owned merge of location, cast, and
// player/companion conditions. Survives beyond the recent-history window and
// is harder for the director to accidentally erase than a free-text blob.

import type { SceneDirectiveInput } from './story_structure';
import { nameInSceneState, requiredCastNames } from './story_structure';

export type PlayerMobility = 'free' | 'restrained' | 'incapacitated';
export type PlayerVoice = 'free' | 'gagged' | 'muted';

export interface PlayerSnapshot {
  mobility: PlayerMobility;
  voice: PlayerVoice;
  notes: string;
}

export interface SceneSnapshot {
  location: string;
  coPresent: boolean;
  present: string[];
  player: PlayerSnapshot;
  companion: { notes: string };
  openThreads: string[];
  updatedAt: string;
  /** Schema-driven chaos NPCs that already fired this session (pack threads). */
  firedNpcChaos?: string[];
}

/** Partial update the director may return each turn. */
export interface SceneSnapshotPatch {
  location?: string;
  coPresent?: boolean;
  present?: string[];
  departed?: string[];
  playerMobility?: PlayerMobility;
  playerVoice?: PlayerVoice;
  playerNotes?: string;
  companionNotes?: string;
  openThreads?: string[];
  addThreads?: string[];
}

const MOBILITY = new Set<PlayerMobility>(['free', 'restrained', 'incapacitated']);
const VOICE = new Set<PlayerVoice>(['free', 'gagged', 'muted']);
const MAX_THREADS = 5;
const CLEAR_MOBILITY_RE =
  /\b(released|untied|unbound|escaped|loose|wriggled?\s+free|broke\s+free|can move|wrists?\s+(?:are|were)\s+free)\b/i;
const CLEAR_VOICE_RE = /\b(ungagged|can speak|spit(s)? out|removed the gag|free to talk)\b/i;
const RESTRAINED_RE = /\b(tied|bound|restrained|cuffed|handcuffed|zip-?tied|ropes?)\b/i;
const GAGGED_RE = /\b(gag(ged)?|muzzled|can't speak|cannot speak)\b/i;

export function defaultPlayerSnapshot(): PlayerSnapshot {
  return { mobility: 'free', voice: 'free', notes: '' };
}

export function emptySceneSnapshot(): SceneSnapshot {
  return {
    location: '',
    coPresent: true,
    present: [],
    player: defaultPlayerSnapshot(),
    companion: { notes: '' },
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
  coPresent: boolean;
  extraPresent?: string[];
  situationNote?: string;
}): SceneSnapshot {
  const snap = emptySceneSnapshot();
  const namedLocation = opts.location?.trim();
  snap.coPresent = opts.coPresent;
  snap.location = namedLocation
    ? namedLocation
    : opts.coPresent
      ? 'unspecified location'
      : `${opts.companionName}'s place (remote)`;
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

function narratorClearsMobility(narratorTexts: string[]): boolean {
  const blob = narratorTexts.join(' ').toLowerCase();
  return CLEAR_MOBILITY_RE.test(blob) && !RESTRAINED_RE.test(blob);
}

function narratorClearsVoice(narratorTexts: string[]): boolean {
  return CLEAR_VOICE_RE.test(narratorTexts.join(' ').toLowerCase());
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
  opts: { requiredNames?: string[]; narratorTexts?: string[] } = {},
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
  if (patch.companionNotes) companion.notes = patch.companionNotes;

  return {
    location: patch.location ?? prior.location,
    coPresent: patch.coPresent ?? prior.coPresent,
    present: mergePresent(prior.present, patch, required),
    player,
    companion,
    openThreads: mergeThreads(prior.openThreads, patch),
    updatedAt: new Date().toISOString(),
  };
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

  return {
    location: typeof o.location === 'string' ? o.location : '',
    coPresent,
    present,
    player: {
      mobility: mob,
      voice,
      notes: typeof playerObj.notes === 'string' ? playerObj.notes : '',
    },
    companion: { notes: typeof compObj.notes === 'string' ? compObj.notes : '' },
    openThreads,
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : new Date().toISOString(),
  };
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
  const compLine = snap.companion.notes.trim() ? `Companion: ${snap.companion.notes.trim()}.` : '';
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
  const lines = [
    `Location: ${snap.location || 'unspecified'}`,
    snap.coPresent
      ? 'Proximity: together in the same place.'
      : 'Proximity: remote / not co-located (text or call — player is elsewhere).',
    snap.coPresent ? `Present: ${withCompanion}` : `With companion (player is remote): ${withCompanion}`,
    `Player condition (DO NOT drop until explicitly cleared in narration): ${playerLine}`,
  ];
  if (snap.companion.notes.trim()) lines.push(`Companion condition/notes: ${snap.companion.notes.trim()}`);
  if (snap.openThreads.length) lines.push(`Open threads: ${snap.openThreads.map((t) => `- ${t}`).join(' ')}`);
  return lines.join('\n');
}

/** Prompt block — authoritative structured continuity. */
export function formatSceneSnapshotBlock(snap: SceneSnapshot | null): string {
  const body = formatSceneSnapshotBody(snap);
  if (!body) return '';
  return (
    `\n\n=== SCENE SNAPSHOT (ENGINE — authoritative; update via "sceneSnapshot" in your JSON reply) ===\n` +
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
}): { snapshot: SceneSnapshot; sceneState: string } {
  const base =
    opts.priorSnapshot ??
    opts.seedSnapshot ??
    emptySceneSnapshot();

  let snapshot = mergeSceneSnapshot(base, opts.sceneSnapshotPatch, {
    requiredNames: opts.requiredNames ?? [],
    narratorTexts: opts.narratorTexts,
  });

  const castCheck = validateSnapshotCast(snapshot, opts.requiredNames ?? [], opts.narratorTexts);
  if (!castCheck.ok && castCheck.dropped?.length) {
    snapshot = repairSnapshotCast(snapshot, castCheck.dropped);
  }

  const sceneState =
    opts.sceneSnapshotPatch || !opts.sceneStateProse.trim()
      ? snapshotToSceneState(snapshot)
      : opts.sceneStateProse.trim().slice(0, 1200);

  return { snapshot, sceneState };
}
