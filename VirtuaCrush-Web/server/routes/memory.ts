// REST endpoints for inspecting and managing a user's long-term memory facts.
// Useful for debugging RAG retrieval and for giving users control over what the
// characters remember. Writes (fact extraction) happen internally in the chat
// route; these endpoints are read + delete only.
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { listMemories, deleteMemory, clearMemories } from '../db/memory';

const router = Router();

// GET /api/memory — list every stored fact for the logged-in user (newest first)
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const memories = await listMemories(req.user!.id);
    res.json({ count: memories.length, memories });
  } catch (err) {
    console.error('[memory] list failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// DELETE /api/memory — clear ALL stored facts for the logged-in user
router.delete('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const deleted = await clearMemories(req.user!.id);
    res.json({ deleted });
  } catch (err) {
    console.error('[memory] clear failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// DELETE /api/memory/:id — delete a single fact (scoped to the logged-in user)
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  // ids are BIGSERIAL; reject anything that isn't a positive integer string.
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'invalid_id' });
  }
  try {
    const removed = await deleteMemory(req.user!.id, id);
    if (!removed) {
      return res.status(404).json({ error: 'not_found' });
    }
    res.json({ deleted: id });
  } catch (err) {
    console.error('[memory] delete failed:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
