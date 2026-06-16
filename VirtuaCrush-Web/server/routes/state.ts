// Story-engine state endpoint. Returns the character's current daily situation
// for the logged-in user (generating it lazily if it's a new day), used to
// render the "what they're doing right now" status strip above the chat.
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { getSituation } from '../db/state';
import { getLore } from '../inworld/lore';
import { getNpcStates } from '../db/npc_state';
import { getAffinity } from '../db/affinity';
import { initEmotions, topEmotions, pendingEventFromEmotions, type EmotionState } from '../sim/emotions';
import { SECRET_REVEAL_AFFINITY } from '../sim/traits';
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
    const [{ state, scene }, affinity] = await Promise.all([
      getSituation(req.user!.id, characterId),
      getAffinity(req.user!.id, characterId),
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
    const secretProgress = Math.min(100, Math.round((affinity / SECRET_REVEAL_AFFINITY) * 100));

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
    });
  } catch (err) {
    console.error('[state] get failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
