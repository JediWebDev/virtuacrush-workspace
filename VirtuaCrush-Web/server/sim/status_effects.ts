// Engine-owned status effects — gag, bind, mute, incapacitated.
// Maps to SceneSnapshot player/companion mobility+voice; LLM does not own these flags.

import type { SceneSnapshot, SceneSnapshotPatch } from '../inworld/scene_snapshot';
import type { PlayerMobility, PlayerVoice } from '../inworld/scene_snapshot';
import {
  extractCompanionConditionFromMessage,
  formatCompanionConditionDirective,
  enforceCompanionSpeechConstraints,
  type HistoryLine,
} from '../inworld/scene_companion_condition';
import type { DirectorTurn } from '../inworld/director';

export type StatusTarget = 'player' | 'companion';

export type StatusEffectId =
  | 'restrained'
  | 'gagged'
  | 'muted'
  | 'incapacitated';

export interface ActiveStatusEffect {
  id: StatusEffectId;
  target: StatusTarget;
}

const MOBILITY_EFFECTS = new Set<StatusEffectId>(['restrained', 'incapacitated']);
const VOICE_EFFECTS = new Set<StatusEffectId>(['gagged', 'muted']);

export function mobilityFromEffect(id: StatusEffectId): PlayerMobility | undefined {
  if (id === 'restrained') return 'restrained';
  if (id === 'incapacitated') return 'incapacitated';
  return undefined;
}

export function voiceFromEffect(id: StatusEffectId): PlayerVoice | undefined {
  if (id === 'gagged') return 'gagged';
  if (id === 'muted') return 'muted';
  return undefined;
}

export function effectsFromSnapshot(snap: SceneSnapshot | null): ActiveStatusEffect[] {
  if (!snap) return [];
  const out: ActiveStatusEffect[] = [];
  if (snap.player.mobility === 'restrained') out.push({ id: 'restrained', target: 'player' });
  if (snap.player.mobility === 'incapacitated') out.push({ id: 'incapacitated', target: 'player' });
  if (snap.player.voice === 'gagged') out.push({ id: 'gagged', target: 'player' });
  if (snap.player.voice === 'muted') out.push({ id: 'muted', target: 'player' });
  if (snap.companion.mobility === 'restrained') out.push({ id: 'restrained', target: 'companion' });
  if (snap.companion.mobility === 'incapacitated') out.push({ id: 'incapacitated', target: 'companion' });
  if (snap.companion.voice === 'gagged') out.push({ id: 'gagged', target: 'companion' });
  if (snap.companion.voice === 'muted') out.push({ id: 'muted', target: 'companion' });
  return out;
}

/** Apply a condition patch from engine heuristics onto snapshot fields. */
export function patchToStatusFields(
  patch: Pick<SceneSnapshotPatch, 'playerMobility' | 'playerVoice' | 'companionMobility' | 'companionVoice'>,
): Pick<SceneSnapshotPatch, 'playerMobility' | 'playerVoice' | 'companionMobility' | 'companionVoice'> {
  return { ...patch };
}

export function resolveCompanionConditionFromMessage(
  message: string,
  companionName: string,
): Pick<SceneSnapshotPatch, 'companionMobility' | 'companionVoice'> {
  return extractCompanionConditionFromMessage(message, companionName);
}

export { formatCompanionConditionDirective, enforceCompanionSpeechConstraints };

export function formatStatusDirectiveBlock(snap: SceneSnapshot | null, companionName: string): string {
  return formatCompanionConditionDirective(snap, companionName);
}

export function enforceStatusOnTurns(
  turns: DirectorTurn[],
  companionName: string,
  snap: SceneSnapshot | null,
): DirectorTurn[] {
  return enforceCompanionSpeechConstraints(turns, companionName, snap);
}

export type { HistoryLine };
