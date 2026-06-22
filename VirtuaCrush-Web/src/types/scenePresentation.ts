// Client types for engine-owned scene presentation (mirrors server/sim/scene_presentation.ts).

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

export function isScenePresentation(v: unknown): v is ScenePresentation {
  return Boolean(v && typeof v === 'object' && (v as ScenePresentation).version === 1);
}
