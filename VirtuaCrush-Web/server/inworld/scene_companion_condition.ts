// Engine-owned companion restraint/gag state — survives history trim and is
// enforced on director output without extra LLM calls.

import type { DirectorTurn } from './director';
import type { PlayerMobility, PlayerVoice, SceneSnapshot, SceneSnapshotPatch } from './scene_snapshot';

const CLEAR_VOICE_RE = /\b(ungagged|can speak|spit(s)? out|removed the gag|free to talk|peel(s|ed)? (the )?tape|rip(s|ped)? (the )?tape)\b/i;
const GAGGED_RE = /\b(gag(ged|ging)?|muzzled|can't speak|cannot speak|duct\s+tape)\b/i;
const RESTRAINED_RE = /\b(tied|bound|restrained|cuffed|handcuffed|zip-?tied|ropes?|tied\s+up)\b/i;
const CLEAR_MOBILITY_RE =
  /\b(released|untied|unbound|escaped|loose|wriggled?\s+free|broke\s+free|can move|wrists?\s+(?:are|were)\s+free)\b/i;

const COMPANION_GAG_ACTION_RE =
  /\b(tape|gag|ball\s+gag|duct\s+tape|muzzle)\b.*\b(mouth|lips|gag)\b|\b(mouth|lips)\b.*\b(tape|gag|duct\s+tape)\b|\b(slap|press|stick|put|place|over)\b.*\b(tape|gag)\b/i;

const COMPANION_BIND_ACTION_RE =
  /\b(wrap|tie|bind|tape)\b.*\b(wrists?|ankles?|behind|together)\b|\b(wrists?|ankles?)\b.*\b(behind|together|bound|tied|tape)\b/i;

export function looksMuffledSpeech(text: string): boolean {
  const words = text.replace(/\*[^*]*\*/g, '').trim();
  if (!words) return true;
  if (/\bmm+[mf]+|\bmmm+(?:ph|f)\b|\bnn+gh\b|\bhr+mm\b/i.test(words)) return true;
  if (/^\.{2,}$|^…$/.test(words)) return true;
  // Clear multi-word English = not muffled.
  const clearWord = /\b(this|that|what|okay|hey|you|the|not|funny|still|there|dani|andrew|hello|help|wait|stop)\b/i;
  if (clearWord.test(words) && words.split(/\s+/).length >= 2) return false;
  return words.split(/\s+/).length <= 2 && /^[^a-zA-Z]{0,4}[mn]+/i.test(words);
}

function targetsCompanion(text: string, companionName: string): boolean {
  const t = text.toLowerCase();
  const name = companionName.trim().toLowerCase();
  if (name && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(t)) return true;
  return /\b(her|him|she|he)\b/i.test(t);
}

function targetsPlayer(text: string): boolean {
  return (
    /\b(open|I open)\s+my\s+(mouth|lips)\b/i.test(text) ||
    /\bmy\s+(mouth|lips|gag|wrists?|ankles?)\b/i.test(text) ||
    /\b(I|me|myself)\b.*\b(gag|tape|bind|tie)\s+(my|myself)\b/i.test(text)
  );
}

/** Heuristic pass on user message — companion gag/bind when player acts on them. */
export function extractCompanionConditionFromMessage(
  message: string,
  companionName: string,
): Pick<SceneSnapshotPatch, 'companionMobility' | 'companionVoice'> {
  const patch: Pick<SceneSnapshotPatch, 'companionMobility' | 'companionVoice'> = {};
  const actions = [...message.matchAll(/\*([^*]+)\*/g)].map((m) => m[1]?.trim() ?? '').filter(Boolean);
  const segments = actions.length ? actions : [message];

  for (const seg of segments) {
    if (targetsPlayer(seg)) continue;
    const onCompanion = targetsCompanion(seg, companionName) || (!targetsPlayer(seg) && COMPANION_GAG_ACTION_RE.test(seg));

    if (onCompanion && COMPANION_GAG_ACTION_RE.test(seg)) {
      if (CLEAR_VOICE_RE.test(seg) && !GAGGED_RE.test(seg)) patch.companionVoice = 'free';
      else if (GAGGED_RE.test(seg) || COMPANION_GAG_ACTION_RE.test(seg)) patch.companionVoice = 'gagged';
    }
    if (onCompanion && COMPANION_BIND_ACTION_RE.test(seg)) {
      if (CLEAR_MOBILITY_RE.test(seg) && !RESTRAINED_RE.test(seg)) patch.companionMobility = 'free';
      else if (RESTRAINED_RE.test(seg) || COMPANION_BIND_ACTION_RE.test(seg)) patch.companionMobility = 'restrained';
    }
  }
  return patch;
}

export interface StoryBeatLine {
  summary: string;
}

/** Pinned beats survive history trim — recover gag/bind from them. */
export function inferCompanionConditionFromBeats(
  beats: StoryBeatLine[],
  companionName: string,
): Pick<SceneSnapshotPatch, 'companionMobility' | 'companionVoice'> {
  const patch: Pick<SceneSnapshotPatch, 'companionMobility' | 'companionVoice'> = {};
  const blob = beats.map((b) => b.summary).join('\n');
  const name = companionName.trim();
  if (!name || !blob.trim()) return patch;

  const mentionsCompanion =
    new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(blob) ||
    /\b(her|him|companion|she)\b/i.test(blob);

  if (mentionsCompanion && /\b(gag(ged)?|duct\s+tape|taped|ball\s+gag|muzzled)\b/i.test(blob)) {
    patch.companionVoice = 'gagged';
  }
  if (mentionsCompanion && /\b(restrained|bound|tied|wrists?|ankles?|tape.*wrists?)\b/i.test(blob)) {
    patch.companionMobility = 'restrained';
  }
  return patch;
}

export interface HistoryLine {
  role: 'user' | 'assistant';
  content: string;
}

/** Scan recent transcript for companion gag/bind (when snapshot lost state). */
export function inferCompanionConditionFromConversation(
  history: HistoryLine[],
  message: string,
  companionName: string,
  prior: SceneSnapshot | null,
): Pick<SceneSnapshotPatch, 'companionMobility' | 'companionVoice'> {
  const patch: Pick<SceneSnapshotPatch, 'companionMobility' | 'companionVoice'> = {};
  const blob = [...history.slice(-14), { role: 'user' as const, content: message }]
    .map((m) => m.content)
    .join('\n');
  const tag = companionName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const companionLineMuffled = new RegExp(`\\[${tag}\\][^\\n]*\\bmm+[mf]+`, 'i');

  if (companionLineMuffled.test(blob)) patch.companionVoice = 'gagged';
  if (/\b(duct\s+tape|tape.*(mouth|lips)|gag.*(mouth|lips)|ball\s+gag)\b/i.test(blob) && targetsCompanion(blob, companionName)) {
    patch.companionVoice = 'gagged';
  }
  if (/\b(bound|tied|wrists?.*behind|ankles?.*together|tape.*wrists?)\b/i.test(blob) && targetsCompanion(blob, companionName)) {
    patch.companionMobility = 'restrained';
  }

  // Persist prior engine state when still implied by muffled recent lines.
  if (prior?.companion.voice === 'gagged' && companionLineMuffled.test(blob.slice(-800))) {
    patch.companionVoice = 'gagged';
  }
  if (prior?.companion.mobility === 'restrained') {
    patch.companionMobility = 'restrained';
  }

  return patch;
}

/** Prompt block — companion gag/bind persists beyond trimmed history. */
export function formatCompanionConditionDirective(
  snap: SceneSnapshot | null,
  companionName: string,
): string {
  if (!snap) return '';
  const lines: string[] = [];
  if (snap.companion.voice === 'gagged') {
    lines.push(
      `${companionName} is GAGGED (tape/ball gag on mouth). ALL "${companionName}" dialogue MUST be muffled sounds only (mmf, mmmph) — NEVER clear English words until narrator explicitly removes the gag.`,
    );
  } else if (snap.companion.voice === 'muted') {
    lines.push(`${companionName} cannot speak clearly — muffled sounds only until cleared in narration.`);
  }
  if (snap.companion.mobility === 'restrained') {
    lines.push(`${companionName} is BOUND/RESTRAINED — wrists or ankles tied; cannot move freely until cleared in narration.`);
  }
  if (!lines.length) return '';
  return `\n\n=== COMPANION CONDITION (ENGINE — persists beyond chat history; do NOT ignore) ===\n${lines.join('\n')}`;
}

/** Post-process director lines so gagged companions never speak clearly. */
export function enforceCompanionSpeechConstraints(
  turns: DirectorTurn[],
  companionName: string,
  snap: SceneSnapshot | null,
): DirectorTurn[] {
  if (!snap || (snap.companion.voice !== 'gagged' && snap.companion.voice !== 'muted')) return turns;
  const cn = companionName.trim().toLowerCase();
  return turns.map((t) => {
    if (t.speaker.trim().toLowerCase() !== cn) return t;
    if (looksMuffledSpeech(t.text)) return t;
    return { ...t, text: 'mmf mmf mmf!' };
  });
}

export function mergeCompanionConditionPatches(
  ...patches: Array<Partial<Pick<SceneSnapshotPatch, 'companionMobility' | 'companionVoice'>>>
): Pick<SceneSnapshotPatch, 'companionMobility' | 'companionVoice'> {
  const out: Pick<SceneSnapshotPatch, 'companionMobility' | 'companionVoice'> = {};
  for (const p of patches) {
    if (p.companionVoice) out.companionVoice = p.companionVoice;
    if (p.companionMobility) out.companionMobility = p.companionMobility;
  }
  return out;
}
