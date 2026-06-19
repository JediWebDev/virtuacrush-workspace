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
    name: 'Your Place',
    shortName: 'Home',
    description: "the player's apartment — a comfortable, lived-in space",
    atmosphere: 'Home territory: familiar, low-key, comfortable. The player is in their own space.',
    type: 'player_home',
    mapX: 0.12,
    mapY: 0.78,
    zone: 'player',
  },

  // ── Public venues ───────────────────────────────────────────────────────────
  {
    slug: 'the_grind',
    name: 'The Grind Coffee Co.',
    shortName: 'Coffee Shop',
    description: 'a cozy independent coffee shop with exposed brick, mismatched furniture, and the smell of espresso',
    atmosphere:
      'Relaxed, slightly hipster. Jazz plays quietly. People work on laptops, have whispered meetings. Good for long conversations.',
    type: 'public',
    mapX: 0.18,
    mapY: 0.42,
    zone: 'arts',
  },
  {
    slug: 'palette_paper',
    name: 'Palette & Paper',
    shortName: 'Art Store',
    description: 'a well-stocked art supply shop with natural light, rows of paint, sketchbooks, and the faint smell of turpentine',
    atmosphere:
      'Quiet and focused. Artists browse methodically. Staff know regulars by name. Has a small gallery wall in the back.',
    type: 'public',
    mapX: 0.26,
    mapY: 0.54,
    zone: 'arts',
  },
  {
    slug: 'westside_commons',
    name: 'Westside Commons',
    shortName: 'Mall',
    description: 'a mid-size indoor mall — chain stores, food court, a few indie boutiques on the upper level',
    atmosphere:
      'Bright and busy. Background mall noise. Good for people-watching. The food court has surprisingly decent ramen.',
    type: 'public',
    mapX: 0.50,
    mapY: 0.35,
    zone: 'downtown',
  },
  {
    slug: 'ember_theater',
    name: 'Ember Theater',
    shortName: 'Theater',
    description: 'a renovated art-deco movie theater showing indie films and occasional live events',
    atmosphere:
      'Dramatic, a little old-fashioned. Dark velvet seats, real butter on the popcorn. Hushed reverence for the screen.',
    type: 'public',
    mapX: 0.60,
    mapY: 0.52,
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

/** All locations visible to a given character (includes that character's home). */
export function locationsForCharacter(characterId: string): CityLocation[] {
  return LOCATIONS.filter(
    (l) => l.type !== 'character_home' || l.characterId === characterId,
  );
}
