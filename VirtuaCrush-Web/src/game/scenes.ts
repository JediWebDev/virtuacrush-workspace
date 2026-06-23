// Scene-map definitions for the Phaser world.
//
// Design: each location is a SINGLE background image (a PNG dropped under the
// asset proxy, e.g. R2 key `scenes/apartment.png`). Walkable bounds and solid
// furniture/walls are described as plain rectangles (invisible static physics
// bodies). Interactive objects (tv, stove, sofa, doors, …) are overlap zones.
// Everything is authored in PIXEL coordinates against the map's native size, so
// the workflow is: drop the PNG in, turn on debug (?game-debug), draw rectangles
// by eye (they print to the console), and paste the coordinates here. No editor.
//
// Movement and interactions live here + in Phaser — the LLM is only invoked when
// the player walks up to a character and opens the dialogue overlay.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type InteractableKind = 'object' | 'door';

export interface SceneInteractable extends Rect {
  id: string;
  /** Verb shown on the in-world prompt, e.g. "Watch TV", "Cook", "Sit". */
  label: string;
  kind: InteractableKind;
  /** For doors: the scene id to travel to. */
  to?: string;
  /** Optional gating — a skill the player must have chosen. */
  requiresSkill?: string;
  /** Optional gating — an inventory item category the player must own. */
  requiresItemCategory?: string;
  /** Flavor result shown when the action fires (placeholder until the skill
   *  system lands; doors ignore this). */
  result?: string;
}

export interface SceneMap {
  id: string;
  name: string;
  /** Asset key for the background PNG served via /api/assets. When omitted (or
   *  the image fails to load) the canvas draws a procedural floor instead. */
  mapKey?: string;
  /** Native pixel size of the map image / world. */
  worldWidth: number;
  worldHeight: number;
  /** Where the player spawns / returns to in this scene. */
  spawn: { x: number; y: number };
  /** Where the companion stands in this scene. */
  npcAnchor: { x: number; y: number };
  /** Solid, impassable rectangles (walls + furniture footprints). */
  collisions: Rect[];
  /** Interactive zones (objects + doors). */
  interactables: SceneInteractable[];
}

const WALL = 24; // perimeter wall thickness (px)

/** Builds the four perimeter walls for a rectangular room. */
function perimeter(w: number, h: number): Rect[] {
  return [
    { x: 0, y: 0, w, h: WALL }, // top
    { x: 0, y: h - WALL, w, h: WALL }, // bottom
    { x: 0, y: 0, w: WALL, h }, // left
    { x: w - WALL, y: 0, w: WALL, h }, // right
  ];
}

// === Example: the player's apartment (interior) ============================
const APARTMENT: SceneMap = {
  id: 'apartment',
  name: 'Apartment',
  mapKey: 'scenes/apartment.png',
  worldWidth: 1024,
  worldHeight: 768,
  spawn: { x: 512, y: 600 },
  npcAnchor: { x: 700, y: 360 },
  collisions: [
    ...perimeter(1024, 768),
    { x: 120, y: 120, w: 240, h: 90 }, // kitchen counter
    { x: 430, y: 150, w: 150, h: 70 }, // stove block
    { x: 120, y: 470, w: 220, h: 110 }, // sofa
    { x: 640, y: 470, w: 200, h: 120 }, // bed
    { x: 470, y: 470, w: 130, h: 80 }, // coffee table
  ],
  interactables: [
    { id: 'tv', label: 'Watch TV', kind: 'object', x: 460, y: 250, w: 110, h: 80, result: 'You flop down and flick through channels for a bit.' },
    { id: 'stove', label: 'Cook', kind: 'object', x: 430, y: 226, w: 150, h: 70, requiresSkill: 'cooking', result: 'You whip up a quick meal at the stove.' },
    { id: 'sofa', label: 'Relax', kind: 'object', x: 120, y: 585, w: 220, h: 60, result: 'You sink into the sofa and let the day melt away.' },
    { id: 'bed', label: 'Rest', kind: 'object', x: 640, y: 595, w: 200, h: 60, result: 'You stretch out on the bed and rest a while.' },
    { id: 'door-downtown', label: 'Go downtown', kind: 'door', to: 'downtown', x: 940, y: 320, w: 60, h: 140 },
  ],
};

// === Example: downtown street (exterior) ===================================
const DOWNTOWN: SceneMap = {
  id: 'downtown',
  name: 'Downtown',
  mapKey: 'scenes/downtown.png',
  worldWidth: 1280,
  worldHeight: 768,
  spawn: { x: 120, y: 560 },
  npcAnchor: { x: 760, y: 430 },
  collisions: [
    ...perimeter(1280, 768),
    { x: 0, y: 0, w: 1280, h: 230 }, // building fronts (top band)
    { x: 980, y: 470, w: 180, h: 90 }, // parked car
    { x: 360, y: 520, w: 150, h: 40 }, // bench
  ],
  interactables: [
    { id: 'coffee', label: 'Get coffee', kind: 'object', x: 200, y: 235, w: 140, h: 60, result: 'You grab a hot coffee from the cart.' },
    { id: 'bench', label: 'Sit', kind: 'object', x: 360, y: 480, w: 150, h: 40, result: 'You take a seat on the bench and people-watch.' },
    { id: 'car', label: 'Drive', kind: 'object', x: 980, y: 575, w: 180, h: 50, requiresItemCategory: 'vehicle', result: 'You hop in and take the car for a spin.' },
    { id: 'door-home', label: 'Go home', kind: 'door', to: 'apartment', x: 40, y: 560, w: 70, h: 150 },
  ],
};

export const SCENES: Record<string, SceneMap> = {
  apartment: APARTMENT,
  downtown: DOWNTOWN,
};

export const DEFAULT_SCENE_ID = 'apartment';

export function getScene(id: string | null | undefined): SceneMap {
  return (id && SCENES[id]) || SCENES[DEFAULT_SCENE_ID];
}
