// Persists engine-owned scene deltas (snapshot merge + venue slug travel).
import { setSceneLocation } from './state';
import {
  emptySceneSnapshot,
  mergeSceneSnapshot,
  snapshotToSceneState,
  type SceneSnapshot,
} from '../inworld/scene_snapshot';
import type { EngineSceneDelta } from '../sim/scene_delta';

export interface SceneApplyResult {
  snapshot: SceneSnapshot;
  sceneState: string;
}

/** Merges an engine delta into the prior snapshot; persists venue travel unless opts.persistVenue is false. */
export async function applyEngineSceneDelta(
  userId: string,
  characterId: string,
  prior: SceneSnapshot | null,
  delta: EngineSceneDelta | null,
  opts?: { persistVenue?: boolean },
): Promise<SceneApplyResult> {
  const base = prior ?? emptySceneSnapshot();
  if (!delta) {
    return { snapshot: base, sceneState: snapshotToSceneState(base) };
  }

  const patch: SceneSnapshotPatch = { ...delta.patch };
  if (delta.venueSlug !== undefined) patch.venueSlug = delta.venueSlug;
  const snapshot = mergeSceneSnapshot(base, patch, { narratorTexts: [] });

  if (opts?.persistVenue !== false && delta.venueSlug !== undefined) {
    await setSceneLocation(userId, characterId, delta.venueSlug);
  }

  return { snapshot, sceneState: snapshotToSceneState(snapshot) };
}
