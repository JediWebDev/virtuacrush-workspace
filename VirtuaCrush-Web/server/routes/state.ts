// Story-engine state endpoint. Returns the character's current situation for
// the logged-in user: mood, emotion gauges, secret progress, goal, scene.
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { getSituation } from '../db/state';
import { getNpcStates } from '../db/npc_state';
import { getAffinity } from '../db/affinity';
import { initEmotions, topEmotions, type EmotionState } from '../sim/emotions';
import { SECRET_REVEAL_AFFINITY } from '../sim/traits';
import { getLore } from '../inworld/lore';
import { getLocation } from '../inworld/scenes';
import { scenePhase } from '../db/scene_util';

const router = Router();

// GET /api/state/:characterId — current mood/emotions/secret/goal + scene
router.get('/:characterId', requireAuth, async (req: Request, res: Response) => {
  const { characterId } = req.params;
  try {
    const { state, scene } = await getSituation(req.user!.id, characterId);
    const npcStates = await getNpcStates(req.user!.id, [characterId]).catch(() => ({}));
    const lore = getLore(characterId);
    const k = (npcStates[characterId]?.knowledge ?? {}) as Record<string, unknown>;
    const discovered = Boolean(k.secretDiscovered);

    // Emotion gauges: top 3 active feelings (same response shape the old drive
    // meters used, so the client renders them unchanged).
    const emotions = (k.emotions as EmotionState | undefined) ?? initEmotions(characterId);
    const drives = topEmotions(emotions, 3);

    // Honest secret progress: affinity distance to the reveal threshold (the
    // reveal itself still needs trust + probing; capped at 99 until found).
    const affinity = await getAffinity(req.user!.id, characterId).catch(() => 0);
    const progress = discovered
      ? 100
      : Math.min(99, Math.round((affinity / SECRET_REVEAL_AFFINITY) * 100));

    const pendingEvent = (k.pendingDriveEvent as { drive: string; prompt: string; options: { id: string; label: string }[] } | null | undefined) ?? null;
    const phase = scenePhase(scene);
    const venueSlug = phase === 'on_date' ? scene.location : null;
    res.json({
      characterId,
      activity: state.activity,
      mood: state.mood,
      headline: state.headline,
      goalProgress: state.goalProgress,
      goal: lore.goal,
      secret: {
        label: lore.secret.label,
        discovered,
        reveal: discovered ? lore.secret.reveal : null,
        progress,
      },
      drives,
      pendingEvent,
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
