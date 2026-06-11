// Player responds to a surfaced desire event (encourage / redirect / decline).
// Applies the choice to the EMOTION gauges + affinity, clears the pending
// event, and stashes a reaction directive for the character's next reply.
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { getNpcStates, upsertNpcState } from '../db/npc_state';
import { incrementAffinity } from '../db/affinity';
import { getCharacter } from '../inworld/characters';
import { getDrives, applyChoice, type ChoiceKind } from '../sim/drives';
import { initEmotions, emotionKeyForDrive, type EmotionState } from '../sim/emotions';

const router = Router();
const KINDS: ChoiceKind[] = ['encourage', 'redirect', 'decline'];

router.post('/:characterId/respond', requireAuth, async (req: Request, res: Response) => {
  const { characterId } = req.params;
  const choice = String((req.body ?? {}).choice) as ChoiceKind;
  if (!KINDS.includes(choice)) return res.status(400).json({ error: 'bad_choice' });

  try {
    const states = await getNpcStates(req.user!.id, [characterId]);
    const k = (states[characterId]?.knowledge ?? {}) as Record<string, unknown>;
    const pending = k.pendingDriveEvent as { drive: string } | null | undefined;
    if (!pending) return res.status(409).json({ error: 'no_pending_event' });

    const defs = getDrives(characterId);
    const def = defs.find((d) => d.key === pending.drive);
    let displayName = characterId;
    try { displayName = getCharacter(characterId).displayName; } catch { /* keep id */ }

    if (!def) {
      await upsertNpcState(req.user!.id, characterId, { knowledge: { ...k, pendingDriveEvent: null } });
      return res.json({ ok: true });
    }

    // The card copy/reaction logic lives in drives.applyChoice; the meter it
    // moves is now the corresponding EMOTION (desire -> aroused, etc.).
    const emotions: EmotionState = { ...initEmotions(characterId), ...((k.emotions as EmotionState | undefined) ?? {}) };
    const emoKey = emotionKeyForDrive(def.key);
    const outcome = applyChoice({ [def.key]: emotions[emoKey] }, def, choice, displayName);
    emotions[emoKey] = outcome.values[def.key];

    await upsertNpcState(req.user!.id, characterId, {
      knowledge: {
        ...k,
        emotions,
        emotionsUpdatedAt: new Date().toISOString(),
        pendingDriveEvent: null,
        pendingDriveReaction: outcome.reaction,
      },
    });
    const affinity = outcome.affinityDelta !== 0
      ? await incrementAffinity(req.user!.id, characterId, outcome.affinityDelta)
      : undefined;

    res.json({ ok: true, affinity, moodHint: outcome.moodHint });
  } catch (err) {
    console.error('[desire] respond failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
