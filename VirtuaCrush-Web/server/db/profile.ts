// Persistence for the player as a first-class entity. Shapes reuse the locked sim
// schema (server/sim/world.ts). Owned items live in inventory_items rows; what's
// worn lives in the profile (presentation) — owned vs wearing stay separate.
import { randomUUID } from 'node:crypto';
import { pool } from './pool';
import type {
  PlayerProfile, PresentationState, InventoryItem, OutfitPreset, ItemCategory, Biography,
} from '../sim/world';
import { emptyProfile } from '../sim/player';

export interface FullProfile {
  profile: PlayerProfile;
  presentation: PresentationState;
  inventory: InventoryItem[];
  presets: OutfitPreset[];
  avatarKey: string | null;
}

const ITEM_CATEGORIES = new Set<ItemCategory>(['top', 'bottom', 'outerwear', 'dress', 'shoes', 'accessory', 'other']);
const asArr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);

function normalizeBiography(b: unknown): Biography {
  const o = (b ?? {}) as Record<string, unknown>;
  return {
    interests: asArr(o.interests), hobbies: asArr(o.hobbies), goals: asArr(o.goals),
    fears: asArr(o.fears), values: asArr(o.values),
  };
}

async function listItems(userId: string): Promise<InventoryItem[]> {
  const { rows } = await pool.query<{ id: string; name: string; category: string; rarity: string | null; style_tags: unknown }>(
    `SELECT id, name, category, rarity, style_tags FROM inventory_items
     WHERE owner_type = 'player' AND owner_id = $1 ORDER BY created_at ASC`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: (ITEM_CATEGORIES.has(r.category as ItemCategory) ? r.category : 'other') as ItemCategory,
    styleTags: asArr(r.style_tags),
    rarity: r.rarity ?? undefined,
    ownership: 'player',
  }));
}

export async function getFullProfile(userId: string): Promise<FullProfile> {
  const { rows } = await pool.query<{
    display_name: string; appearance: unknown; biography: unknown; grooming: unknown;
    worn_item_ids: unknown; presets: unknown; avatar_key: string | null;
  }>(`SELECT display_name, appearance, biography, grooming, worn_item_ids, presets, avatar_key
      FROM player_profiles WHERE user_id = $1`, [userId]);
  const inventory = await listItems(userId);

  if (!rows[0]) {
    return { profile: emptyProfile(''), presentation: { wornItemIds: [], grooming: {} }, inventory, presets: [], avatarKey: null };
  }
  const r = rows[0];
  const presets = Array.isArray(r.presets)
    ? (r.presets as unknown[]).map((p) => {
        const o = (p ?? {}) as Record<string, unknown>;
        return { name: String(o.name ?? ''), wornItemIds: asArr(o.wornItemIds) };
      }).filter((p) => p.name)
    : [];
  return {
    profile: {
      displayName: r.display_name ?? '',
      appearance: (r.appearance ?? {}) as PlayerProfile['appearance'],
      biography: normalizeBiography(r.biography),
    },
    presentation: { wornItemIds: asArr(r.worn_item_ids), grooming: (r.grooming ?? {}) as PresentationState['grooming'] },
    inventory,
    presets,
    avatarKey: r.avatar_key ?? null,
  };
}

export interface ProfileUpdate {
  displayName?: string;
  appearance?: PlayerProfile['appearance'];
  biography?: Biography;
  grooming?: PresentationState['grooming'];
  wornItemIds?: string[];
  presets?: OutfitPreset[];
}

export async function upsertProfile(userId: string, u: ProfileUpdate): Promise<void> {
  await pool.query(
    `INSERT INTO player_profiles (user_id, display_name, appearance, biography, grooming, worn_item_ids, presets, updated_at)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       display_name  = EXCLUDED.display_name,
       appearance    = EXCLUDED.appearance,
       biography     = EXCLUDED.biography,
       grooming      = EXCLUDED.grooming,
       worn_item_ids = EXCLUDED.worn_item_ids,
       presets       = EXCLUDED.presets,
       updated_at    = NOW()`,
    [
      userId,
      u.displayName ?? '',
      JSON.stringify(u.appearance ?? {}),
      JSON.stringify(normalizeBiography(u.biography)),
      JSON.stringify(u.grooming ?? {}),
      JSON.stringify(asArr(u.wornItemIds)),
      JSON.stringify(Array.isArray(u.presets) ? u.presets : []),
    ],
  );
}

export async function addItem(
  userId: string,
  item: { name: string; category?: string; styleTags?: string[]; rarity?: string },
): Promise<InventoryItem> {
  const id = randomUUID();
  const category = (item.category && ITEM_CATEGORIES.has(item.category as ItemCategory) ? item.category : 'other') as ItemCategory;
  const styleTags = asArr(item.styleTags);
  await pool.query(
    `INSERT INTO inventory_items (id, owner_id, owner_type, name, category, rarity, style_tags)
     VALUES ($1, $2, 'player', $3, $4, $5, $6::jsonb)`,
    [id, userId, item.name.slice(0, 80), category, item.rarity ?? null, JSON.stringify(styleTags)],
  );
  return { id, name: item.name.slice(0, 80), category, styleTags, rarity: item.rarity ?? undefined, ownership: 'player' };
}

export async function deleteItem(userId: string, id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM inventory_items WHERE id = $1 AND owner_type = 'player' AND owner_id = $2`,
    [id, userId],
  );
  return (rowCount ?? 0) > 0;
}

export async function setAvatarKey(userId: string, avatarKey: string | null): Promise<void> {
  await pool.query(
    `INSERT INTO player_profiles (user_id, avatar_key, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET avatar_key = EXCLUDED.avatar_key, updated_at = NOW()`,
    [userId, avatarKey],
  );
}
