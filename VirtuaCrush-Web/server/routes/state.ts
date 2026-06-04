// Story-engine state endpoint. Returns the character's current daily situation
// for the logged-in user (generating it lazily if it's a new day), used to
// render the "what they're doing right now" status strip above the chat.
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { getSituation } from '../db/state';
import { getLore } from '../inworld/lore';
import { getLocation } from '../inworld/scenes';
import { scenePhase } from '../db/scene_util';

const router = Router();

// GET /api/state/:characterId — current activity/mood/headline + goal progress
router.get('/:characterId', requireAuth, async (req: Request, res: Response) => {
  const { characterId } = req.params;
  try {
    const { state, scene } = await getSituation(req.user!.id, characterId);
    const phase = scenePhase(scene);
    const venueSlug = phase === 'on_date' ? scene.location : phase === 'planning' ? scene.plannedLocation : null;
    res.json({
      characterId,
      activity: state.activity,
      mood: state.mood,
      headline: state.headline,
      goalProgress: state.goalProgress,
      goal: getLore(characterId).goal,
      scene,
      phase,
      sceneLabel: getLocation(venueSlug)?.label ?? null,
    });
  } catch (err) {
    console.error('[state] get failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
