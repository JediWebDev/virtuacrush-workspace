// TypeScript types for CYOA Story Packs.

export interface PackSceneAnchor {
  setting: string;
  situation: string;
  coPresent: boolean;
}

export interface PackChoice {
  id: string;
  label: string;
  next: string;
  userMessage: string;
}

// TypeScript types for CYOA Story Packs.

import type { StoryAct } from './story_structure';

export type { StoryAct };

export interface PackNode {
  introNarrative?: string;
  npcInstruction: string;
  /** Three-act phase for pacing. Inferred from graph position when omitted. */
  act?: StoryAct;
  choices: PackChoice[] | null;
}

/** A named non-companion character who can speak/act in the scene (e.g. Urik). */
export interface PackNpc {
  /** Display name; also used as the [TAG] the model must use for this speaker. */
  name: string;
  /** One-line brief describing who they are and how they behave. */
  description: string;
}

export type PackMood =
  | 'romantic'
  | 'dramatic'
  | 'comedic'
  | 'thriller'
  | 'mystery'
  | 'playful'
  | 'cozy'
  | 'gothic'
  | 'tense'
  | 'sexy'
  | 'kinky';

export interface StoryPack {
  id: string;
  characterId: string;
  title: string;
  blurb: string;
  tags: string[];
  mood: PackMood;
  estimatedMinutes: number;
  /** Auto-complete the session after this many total messages (Option C fallback). Default 40. */
  maxTurns?: number;
  /** Affinity points awarded once, when the player completes the story. Default 10. */
  affinityReward?: number;
  coverGradient: [string, string];
  systemInstruction: string;
  sceneAnchor?: PackSceneAnchor;
  /** Named NPCs present in this story who may speak/act in their own tagged lines. */
  npcs?: PackNpc[];
  /** Keyed by node id. Must contain a "start" node; terminal nodes have choices: null. */
  nodes: Record<string, PackNode>;
}

export interface PackMeta {
  id: string;
  characterId: string;
  title: string;
  blurb: string;
  tags: string[];
  mood: PackMood;
  estimatedMinutes: number;
  coverGradient: [string, string];
}
