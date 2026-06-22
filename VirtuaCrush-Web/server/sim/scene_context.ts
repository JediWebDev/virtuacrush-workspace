/**
 * Unified runtime context for a single chat turn — schemas, NPCs, arcs, and
 * scene composition in one place for the chaos engine and director.
 */
import type { StoryArc } from '../inworld/arcs';
import type { NarrativeTag } from '../inworld/arcs';
import type { ResolvedSceneNpc } from '../inworld/npc_schema';
import type { SceneComposition } from './scene_composer';
import type { WorldState } from './world';

export type SceneMode = 'freeRoam' | 'arc' | 'pack';

export interface SceneContext {
  mode: SceneMode;
  world: WorldState;
  composition: SceneComposition | null;
  resolvedNpcs: ResolvedSceneNpc[];
  activeArc: StoryArc | null;
  arcTags: NarrativeTag[];
  turn: number;
  companionId: string;
  companionName: string;
  suppressAmbientDisruptions: boolean;
  /** Skip earthquakes, car crashes, etc. — NPC chaos still allowed. */
  suppressEnvironmentalChaos: boolean;
  coPresent: boolean;
  firedNpcChaos: string[];
}

export interface BuildSceneContextInput {
  world: WorldState;
  composition: SceneComposition | null;
  resolvedNpcs: ResolvedSceneNpc[];
  activeArc: StoryArc | null;
  turn: number;
  companionId: string;
  companionName: string;
  atVenue: boolean;
  mode?: SceneMode;
  /** Override when no StoryArc is active (pack sessions). */
  arcTags?: NarrativeTag[];
  coPresent?: boolean;
  suppressAmbientDisruptions?: boolean;
  suppressEnvironmentalChaos?: boolean;
  /** NPC chaos keys already fired this scene/session. */
  firedNpcChaos?: string[];
}

export function buildSceneContext(input: BuildSceneContextInput): SceneContext {
  const coPresent =
    (input.coPresent ?? Boolean(input.activeArc?.sceneAnchor?.coPresent)) || input.atVenue;
  const arcTags = input.arcTags ?? input.activeArc?.arcTags ?? [];
  const suppressAmbientDisruptions = input.suppressAmbientDisruptions ?? false;
  const suppressEnvironmentalChaos = input.suppressEnvironmentalChaos ?? suppressAmbientDisruptions;
  const firedNpcChaos = input.firedNpcChaos ?? input.composition?.firedNpcChaos ?? [];
  return {
    mode: input.mode ?? (input.activeArc ? 'arc' : 'freeRoam'),
    world: input.world,
    composition: input.composition,
    resolvedNpcs: input.resolvedNpcs,
    activeArc: input.activeArc,
    arcTags,
    turn: input.turn,
    companionId: input.companionId,
    companionName: input.companionName,
    suppressAmbientDisruptions,
    suppressEnvironmentalChaos,
    coPresent,
    firedNpcChaos,
  };
}
