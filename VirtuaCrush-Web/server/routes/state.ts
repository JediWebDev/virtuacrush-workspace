// Story-engine state endpoint. Returns the character's current daily situation
// for the logged-in user (generating it lazily if it's a new day), used to
// render the "what they're doing right now" status strip above the chat.
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { getSituation, setSceneLocation, ensureCharacterStateRow } from '../db/state';
import { getLore } from '../inworld/lore';
import { getLocation, resolveSceneForLocation, travelDestinations } from '../inworld/locations';
import { getNpcStates } from '../db/npc_state';
import { getAffinity } from '../db/affinity';
import { getCompletedArcIds } from '../db/arc_state';
import { hasCompletedMeetArc } from '../inworld/meet_arc';
import { initEmotions, topEmotions, pendingEventFromEmotions, type EmotionState } from '../sim/emotions';
import { SECRET_REVEAL_AFFINITY, secretTrustProgress } from '../progression';
import { getCharacter } from '../inworld/characters';
import { ensureUserCharacterLoaded } from '../db/user_characters';

const router = Router();

// GET /api/state/:characterId — current activity/mood/headline + goal progress + drives + scene
router.get('/:characterId', requireAuth, async (req: Request, res: Response) => {
  const { characterId } = req.params;
  try {
    // Resolve a custom persona so daily-state generation doesn't throw on it.
    if (characterId.startsWith('user:')) {
      const ok = await ensureUserCharacterLoaded(characterId, req.user!.id);
      if (!ok) return res.status(404).json({ error: 'unknown_character' });
    }
    const [{ state, scene }, affinity, completedArcIds] = await Promise.all([
      getSituation(req.user!.id, characterId),
      getAffinity(req.user!.id, characterId),
      getCompletedArcIds(req.user!.id, characterId),
    ]);
    const lore = getLore(characterId);

    let displayName = characterId;
    try { displayName = getCharacter(characterId).displayName; } catch { /* keep id */ }

    const npcStateMap = await getNpcStates(req.user!.id, [characterId]);
    const knowledge = (npcStateMap[characterId]?.knowledge ?? {}) as Record<string, unknown>;
    const storedEmotions = (knowledge.emotions ?? {}) as Partial<EmotionState>;
    const emotions: EmotionState = { ...initEmotions(characterId), ...storedEmotions };

    const drives = topEmotions(emotions);
    const pendingEvent = pendingEventFromEmotions(emotions, characterId, displayName);

    const secretDiscovered = affinity >= SECRET_REVEAL_AFFINITY;
    const secretProgress = secretTrustProgress(affinity);

    const sceneInfo = resolveSceneForLocation(scene.location);

    res.json({
      characterId,
      activity: state.activity,
      mood: state.mood,
      headline: state.headline,
      goalProgress: state.goalProgress,
      goal: lore.goal,
      secret: lore.secret
        ? {
            label: lore.secret.label,
            discovered: secretDiscovered,
            reveal: secretDiscovered ? lore.secret.reveal : null,
            progress: secretProgress,
          }
        : undefined,
      drives,
      pendingEvent,
      sceneLocation: scene.location ?? null,
      sceneName: sceneInfo.name,
      sceneImage: sceneInfo.image,
      meetArcComplete: hasCompletedMeetArc(characterId, completedArcIds),
    });
  } catch (err) {
    console.error('[state] get failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/state/:characterId/locations — travel destinations + the current one.
router.get('/:characterId/locations', requireAuth, async (req: Request, res: Response) => {
  const { characterId } = req.params;
  try {
    const { scene } = await getSituation(req.user!.id, characterId);
    const locations = travelDestinations().map((l) => ({
      slug: l.slug,
      name: l.name,
      shortName: l.shortName,
      description: l.description,
      image: l.image ?? null,
    }));
    return res.json({ locations, current: scene.location ?? 'player_home' });
  } catch (err) {
    console.error('[state] locations failed:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/state/:characterId/travel { slug } — explicitly move the player to a
// venue. This drives the chat backdrop AND the director prompt's CURRENT SETTING
// (chat.ts reads scene_location each turn). 'player_home' is stored as null so it
// reuses the home baseline.
router.post('/:characterId/travel', requireAuth, async (req: Request, res: Response) => {
  const { characterId } = req.params;
  const slug = String((req.body ?? {}).slug ?? '').trim();
  try {
    const loc = getLocation(slug);
    if (!loc || (loc.type !== 'public' && loc.type !== 'player_home')) {
      return res.status(400).json({ error: 'invalid_location' });
    }
    await ensureCharacterStateRow(req.user!.id, characterId);
    // Home is the baseline (null); any public venue stores its slug.
    await setSceneLocation(req.user!.id, characterId, loc.type === 'player_home' ? null : loc.slug);
    const scene = resolveSceneForLocation(loc.type === 'player_home' ? null : loc.slug);
    return res.json({ ok: true, scene });
  } catch (err) {
    console.error('[state] travel failed:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
