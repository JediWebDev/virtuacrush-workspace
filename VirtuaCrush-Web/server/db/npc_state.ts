// Per-user mutable NPC state. The chat path reads `relationship` (singular,
// player trust/love/resentment) via composeWorld and patches knowledge during play.
import { pool } from './pool';

export interface NpcStateRow {
  mood: string;
  location: string;
  currentOutfit: string[];
  relationship: { trust?: number; love?: number; resentment?: number; tags?: string[] };
  relationships: Record<string, { affinity?: number; trust?: number; love?: number; resentment?: number; tags?: string[] }>;
  needs: Record<string, number>;
  memories: { at: number; summary: string; weight: number }[];
  knowledge: Record<string, unknown>;
}

const asArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const asObj = (v: unknown): Record<string, any> => (v && typeof v === 'object' ? (v as Record<string, any>) : {});

export async function getNpcStates(userId: string, npcIds: string[]): Promise<Record<string, NpcStateRow>> {
  if (npcIds.length === 0) return {};
  const { rows } = await pool.query<{
    npc_id: string; mood: string; location: string; current_outfit: unknown;
    relationship: unknown; relationships: unknown; needs: unknown; memories: unknown; knowledge: unknown;
  }>(
    `SELECT npc_id, mood, location, current_outfit, relationship, relationships, needs, memories, knowledge
     FROM npc_state WHERE user_id = $1 AND npc_id = ANY($2)`,
    [userId, npcIds],
  );
  const out: Record<string, NpcStateRow> = {};
  for (const r of rows) {
    out[r.npc_id] = {
      mood: r.mood,
      location: r.location,
      currentOutfit: asArr(r.current_outfit),
      relationship: asObj(r.relationship),
      relationships: asObj(r.relationships),
      needs: asObj(r.needs),
      memories: Array.isArray(r.memories) ? (r.memories as NpcStateRow['memories']) : [],
      knowledge: asObj(r.knowledge),
    };
  }
  return out;
}

export interface NpcStatePatch {
  mood?: string;
  location?: string;
  currentOutfit?: string[];
  relationship?: NpcStateRow['relationship'];
  relationships?: NpcStateRow['relationships'];
  needs?: Record<string, number>;
  memories?: NpcStateRow['memories'];
  knowledge?: Record<string, unknown>;
}

export async function upsertNpcState(userId: string, npcId: string, patch: NpcStatePatch): Promise<void> {
  const j = (v: unknown) => (v === undefined ? null : JSON.stringify(v));
  await pool.query(
    `INSERT INTO npc_state (user_id, npc_id, mood, location, current_outfit, relationship, relationships, needs, memories, knowledge, updated_at)
     VALUES ($1, $2, COALESCE($3,'neutral'), COALESCE($4,'home'),
             COALESCE($5,'[]')::jsonb, COALESCE($6,'{}')::jsonb, COALESCE($7,'{}')::jsonb,
             COALESCE($8,'{}')::jsonb, COALESCE($9,'[]')::jsonb, COALESCE($10,'{}')::jsonb, NOW())
     ON CONFLICT (user_id, npc_id) DO UPDATE SET
       mood          = COALESCE($3, npc_state.mood),
       location      = COALESCE($4, npc_state.location),
       current_outfit= COALESCE($5::jsonb, npc_state.current_outfit),
       relationship  = COALESCE($6::jsonb, npc_state.relationship),
       relationships = COALESCE($7::jsonb, npc_state.relationships),
       needs         = COALESCE($8::jsonb, npc_state.needs),
       memories      = COALESCE($9::jsonb, npc_state.memories),
       knowledge     = COALESCE($10::jsonb, npc_state.knowledge),
       updated_at    = NOW()`,
    [
      userId, npcId,
      patch.mood ?? null,
      patch.location ?? null,
      patch.currentOutfit ? JSON.stringify(patch.currentOutfit) : null,
      j(patch.relationship),
      j(patch.relationships),
      j(patch.needs),
      j(patch.memories),
      j(patch.knowledge),
    ],
  );
}

