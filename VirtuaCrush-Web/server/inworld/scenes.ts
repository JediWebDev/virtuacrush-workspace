// Catalog of date locations for the scene/dating loop. Drives both the prompt
// (so the character reacts to where they are) and the choice options.

export type LocationKind = 'paid' | 'outing' | 'home';

export interface SceneLocation {
  slug: string;
  label: string;       // short UI label
  kind: LocationKind;  // 'paid' venues can trigger a bill choice
  description: string;  // injected into the prompt ("at a cozy coffee shop")
  cues: string;        // sensory details for the model to reference
}

export const LOCATIONS: Record<string, SceneLocation> = {
  coffee_shop: {
    slug: 'coffee_shop',
    label: 'Coffee shop',
    kind: 'paid',
    description: 'at a cozy coffee shop',
    cues: 'the hiss of the espresso machine, warm mugs, low chatter, rain on the window',
  },
  restaurant: {
    slug: 'restaurant',
    label: 'Restaurant',
    kind: 'paid',
    description: 'at a restaurant over dinner',
    cues: 'candlelight, the clink of cutlery, the smell of the kitchen, a shared bottle of something',
  },
  movie_theater: {
    slug: 'movie_theater',
    label: 'Movie theater',
    kind: 'outing',
    description: 'at the movies together',
    cues: 'the dim theater, the smell of popcorn, trailers rolling, shoulders almost touching',
  },
  mall: {
    slug: 'mall',
    label: 'The mall',
    kind: 'outing',
    description: 'wandering the mall together',
    cues: 'bright storefronts, the food-court buzz, window shopping, an impulsive photo booth',
  },
  park: {
    slug: 'park',
    label: 'The park',
    kind: 'outing',
    description: 'walking through the park',
    cues: 'fresh air, rustling trees, a bench in the sun, ducks on the pond',
  },
  user_home: {
    slug: 'user_home',
    label: 'Your place',
    kind: 'home',
    description: "back at the user's place",
    cues: 'quiet, comfortable, just the two of you, the world shut outside',
  },
  character_home: {
    slug: 'character_home',
    label: 'Their place',
    kind: 'home',
    description: "at the character's own place",
    cues: 'their personal space, their things, an intimate kind of trust',
  },
};

/** Public date spots offered in "where should we go" choices. */
export const DATE_LOCATION_SLUGS = ['coffee_shop', 'restaurant', 'movie_theater', 'mall', 'park'];

export function getLocation(slug: string | null | undefined): SceneLocation | null {
  if (!slug) return null;
  return LOCATIONS[slug] ?? null;
}

export function isPaidLocation(slug: string | null | undefined): boolean {
  return getLocation(slug)?.kind === 'paid';
}

/** Coerces an arbitrary string to a known date-location slug (fallback coffee_shop). */
export function coerceDateLocation(slug: string | null | undefined): string {
  if (slug && DATE_LOCATION_SLUGS.includes(slug)) return slug;
  return 'coffee_shop';
}
