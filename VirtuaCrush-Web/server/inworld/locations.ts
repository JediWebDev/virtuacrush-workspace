// City location registry — all places the player can travel to.
// These are the authoritative, hardcoded venues the LLM must treat as fixed.
// Character homes are gated behind an affinity threshold.

export type LocationType = 'player_home' | 'public' | 'character_home';

export interface CityLocation {
  /** URL-safe slug used in DB and API. */
  slug: string;
  /** Display name shown in UI. */
  name: string;
  /** Short label for map pins. */
  shortName: string;
  /** One-line description injected into the LLM prompt. */
  description: string;
  /** Longer atmosphere note for richer scene context. */
  atmosphere: string;
  type: LocationType;
  /** R2 object key for this venue's backdrop image (served via /api/assets). */
  image?: string;
  /** Only set for character_home locations. */
  characterId?: string;
  /** Minimum affinity required to visit (character homes only). */
  affinityRequired?: number;
  /** Map pin position as fraction of viewBox (0–1). */
  mapX: number;
  mapY: number;
  /** Visual zone for map rendering. */
  zone: 'player' | 'arts' | 'downtown' | 'residential_n' | 'residential_s';
}

export const AFFINITY_HOME_GATE = 35;

export const LOCATIONS: CityLocation[] = [
  // ── Player home ────────────────────────────────────────────────────────────
  {
    slug: 'player_home',
    name: 'Your Apartment',
    shortName: 'Home',
    description: "the player's apartment — a comfortable, lived-in space",
    atmosphere: 'Home territory: familiar, low-key, comfortable. The player is in their own space.',
    type: 'player_home',
    image: 'scenes/Users_Apartment.png',
    mapX: 0.12,
    mapY: 0.78,
    zone: 'player',
  },

  // ── Public venues (each backed by a scene backdrop image) ───────────────────
  {
    slug: 'cafe',
    name: 'The Grind Café',
    shortName: 'Café',
    description: 'a cozy independent café with exposed brick, mismatched furniture, and the smell of espresso',
    atmosphere:
      'Relaxed, slightly hipster. Jazz plays quietly. People work on laptops and have whispered meetings. Good for long conversations.',
    type: 'public',
    image: 'scenes/cafe.png',
    mapX: 0.18,
    mapY: 0.42,
    zone: 'arts',
  },
  {
    slug: 'bookstore',
    name: 'Chapter & Verse',
    shortName: 'Bookstore',
    description: 'a quiet independent bookstore — shelves to the ceiling, a reading nook, the smell of paper and old wood',
    atmosphere:
      'Hushed and unhurried. Soft footsteps on worn carpet, a corner chair by a rain-streaked window. Good for slow, thoughtful talk.',
    type: 'public',
    image: 'scenes/bookstore.png',
    mapX: 0.26,
    mapY: 0.52,
    zone: 'arts',
  },
  {
    slug: 'comic_book_store',
    name: 'Splash Page Comics',
    shortName: 'Comic Store',
    description: 'a packed comic book shop — long boxes, wall of new releases, figurines and posters everywhere',
    atmosphere:
      'Playful and a little nerdy. Bright fluorescent light, fans debating storylines, the rustle of bagged-and-boarded issues.',
    type: 'public',
    image: 'scenes/comic_book_store.png',
    mapX: 0.44,
    mapY: 0.40,
    zone: 'downtown',
  },
  {
    slug: 'mall',
    name: 'Westside Mall',
    shortName: 'Mall',
    description: 'a mid-size indoor mall — chain stores, a food court, a few indie boutiques on the upper level',
    atmosphere:
      'Bright and busy. Background mall noise, good for people-watching. The food court has surprisingly decent ramen.',
    type: 'public',
    image: 'scenes/mall.png',
    mapX: 0.54,
    mapY: 0.34,
    zone: 'downtown',
  },
  {
    slug: 'restaurant',
    name: 'Lumière Bistro',
    shortName: 'Restaurant',
    description: 'a warm sit-down restaurant — candlelit tables, white linen, the clink of cutlery and a shared bottle of wine',
    atmosphere:
      'Intimate and a little romantic. Low lighting, the smell of the kitchen, the comfortable hum of other diners.',
    type: 'public',
    image: 'scenes/restaurant.png',
    mapX: 0.62,
    mapY: 0.50,
    zone: 'downtown',
  },
  {
    slug: 'beach',
    name: 'Cove Beach',
    shortName: 'Beach',
    description: 'a stretch of sandy coastline — rolling surf, a boardwalk behind, gulls overhead',
    atmosphere:
      'Open and easy. Salt air, the wash of waves, warm sand underfoot, the whole horizon to yourselves.',
    type: 'public',
    image: 'scenes/beach.png',
    mapX: 0.40,
    mapY: 0.14,
    zone: 'downtown',
  },
  {
    slug: 'jail',
    name: 'County Holding',
    shortName: 'Jail',
    description: 'a county holding cell — concrete, steel bars, a hard bench and a buzzing overhead light',
    atmosphere:
      'Tense and cold. Echoing footsteps down the corridor, the clang of a far door, fluorescent glare and very little privacy.',
    type: 'public',
    image: 'scenes/Jail.png',
    mapX: 0.58,
    mapY: 0.66,
    zone: 'downtown',
  },

  // ── Character homes (affinity ≥ 25) ────────────────────────────────────────
  {
    slug: 'mina_apt',
    name: "Mina's Apartment",
    shortName: "Mina's",
    description: "Mina's apartment — warm lighting, art prints everywhere, faint sound of lo-fi music",
    atmosphere: 'Inviting and creative. Books stacked on every surface. Always smells like whatever she just cooked.',
    type: 'character_home',
    characterId: 'mina',
    affinityRequired: AFFINITY_HOME_GATE,
    mapX: 0.76,
    mapY: 0.18,
    zone: 'residential_n',
  },
  {
    slug: 'lin_studio',
    name: "Lin's Studio",
    shortName: "Lin's",
    description: "Lin's live-work studio loft — minimalist, clean lines, a drafting table and professional camera gear",
    atmosphere:
      'Precise and considered. Every object placed intentionally. Natural light from tall windows. Quiet except for ambient city noise.',
    type: 'character_home',
    characterId: 'lin',
    affinityRequired: AFFINITY_HOME_GATE,
    mapX: 0.84,
    mapY: 0.28,
    zone: 'residential_n',
  },
  {
    slug: 'jordan_apt',
    name: "Jordan's Apartment",
    shortName: "Jordan's",
    description: "Jordan's apartment — lived-in and unpretentious, gaming setup in the corner, good snacks always available",
    atmosphere: 'Comfortable and genuine. No performance here. The couch is extremely good.',
    type: 'character_home',
    characterId: 'jordan',
    affinityRequired: AFFINITY_HOME_GATE,
    mapX: 0.76,
    mapY: 0.38,
    zone: 'residential_n',
  },
  {
    slug: 'riot_place',
    name: "Riot's Place",
    shortName: "Riot's",
    description: "Riot's apartment — loud band posters, guitar gear in every corner, perpetually chaotic but somehow functional",
    atmosphere:
      'High energy even when quiet. Always sounds like something\'s about to happen. The mess has its own system.',
    type: 'character_home',
    characterId: 'riot',
    affinityRequired: AFFINITY_HOME_GATE,
    mapX: 0.84,
    mapY: 0.48,
    zone: 'residential_n',
  },
  {
    slug: 'becca_place',
    name: "Becca's Place",
    shortName: "Becca's",
    description: "Becca's apartment — cheerful, meticulously decorated, plants on every windowsill",
    atmosphere: 'Warm and social. Feels like somewhere people gather. She always has something baked.',
    type: 'character_home',
    characterId: 'becca',
    affinityRequired: AFFINITY_HOME_GATE,
    mapX: 0.72,
    mapY: 0.58,
    zone: 'residential_s',
  },
  {
    slug: 'madison_condo',
    name: "Madison's Condo",
    shortName: "Madison's",
    description: "Madison's high-floor condo — polished, modern, city view, everything tastefully expensive",
    atmosphere:
      'Sleek and controlled. The view is genuinely stunning. She keeps it cold.',
    type: 'character_home',
    characterId: 'madison',
    affinityRequired: AFFINITY_HOME_GATE,
    mapX: 0.80,
    mapY: 0.62,
    zone: 'residential_s',
  },
  {
    slug: 'serena_studio',
    name: "Serena's Studio",
    shortName: "Serena's",
    description: "Serena's studio apartment — small, every inch used cleverly, art supplies sharing space with a professional easel",
    atmosphere:
      'Creative and a little cluttered. Works-in-progress on the walls. Strong tea, always.',
    type: 'character_home',
    characterId: 'serena',
    affinityRequired: AFFINITY_HOME_GATE,
    mapX: 0.74,
    mapY: 0.74,
    zone: 'residential_s',
  },
  {
    slug: 'lexi_apt',
    name: "Lexi's Apartment",
    shortName: "Lexi's",
    description: "Lexi's apartment — deliberately hard to find, leather jacket always on a hook, tools and odds-and-ends collection",
    atmosphere:
      'Lived-in, private, guarded. Not many people get invited here. That matters.',
    type: 'character_home',
    characterId: 'lexi',
    affinityRequired: AFFINITY_HOME_GATE,
    mapX: 0.84,
    mapY: 0.72,
    zone: 'residential_s',
  },
  {
    slug: 'iris_home',
    name: "Iris's Home",
    shortName: "Iris's",
    description: "Iris's house — older neighborhood, garden out back, bookshelves that go floor to ceiling in every room",
    atmosphere:
      'Quiet and intellectually heavy. The kind of place where good conversations happen over tea for three hours.',
    type: 'character_home',
    characterId: 'iris',
    affinityRequired: AFFINITY_HOME_GATE,
    mapX: 0.72,
    mapY: 0.86,
    zone: 'residential_s',
  },
  {
    slug: 'ash_residence',
    name: "Ash's Residence",
    shortName: "Ash's",
    description: "Ash's residence — old building, high ceilings, sparse and dim, wall of floor-to-ceiling bookshelves",
    atmosphere:
      'Unsettling in a beautiful way. Very quiet. The shadows feel intentional. Centuries of presence saturate the walls.',
    type: 'character_home',
    characterId: 'ash',
    affinityRequired: AFFINITY_HOME_GATE,
    mapX: 0.84,
    mapY: 0.88,
    zone: 'residential_s',
  },
];

/** Look up a location by slug. Returns null for unknown slugs. */
export function getLocation(slug: string): CityLocation | null {
  return LOCATIONS.find((l) => l.slug === slug) ?? null;
}

const VENUE_KEYWORD_ALIASES: Record<string, string> = {
  mall: 'mall',
  cafe: 'cafe',
  café: 'cafe',
  coffee: 'cafe',
  'coffee shop': 'cafe',
  bookstore: 'bookstore',
  'book store': 'bookstore',
  books: 'bookstore',
  library: 'bookstore',
  comic: 'comic_book_store',
  comics: 'comic_book_store',
  'comic book': 'comic_book_store',
  'comic book store': 'comic_book_store',
  'comic store': 'comic_book_store',
  restaurant: 'restaurant',
  dinner: 'restaurant',
  dining: 'restaurant',
  bistro: 'restaurant',
  beach: 'beach',
  boardwalk: 'beach',
  shore: 'beach',
  ocean: 'beach',
  jail: 'jail',
  prison: 'jail',
  'holding cell': 'jail',
  'police station': 'jail',
  home: 'player_home',
};

function normVenueText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Fuzzy-match free text or an intent target to a registry slug.
 * Returns null when no known venue matches (caller may still set free-text location).
 */
export function resolveVenueSlug(text: string): string | null {
  const raw = (text ?? '').trim();
  if (!raw) return null;

  const norm = normVenueText(raw);
  if (!norm) return null;

  if (norm === 'player_home' || norm === 'your place' || norm === 'my place' || norm === 'home') {
    return 'player_home';
  }

  const exact = getLocation(raw);
  if (exact) return exact.slug;

  for (const loc of LOCATIONS) {
    const slugSpaced = loc.slug.replace(/_/g, ' ');
    if (norm === loc.slug || norm === slugSpaced) return loc.slug;
    if (norm.includes(loc.slug) || norm.includes(slugSpaced)) return loc.slug;
    if (norm.includes(normVenueText(loc.name))) return loc.slug;
    if (norm.includes(normVenueText(loc.shortName))) return loc.slug;
  }

  for (const [keyword, slug] of Object.entries(VENUE_KEYWORD_ALIASES)) {
    if (norm.includes(keyword)) return slug;
  }

  return null;
}

/** All locations visible to a given character (includes that character's home). */
export function locationsForCharacter(characterId: string): CityLocation[] {
  return LOCATIONS.filter(
    (l) => l.type !== 'character_home' || l.characterId === characterId,
  );
}

// ── Scene backdrops ──────────────────────────────────────────────────────────
// The player's location drives a backdrop image at the top of the chat. A null
// location (remote/home baseline) resolves to the apartment.

const PLAYER_HOME_SLUG = 'player_home';
/** Fallback backdrop when a location has no image or is unknown. */
export const DEFAULT_SCENE_IMAGE = 'scenes/Users_Apartment.png';

export interface ResolvedScene {
  slug: string;
  name: string;
  shortName: string;
  /** R2 object key (serve via /api/assets/<image>). */
  image: string;
}

/** Resolve the backdrop scene for a (possibly null) location slug. */
export function resolveSceneForLocation(slug: string | null | undefined): ResolvedScene {
  const loc = (slug ? getLocation(slug) : null) ?? getLocation(PLAYER_HOME_SLUG);
  if (!loc) {
    return { slug: PLAYER_HOME_SLUG, name: 'Your Apartment', shortName: 'Home', image: DEFAULT_SCENE_IMAGE };
  }
  return { slug: loc.slug, name: loc.name, shortName: loc.shortName, image: loc.image ?? DEFAULT_SCENE_IMAGE };
}

/** Locations the player can explicitly travel to (apartment + public venues). */
export function travelDestinations(): CityLocation[] {
  return LOCATIONS.filter((l) => l.type === 'player_home' || l.type === 'public');
}
