// Engine-owned presentation commands — the client stage renders from this,
// not from inferred dialogue text.

import type { SceneSnapshot } from '../inworld/scene_snapshot';
import { formatSpatialLocation } from './spatial';
import { getLocation } from '../inworld/locations';
import { topEmotions, type EmotionKey, type EmotionState } from './emotions';
import {
  backgroundForVenue,
  portraitKeyForCharacter,
} from './presentation_catalog';

export type ActorSlotId = 'companion' | 'player' | 'npc_left' | 'npc_right';
export type ActorPose = 'idle' | 'warm' | 'playful' | 'angry' | 'shy' | 'scared' | 'gagged' | 'restrained';
export type UiMode = 'chat_remote' | 'chat_copresent' | 'chat_crisis';
export type AnimationKind = 'fade_in' | 'pulse' | 'shake';

export interface ActorSlot {
  id: ActorSlotId;
  entityId: string;
  name: string;
  visible: boolean;
  portraitKey: string | null;
  pose: ActorPose;
  expressionLabel: string;
  statusBadges: string[];
  align: 'left' | 'center' | 'right' | 'hidden';
}

export interface PresentationAnimation {
  id: string;
  target: ActorSlotId | 'background';
  kind: AnimationKind;
  durationMs: number;
}

export interface ScenePresentation {
  version: 1;
  backgroundId: string;
  backgroundKey: string | null;
  backgroundGradient: string;
  locationLabel: string;
  venueSlug: string | null;
  roomId: string | null;
  coPresent: boolean;
  uiMode: UiMode;
  actors: ActorSlot[];
  animations: PresentationAnimation[];
  overlays: string[];
}

function poseFromEmotions(emotions: EmotionState | undefined): { pose: ActorPose; label: string } {
  if (!emotions) return { pose: 'idle', label: 'neutral' };
  const top = topEmotions(emotions, 2, 18);
  const key = top[0]?.key as EmotionKey | undefined;
  if (!key) return { pose: 'idle', label: 'neutral' };
  if (key === 'angry' || key === 'annoyed') return { pose: 'angry', label: key };
  if (key === 'scared') return { pose: 'scared', label: key };
  if (key === 'sad') return { pose: 'shy', label: key };
  if (key === 'playful' || key === 'amused') return { pose: 'playful', label: key };
  if (key === 'happy' || key === 'aroused') return { pose: 'warm', label: key };
  return { pose: 'idle', label: key };
}

function mobilityPose(mobility: string, voice: string): { pose?: ActorPose; badges: string[] } {
  const badges: string[] = [];
  let pose: ActorPose | undefined;
  if (mobility === 'restrained') {
    badges.push('Bound');
    pose = 'restrained';
  }
  if (mobility === 'incapacitated') badges.push('Incapacitated');
  if (voice === 'gagged') {
    badges.push('Gagged');
    pose = 'gagged';
  }
  if (voice === 'muted') badges.push('Muted');
  return { pose, badges };
}

function locationLabelForSnapshot(snap: SceneSnapshot | null): string {
  if (!snap) return 'Remote chat';
  if (snap.location.trim()) return snap.location;
  if (snap.venueSlug) {
    const venue = getLocation(snap.venueSlug);
    return formatSpatialLocation(snap.venueSlug, snap.roomId) || venue?.name || snap.venueSlug;
  }
  return snap.coPresent ? 'Together' : 'Remote chat';
}

function uiModeForSnapshot(snap: SceneSnapshot | null): UiMode {
  if (!snap?.coPresent) return 'chat_remote';
  const crisis =
    snap.player.mobility !== 'free' ||
    snap.player.voice !== 'free' ||
    snap.companion.mobility !== 'free' ||
    snap.companion.voice !== 'free';
  return crisis ? 'chat_crisis' : 'chat_copresent';
}

function npcActorsFromPresent(
  present: string[],
  companionName: string,
): { id: ActorSlotId; name: string; align: 'left' | 'right' }[] {
  const skip = new Set(['you', companionName.toLowerCase()]);
  const npcs = present.filter((n) => !skip.has(n.toLowerCase()));
  const out: { id: ActorSlotId; name: string; align: 'left' | 'right' }[] = [];
  if (npcs[0]) out.push({ id: 'npc_left', name: npcs[0], align: 'left' });
  if (npcs[1]) out.push({ id: 'npc_right', name: npcs[1], align: 'right' });
  return out;
}

export function resolvePresentation(opts: {
  snapshot: SceneSnapshot | null;
  characterId: string;
  companionName: string;
  emotions?: EmotionState;
  companionPortraitKey?: string | null;
  chaosTone?: 'subtle' | 'major' | null;
  venueChanged?: boolean;
}): ScenePresentation {
  const snap = opts.snapshot;
  const bg = backgroundForVenue(snap?.venueSlug ?? null, snap?.roomId ?? null);
  const uiMode = uiModeForSnapshot(snap);
  const emotionFace = poseFromEmotions(opts.emotions);
  const companionCond = mobilityPose(snap?.companion.mobility ?? 'free', snap?.companion.voice ?? 'free');
  const playerCond = mobilityPose(snap?.player.mobility ?? 'free', snap?.player.voice ?? 'free');

  const companionPose = companionCond.pose ?? emotionFace.pose;
  const companionExpression =
    companionCond.badges.length > 0 ? companionCond.badges.join(' · ') : emotionFace.label;

  const actors: ActorSlot[] = [
    {
      id: 'companion',
      entityId: opts.characterId,
      name: opts.companionName,
      visible: true,
      portraitKey: portraitKeyForCharacter(opts.characterId, opts.companionPortraitKey),
      pose: companionPose,
      expressionLabel: companionExpression,
      statusBadges: companionCond.badges,
      align: snap?.coPresent ? 'center' : 'center',
    },
  ];

  if (snap?.coPresent) {
    actors.push({
      id: 'player',
      entityId: 'player',
      name: 'You',
      visible: true,
      portraitKey: null,
      pose: playerCond.pose ?? 'idle',
      expressionLabel: playerCond.badges.length ? playerCond.badges.join(' · ') : 'present',
      statusBadges: playerCond.badges,
      align: 'right',
    });
  } else {
    actors.push({
      id: 'player',
      entityId: 'player',
      name: 'You',
      visible: false,
      portraitKey: null,
      pose: 'idle',
      expressionLabel: 'remote',
      statusBadges: [],
      align: 'hidden',
    });
  }

  for (const npc of npcActorsFromPresent(snap?.present ?? [], opts.companionName)) {
    actors.push({
      id: npc.id,
      entityId: `npc:${npc.name.toLowerCase()}`,
      name: npc.name,
      visible: !!snap?.coPresent,
      portraitKey: null,
      pose: 'idle',
      expressionLabel: 'present',
      statusBadges: [],
      align: npc.align,
    });
  }

  const overlays: string[] = [];
  if (uiMode === 'chat_remote') overlays.push('remote_connection');
  if (uiMode === 'chat_crisis') overlays.push('crisis_vignette');

  const animations: PresentationAnimation[] = [];
  if (opts.venueChanged) {
    animations.push({ id: 'bg-fade', target: 'background', kind: 'fade_in', durationMs: 600 });
  }
  if (opts.chaosTone === 'major') {
    animations.push({ id: 'chaos-shake', target: 'companion', kind: 'shake', durationMs: 450 });
  } else if (opts.chaosTone === 'subtle') {
    animations.push({ id: 'chaos-pulse', target: 'background', kind: 'pulse', durationMs: 800 });
  }

  return {
    version: 1,
    backgroundId: bg.backgroundId,
    backgroundKey: bg.backgroundKey,
    backgroundGradient: bg.backgroundGradient,
    locationLabel: locationLabelForSnapshot(snap),
    venueSlug: snap?.venueSlug ?? null,
    roomId: snap?.roomId ?? null,
    coPresent: snap?.coPresent ?? false,
    uiMode,
    actors,
    animations,
    overlays,
  };
}
