// Client API for the player profile + wardrobe. Mirrors the server sim shapes.
export type ItemCategory = 'top' | 'bottom' | 'outerwear' | 'dress' | 'shoes' | 'accessory' | 'other';
export interface InventoryItem { id: string; name: string; category: ItemCategory; styleTags: string[]; rarity?: string; ownership?: string }
export interface Appearance { age?: string; height?: string; build?: string; hair?: string; eyes?: string; features?: string }
export interface Biography { interests: string[]; hobbies: string[]; goals: string[]; fears: string[]; values: string[] }
export interface Grooming { hairstyle?: string; makeup?: string; fragrance?: string }
export interface OutfitPreset { name: string; wornItemIds: string[] }
export interface FullProfile {
  profile: { displayName: string; appearance: Appearance; biography: Biography };
  presentation: { wornItemIds: string[]; grooming: Grooming };
  inventory: InventoryItem[];
  presets: OutfitPreset[];
  avatarKey?: string | null;
}

async function asJson(res: Response) {
  if (!res.ok) throw new Error('http_' + res.status);
  return res.json();
}
const json = { 'Content-Type': 'application/json' };

export function fetchProfile(): Promise<FullProfile> {
  return fetch('/api/profile', { credentials: 'include' }).then(asJson);
}
export function saveProfile(payload: {
  displayName: string; appearance: Appearance; biography: Biography;
  grooming: Grooming; wornItemIds: string[]; presets: OutfitPreset[];
}): Promise<FullProfile> {
  return fetch('/api/profile', { method: 'PUT', credentials: 'include', headers: json, body: JSON.stringify(payload) }).then(asJson);
}
export function addItem(item: { name: string; category: ItemCategory; styleTags: string[]; rarity?: string }): Promise<{ item: InventoryItem }> {
  return fetch('/api/profile/items', { method: 'POST', credentials: 'include', headers: json, body: JSON.stringify(item) }).then(asJson);
}
export function deleteItem(id: string): Promise<{ ok: boolean }> {
  return fetch('/api/profile/items/' + encodeURIComponent(id), { method: 'DELETE', credentials: 'include' }).then(asJson);
}

export function deleteProfileAvatar(): Promise<{ ok: boolean }> {
  return fetch('/api/profile/avatar', { method: 'DELETE', credentials: 'include' }).then(asJson);
}
