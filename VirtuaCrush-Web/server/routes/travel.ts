// Travel endpoint — moves the player (and their active companion) to a city
// location, triggering a fresh scene composition at the new venue.
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { getLocation, locationsForCharacter, AFFINITY_HOME_GATE } from '../inworld/locations';
import { setSceneLocation, getSituation } from '../db/state';
import { getAffinity } from '../db/affinity';
import { getCharacter, type CharacterId } from '../inworld/characters';
import { getOrComposeScene, renderSceneHeader } from '../db/scene_composition';
import { getWorldClock, setWorldClock } from '../db/world_sim';

const router = Router();

/**
 * POST /api/travel
 * Body: { characterId: string; locationSlug: string }
 *
 * Moves the player to locationSlug in the context of their conversation with
 * characterId. Returns the location metadata and a fresh scene header.
 *
 * Errors:
 *   400 invalid_request   — missing fields or unknown location slug
 *   403 affinity_too_low  — character home requires affinity ≥ 25
 *   404 not_found         — location not visible to this character
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { characterId, locationSlug } = req.body as {
    characterId?: string;
    locationSlug?: string;
  };

  if (!characterId || !locationSlug) {
    return res.status(400).json({ error: 'invalid_request' });
  }

  // Validate character exists.
  let displayName: string;
  try {
    displayName = getCharacter(characterId as CharacterId).displayName;
  } catch {
    return res.status(400).json({ error: 'invalid_request', detail: 'unknown character' });
  }

  // Validate location exists and is visible for this character.
  const loc = getLocation(locationSlug);
  if (!loc) {
    return res.status(400).json({ error: 'invalid_request', detail: 'unknown location' });
  }

  const visibleSlugs = new Set(locationsForCharacter(characterId).map((l) => l.slug));
  if (!visibleSlugs.has(locationSlug)) {
    return res.status(404).json({ error: 'not_found' });
  }

  // Affinity gate for character homes.
  if (loc.type === 'character_home' && loc.affinityRequired) {
    const affinity = await getAffinity(req.user!.id, characterId);
    if (affinity < loc.affinityRequired) {
      return res.status(403).json({
        error: 'affinity_too_low',
        required: loc.affinityRequired,
        current: affinity,
      });
    }
  }

  // "player_home" is stored as null in the DB (null = at home / remote).
  const dbSlug = locationSlug === 'player_home' ? null : locationSlug;

  // Persist the location change and invalidate the old scene composition.
  await setSceneLocation(req.user!.id, characterId, dbSlug);

  // Advance the world clock by travel time so the scene reflects elapsed time.
  const MINUTES_PER_TRAVEL = 20;
  try {
    const clock = await getWorldClock(req.user!.id);
    await setWorldClock(req.user!.id, clock.simMinutes + MINUTES_PER_TRAVEL);
  } catch (err) {
    console.warn('[travel] world clock advance failed (non-fatal):', err);
  }

  // Compose a fresh scene at the new location so the next chat prompt is
  // already authoritative. nowOverride offsets by travel time so the scene
  // header shows the time AFTER arrival, not the moment the user clicked.
  const travelNow = new Date(Date.now() + MINUTES_PER_TRAVEL * 60_000);
  let sceneHeader: string | undefined;
  try {
    const situation = await getSituation(req.user!.id, characterId);
    const comp = await getOrComposeScene(req.user!.id, characterId, displayName, situation, travelNow);
    if (comp) sceneHeader = renderSceneHeader(comp, displayName, characterId);
  } catch (err) {
    console.warn('[travel] scene recompose failed (non-fatal):', err);
  }

  return res.json({ location: loc, sceneHeader });
});

export default router;
