// Player responds to a surfaced desire event (encourage / redirect / decline).
// Applies the choice to the drive meters + affinity, clears the pending event,
// and stashes a reaction directive for the character's next reply.
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { getNpcStates, upsertNpcState } from '../db/npc_state';
import { incrementAffinity } from '../db/affinity';
import { getCharacter } from '../inworld/characters';
import { getDrives, initDrives, applyChoice, type ChoiceKind } from '../sim/drives';

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
    const values = (k.drives as Record<string, number> | undefined) ?? initDrives(defs);
    let displayName = characterId;
    try { displayName = getCharacter(characterId).displayName; } catch { /* keep id */ }

    if (!def) {
      await upsertNpcState(req.user!.id, characterId, { knowledge: { ...k, pendingDriveEvent: null } });
      return res.json({ ok: true });
    }

    const outcome = applyChoice(values, def, choice, displayName);
    await upsertNpcState(req.user!.id, characterId, {
      knowledge: { ...k, drives: outcome.values, pendingDriveEvent: null, pendingDriveReaction: outcome.reaction },
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
