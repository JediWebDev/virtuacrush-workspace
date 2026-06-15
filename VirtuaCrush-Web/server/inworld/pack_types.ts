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

export interface PackNode {
  introNarrative?: string;
  npcInstruction: string;
  choices: PackChoice[] | null;
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
  | 'tense';

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
  coverGradient: [string, string];
  systemInstruction: string;
  sceneAnchor?: PackSceneAnchor;
  /** Keyed by node id. Must contain "start" and "end". */
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
