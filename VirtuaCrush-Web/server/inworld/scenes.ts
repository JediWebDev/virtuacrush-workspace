// Catalog of date locations for the scene system. Drives prompt injection
// (character reacts to where they are) and SceneAnchor references.
// `kind` is used to pick venue-detail flavour text in scene_registry.ts.

export type LocationKind = 'paid' | 'outing' | 'home';

export interface SceneLocation {
  slug: string;
  label: string;       // short UI label
  kind: LocationKind;  // drives VENUE_DETAILS flavour pool in scene_registry
  description: string; // injected into the prompt ("at a cozy coffee shop")
  cues: string;        // sensory details for the model to reference
  authority: string;   // who steps in if the user causes trouble here
}

export const LOCATIONS: Record<string, SceneLocation> = {
  coffee_shop: {
    slug: 'coffee_shop',
    label: 'Coffee shop',
    kind: 'paid',
    description: 'at a cozy coffee shop',
    cues: 'the hiss of the espresso machine, warm mugs, low chatter, rain on the window',
    authority: 'the café manager',
  },
  restaurant: {
    slug: 'restaurant',
    label: 'Restaurant',
    kind: 'paid',
    description: 'at a restaurant over dinner',
    cues: 'candlelight, the clink of cutlery, the smell of the kitchen, a shared bottle of something',
    authority: 'the restaurant manager',
  },
  movie_theater: {
    slug: 'movie_theater',
    label: 'Movie theater',
    kind: 'outing',
    description: 'at the movies together',
    cues: 'the dim theater, the smell of popcorn, trailers rolling, shoulders almost touching',
    authority: 'a theater usher',
  },
  mall: {
    slug: 'mall',
    label: 'The mall',
    kind: 'outing',
    description: 'wandering the mall together',
    cues: 'bright storefronts, the food-court buzz, window shopping, an impulsive photo booth',
    authority: 'a mall security guard',
  },
  park: {
    slug: 'park',
    label: 'The park',
    kind: 'outing',
    description: 'walking through the park',
    cues: 'fresh air, rustling trees, a bench in the sun, ducks on the pond',
    authority: 'a park ranger',
  },
  concert: {
    slug: 'concert',
    label: 'A concert',
    kind: 'paid',
    description: 'at a loud, packed concert',
    cues: 'stage lights, a wall of sound, the crowd pressing in, shouting to be heard over the band',
    authority: 'a concert bouncer',
  },
  golf_course: {
    slug: 'golf_course',
    label: 'The golf course',
    kind: 'paid',
    description: 'out on the golf course',
    cues: 'open green fairways, the thwack of a clean drive, a shared cart, sun and a light breeze',
    authority: 'the course marshal',
  },
  sports_game: {
    slug: 'sports_game',
    label: 'A sports game',
    kind: 'paid',
    description: 'at a live sports game',
    cues: 'the roar of the crowd, stadium lights, overpriced nachos, the wave rolling around the stands',
    authority: 'stadium security',
  },
  arcade: {
    slug: 'arcade',
    label: 'The arcade',
    kind: 'outing',
    description: 'at a neon arcade',
    cues: 'blinking cabinets, the clatter of tokens, an air-hockey grudge match, a wall of redemption tickets',
    authority: 'the arcade attendant',
  },
  amusement_park: {
    slug: 'amusement_park',
    label: 'An amusement park',
    kind: 'paid',
    description: 'at an amusement park',
    cues: 'roller-coaster screams, cotton candy, the ferris wheel turning, long but happy lines',
    authority: 'park security',
  },
  parking_garage: {
    slug: 'parking_garage',
    label: 'Parking garage',
    kind: 'outing',
    description: 'in a dim underground parking garage',
    cues: 'echoing footsteps on concrete, flickering fluorescent lights, tire squeals somewhere below, cold exhaust hanging in the air',
    authority: 'a grumpy security guard',
  },
  nightclub: {
    slug: 'nightclub',
    label: 'Nightclub',
    kind: 'paid',
    description: 'at a loud, neon-lit nightclub',
    cues: 'thumping bass through the floor, strobe lights cutting the dark, sticky floors, perfume and sweat and spilled drinks',
    authority: 'the bouncers at the door',
  },
  abandoned_building: {
    slug: 'abandoned_building',
    label: 'Abandoned building',
    kind: 'outing',
    description: 'inside a gritty, graffiti-covered abandoned building',
    cues: 'broken windows, spray-painted walls, dust motes in a shaft of moonlight, distant sirens, creaking metal and your own heartbeat',
    authority: 'a patrolling security guard',
  },
  highway: {
    slug: 'highway',
    label: 'Highway at night',
    kind: 'outing',
    description: 'speeding down an empty stretch of highway at night',
    cues: 'headlights carving the black road, wind through a cracked window, the needle climbing, city lights shrinking in the rearview',
    authority: 'highway patrol',
  },
  rooftop_park: {
    slug: 'rooftop_park',
    label: 'Rooftop park',
    kind: 'outing',
    description: 'on an urban rooftop park overlooking the skyline',
    cues: 'wind off the rooftops, string lights between planters, the whole city spread out below, a railing cold under your hands',
    authority: 'park security',
  },
  gym: {
    slug: 'gym',
    label: 'The gym',
    kind: 'paid',
    description: 'at the gym together',
    cues: 'clanking weights, mirrored walls, the hum of treadmills, chalk dust and effort',
    authority: 'the gym manager',
  },
  cemetery: {
    slug: 'cemetery',
    label: 'The cemetery',
    kind: 'outing',
    description: 'walking through the cemetery at night',
    cues: 'moonlight on headstones, rustling leaves, distant traffic muffled by iron gates, the quiet weight of old names',
    authority: 'a groundskeeper',
  },
  bar: {
    slug: 'bar',
    label: 'A dive bar',
    kind: 'paid',
    description: 'at a dim dive bar',
    cues: 'sticky booths, a jukebox in the corner, amber bar lights, laughter over clinking glasses, someone tuning a guitar on a small stage',
    authority: 'the bartender',
  },
  bookstore: {
    slug: 'bookstore',
    label: 'Bookstore',
    kind: 'outing',
    description: 'browsing a quiet bookstore together',
    cues: 'the smell of paper and ink, soft footsteps on worn carpet, shelves stacked to the ceiling, a corner chair by a rain-streaked window',
    authority: 'the shop owner',
  },
  user_home: {
    slug: 'user_home',
    label: 'Your place',
    kind: 'home',
    description: "back at the user's place",
    cues: 'quiet, comfortable, just the two of you, the world shut outside',
    authority: 'a concerned neighbor',
  },
  character_home: {
    slug: 'character_home',
    label: 'Their place',
    kind: 'home',
    description: "at the character's own place",
    cues: 'their personal space, their things, an intimate kind of trust',
    authority: 'a concerned neighbor',
  },
};

export function getLocation(slug: string | null | undefined): SceneLocation | null {
  if (!slug) return null;
  return LOCATIONS[slug] ?? null;
}
