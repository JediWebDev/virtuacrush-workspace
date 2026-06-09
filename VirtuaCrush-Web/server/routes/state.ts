// Story-engine state endpoint. Returns the character's current daily situation
// for the logged-in user (generating it lazily if it's a new day), used to
// render the "what they're doing right now" status strip above the chat.
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { getSituation } from '../db/state';
import { getNpcStates } from '../db/npc_state';
import { getDrives, initDrives } from '../sim/drives';
import { getLore } from '../inworld/lore';
import { getLocation } from '../inworld/scenes';
import { scenePhase } from '../db/scene_util';

const router = Router();

// GET /api/state/:characterId — current activity/mood/headline + goal progress
router.get('/:characterId', requireAuth, async (req: Request, res: Response) => {
  const { characterId } = req.params;
  try {
    const { state, scene } = await getSituation(req.user!.id, characterId);
    const npcStates = await getNpcStates(req.user!.id, [characterId]).catch(() => ({}));
    const discovered = Boolean((npcStates[characterId]?.knowledge as Record<string, unknown> | undefined)?.secretDiscovered);
    const lore = getLore(characterId);
    const k = (npcStates[characterId]?.knowledge ?? {}) as Record<string, unknown>;
    const driveDefs = getDrives(characterId);
    const driveVals = (k.drives as Record<string, number> | undefined) ?? initDrives(driveDefs);
    const drives = driveDefs.map((d) => ({ key: d.key, label: d.label, value: Math.round(driveVals[d.key] ?? d.baseline) }));
    const pendingEvent = (k.pendingDriveEvent as { drive: string; prompt: string; options: { id: string; label: string }[] } | null | undefined) ?? null;
    const phase = scenePhase(scene);
    const venueSlug = phase === 'on_date' ? scene.location : phase === 'planning' ? scene.plannedLocation : null;
    res.json({
      characterId,
      activity: state.activity,
      mood: state.mood,
      headline: state.headline,
      goalProgress: state.goalProgress,
      goal: lore.goal,
      secret: { label: lore.secret.label, discovered, reveal: discovered ? lore.secret.reveal : null },
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
