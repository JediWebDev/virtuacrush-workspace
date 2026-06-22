// Player progress, quest journal, and map data for the RPG HUD.
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { ensureUserCharacterLoaded } from '../db/user_characters';
import { loadPlayerProgressDetail } from '../db/player_progress';
import { readSceneSnapshot } from '../inworld/scene_snapshot';
import { getNpcStates } from '../db/npc_state';
import { getFullProfile } from '../db/profile';
import {
  mapLocationsForProgress,
  resolveAvailableActions,
  type PlayerAction,
} from '../sim/player_actions';

const router = Router();

export interface ProgressResponse {
  progress: Awaited<ReturnType<typeof loadPlayerProgressDetail>>;
  actions: PlayerAction[];
  mapLocations: ReturnType<typeof mapLocationsForProgress>;
  currentVenueSlug: string | null;
}

async function buildProgressPayload(userId: string, characterId: string): Promise<ProgressResponse> {
  const [progress, profile, npcMap] = await Promise.all([
    loadPlayerProgressDetail(userId, characterId),
    getFullProfile(userId),
    getNpcStates(userId, [characterId]),
  ]);
  const knowledge = (npcMap[characterId]?.knowledge ?? {}) as Record<string, unknown>;
  const snapshot = readSceneSnapshot(knowledge);
  const currentVenueSlug = snapshot?.venueSlug ?? null;

  let companionName = characterId;
  try {
    const { getCharacter } = await import('../inworld/characters');
    companionName = getCharacter(characterId).displayName;
  } catch {
    /* custom id */
  }

  const actions = resolveAvailableActions({
    snapshot,
    progress,
    inventory: profile.inventory,
    wornItemIds: profile.presentation.wornItemIds ?? [],
    companionName,
    characterId,
    currentVenueSlug,
  });

  return {
    progress,
    actions,
    mapLocations: mapLocationsForProgress(characterId, progress, currentVenueSlug),
    currentVenueSlug,
  };
}

// GET /api/progress/:characterId
router.get('/:characterId', requireAuth, async (req: Request, res: Response) => {
  const { characterId } = req.params;
  if (characterId.startsWith('user:')) {
    const ok = await ensureUserCharacterLoaded(characterId, req.user!.id);
    if (!ok) return res.status(404).json({ error: 'unknown_character' });
  }
  try {
    res.json(await buildProgressPayload(req.user!.id, characterId));
  } catch (err) {
    console.error('[progress] get failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export { buildProgressPayload };
export default router;
