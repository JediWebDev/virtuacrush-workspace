// Asset catalog for engine-owned scene presentation — maps venue slugs,
// rooms, and character ids to background keys and portrait keys.

import { getLocation } from '../inworld/locations';

export type VenueZone = 'player' | 'arts' | 'downtown' | 'residential_n' | 'residential_s';

/** CSS gradient backgrounds keyed by venue slug (and room overrides). */
export const VENUE_GRADIENTS: Record<string, string> = {
  player_home:
    'linear-gradient(165deg, #1e293b 0%, #334155 42%, #475569 100%)',
  'player_home:garage':
    'linear-gradient(165deg, #0f172a 0%, #1e293b 55%, #334155 100%)',
  'player_home:living_room':
    'linear-gradient(165deg, #292524 0%, #44403c 45%, #57534e 100%)',
  'player_home:kitchen':
    'linear-gradient(165deg, #3f2e22 0%, #57534e 50%, #78716c 100%)',
  'player_home:bedroom':
    'linear-gradient(165deg, #312e81 0%, #4338ca 40%, #6366f1 100%)',
  the_grind:
    'linear-gradient(165deg, #3b2314 0%, #78350f 45%, #a16207 100%)',
  palette_paper:
    'linear-gradient(165deg, #1e3a5f 0%, #2563eb 50%, #60a5fa 100%)',
  westside_commons:
    'linear-gradient(165deg, #134e4a 0%, #0f766e 45%, #14b8a6 100%)',
  ember_theater:
    'linear-gradient(165deg, #450a0a 0%, #7f1d1d 45%, #b91c1c 100%)',
  remote:
    'linear-gradient(165deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)',
};

export const ZONE_GRADIENTS: Record<VenueZone, string> = {
  player: VENUE_GRADIENTS.player_home,
  arts: VENUE_GRADIENTS.ember_theater,
  downtown: VENUE_GRADIENTS.westside_commons,
  residential_n: 'linear-gradient(165deg, #1f2937 0%, #374151 50%, #4b5563 100%)',
  residential_s: 'linear-gradient(165deg, #1c1917 0%, #292524 50%, #44403c 100%)',
};

/** Optional R2 background art keys (client falls back to gradient when missing). */
export const VENUE_BACKGROUND_KEYS: Record<string, string> = {
  the_grind: 'scenes/the_grind.jpg',
  westside_commons: 'scenes/westside_commons.jpg',
  ember_theater: 'scenes/ember_theater.jpg',
};

/** Built-in companion portrait asset keys (under /api/assets/). */
export const CHARACTER_PORTRAIT_KEYS: Record<string, string> = {
  mina: 'characters/Mina_Character.png',
  becca: 'characters/Becca_Character.png',
  madison: 'characters/Madison_Character.png',
  jordan: 'characters/Jordan_Character.jpg',
  lexi: 'characters/Lexi_Character.png',
  riot: 'characters/Riot_Character.jpg',
  serena: 'characters/Serena_Character.png',
  lin: 'characters/Lin_Character.png',
  iris: 'characters/Iris_Character.jpg',
  ash: 'characters/Ash_Character.jpg',
  bohdi: 'characters/Bohdi_Character.jpg',
};

export function portraitKeyForCharacter(characterId: string, customImageKey?: string | null): string | null {
  if (customImageKey?.trim()) return customImageKey.trim();
  const base = characterId.startsWith('user:') ? null : characterId.toLowerCase();
  return base ? CHARACTER_PORTRAIT_KEYS[base] ?? null : null;
}

export function backgroundForVenue(venueSlug: string | null, roomId: string | null): {
  backgroundId: string;
  backgroundKey: string | null;
  backgroundGradient: string;
} {
  if (!venueSlug) {
    return {
      backgroundId: 'remote',
      backgroundKey: null,
      backgroundGradient: VENUE_GRADIENTS.remote,
    };
  }

  const roomKey = roomId ? `${venueSlug}:${roomId}` : null;
  const gradient =
    (roomKey && VENUE_GRADIENTS[roomKey]) ||
    VENUE_GRADIENTS[venueSlug] ||
    ZONE_GRADIENTS[getLocation(venueSlug)?.zone ?? 'downtown'];

  return {
    backgroundId: roomKey ?? venueSlug,
    backgroundKey: VENUE_BACKGROUND_KEYS[venueSlug] ?? null,
    backgroundGradient: gradient,
  };
}
