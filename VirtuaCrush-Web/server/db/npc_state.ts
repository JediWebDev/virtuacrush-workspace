// Persistence for per-user NPC state (relationship extras, knowledge, current
// outfit, mood, location). Static NPC identity is seeded in sim/roster.ts; this
// holds only what varies per player. Thin DB layer.
import { pool } from './pool';

export interface NpcStateRow {
  mood: string;
  location: string;
  currentOutfit: string[];
  relationship: { trust?: number; love?: number; resentment?: number; tags?: string[] };
  knowledge: Record<string, unknown>;
}

const asArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** Loads state for the given npc ids (missing ids simply absent from the map). */
export async function getNpcStates(userId: string, npcIds: string[]): Promise<Record<string, NpcStateRow>> {
  if (npcIds.length === 0) return {};
  const { rows } = await pool.query<{
    npc_id: string; mood: string; location: string; current_outfit: unknown; relationship: unknown; knowledge: unknown;
  }>(
    `SELECT npc_id, mood, location, current_outfit, relationship, knowledge
     FROM npc_state WHERE user_id = $1 AND npc_id = ANY($2)`,
    [userId, npcIds],
  );
  const out: Record<string, NpcStateRow> = {};
  for (const r of rows) {
    out[r.npc_id] = {
      mood: r.mood,
      location: r.location,
      currentOutfit: asArr(r.current_outfit),
      relationship: (r.relationship ?? {}) as NpcStateRow['relationship'],
      knowledge: (r.knowledge ?? {}) as Record<string, unknown>,
    };
  }
  return out;
}

export interface NpcStatePatch {
  mood?: string;
  location?: string;
  currentOutfit?: string[];
  relationship?: NpcStateRow['relationship'];
  knowledge?: Record<string, unknown>;
}

/** Upserts one NPC's per-user state, merging only the provided fields. */
export async function upsertNpcState(userId: string, npcId: string, patch: NpcStatePatch): Promise<void> {
  await pool.query(
    `INSERT INTO npc_state (user_id, npc_id, mood, location, current_outfit, relationship, knowledge, updated_at)
     VALUES ($1, $2, COALESCE($3,'neutral'), COALESCE($4,'home'), COALESCE($5,'[]')::jsonb, COALESCE($6,'{}')::jsonb, COALESCE($7,'{}')::jsonb, NOW())
     ON CONFLICT (user_id, npc_id) DO UPDATE SET
       mood           = COALESCE($3, npc_state.mood),
       location       = COALESCE($4, npc_state.location),
       current_outfit = COALESCE($5::jsonb, npc_state.current_outfit),
       relationship   = COALESCE($6::jsonb, npc_state.relationship),
       knowledge      = COALESCE($7::jsonb, npc_state.knowledge),
       updated_at     = NOW()`,
    [
      userId, npcId,
      patch.mood ?? null,
      patch.location ?? null,
      patch.currentOutfit ? JSON.stringify(patch.currentOutfit) : null,
      patch.relationship ? JSON.stringify(patch.relationship) : null,
      patch.knowledge ? JSON.stringify(patch.knowledge) : null,
    ],
  );
}
