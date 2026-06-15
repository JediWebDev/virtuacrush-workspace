// TypeScript types for CYOA Story Packs.
//
// Packs live as JSON files under server/packs/*.json and are loaded at runtime,
// so the schema here doubles as documentation for pack authors.

/** Re-used from arcs.ts to avoid a circular import. */
export interface PackSceneAnchor {
  setting: string;    // Short phrase: "in the parking garage beneath your building"
  situation: string;  // Full situation block injected in place of formatSituationBlock
  coPresent: boolean; // Whether companion and player are physically together
}

export interface PackChoice {
  id: string;
  label: string;      // Button text shown to the player
  next: string;       // Node id to advance to on selection
  userMessage: string; // The message sent to the chat when this choice is picked
}

export interface PackNode {
  /** Optional narrator beat shown when entering this node (not sent to LLM). */
  introNarrative?: string;
  /** Injected into the system prompt while this node is active. */
  npcInstruction: string;
  /** When non-null, choice buttons appear after the AI response. */
  choices: PackChoice[] | null;
}

export type PackMood = 'romantic' | 'dramatic' | 'comedic' | 'thriller' | 'mystery';

export interface StoryPack {
  id: string;
  characterId: string;
  title: string;
  blurb: string;
  tags: string[];
  mood: PackMood;
  estimatedMinutes: number;
  /** CSS gradient stop colours [from, to] for the card cover. */
  coverGradient: [string, string];
  /** Always-on system instruction injected for every message in this pack thread. */
  systemInstruction: string;
  sceneAnchor?: PackSceneAnchor;
  /** Keyed by node id. Must contain a "start" key. */
  nodes: Record<string, PackNode>;
}

/** Lightweight shape returned by GET /api/packs (no nodes, no systemInstruction). */
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
