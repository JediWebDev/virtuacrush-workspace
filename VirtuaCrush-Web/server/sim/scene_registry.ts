// Authored data the scene composer samples from. This is the "you author the
// value space, the engine samples it" layer: prop lists, mutable details,
// outfit pools by archetype, weather, and each companion's canonical best
// friend (name + role + agendas). Pure data + tiny pure helpers.

// --- Seeded RNG (deterministic compositions) ----------------------------------

/** mulberry32 — small, fast, deterministic. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash for seeding (FNV-1a). */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const pickFrom = <T>(arr: readonly T[], r: () => number): T =>
  arr[Math.floor(r() * arr.length)];

/** Picks n distinct entries (order randomized). */
export function pickSome<T>(arr: readonly T[], n: number, r: () => number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length > 0) {
    out.push(copy.splice(Math.floor(r() * copy.length), 1)[0]);
  }
  return out;
}

// --- Weather -------------------------------------------------------------------

export const WEATHER_POOL = [
  'clear skies',
  'clear skies', // weighted: clear is most common
  'overcast and gray',
  'light rain against the windows',
  'a steady downpour outside',
  'windy, leaves skittering past',
  'muggy and warm',
  'crisp and cool out',
] as const;

// --- Her place: fixed props + mutable details -----------------------------------

// Persistent furniture (stable across visits — sampled once per composition for
// mention, but drawn from the same fixed list so the room never "remodels").
export const HOME_PROPS = [
  'the couch',
  'the coffee table',
  'the TV on its stand',
  'the bookshelf',
  'string lights over the window',
  'the kitchen counter',
  'her desk in the corner',
] as const;

// Mutable slots — the things that change between visits and make the room feel
// lived-in. One or two per composition.
export const HOME_DETAILS = [
  'two empty mugs on the coffee table',
  'a blanket half off the couch',
  'laundry folded in a basket nobody has put away',
  'a candle burning low on the counter',
  'a half-dead plant she keeps forgetting to water',
  'some cooking show muted on the TV',
  'a paused game on the TV',
  'snack wrappers she has not cleaned up yet',
  'a window cracked open',
  'music playing low from a speaker',
  'her bag dumped by the door',
  'nail polish and cotton pads spread on the table',
] as const;

// Mutable details for venues, by kind (venue identity itself comes from the
// existing location registry's description/cues).
export const VENUE_DETAILS: Record<string, readonly string[]> = {
  paid: [
    'the place is about half full',
    'it is busier than expected tonight',
    'you got the corner spot',
    'a server who clearly wants to be elsewhere',
    'someone celebrating a birthday two tables over',
  ],
  outing: [
    'a decent crowd, but room to breathe',
    'quieter than usual for this hour',
    'golden light, the good kind',
    'a couple arguing quietly somewhere behind you',
    'a dog that keeps looking at you two',
  ],
  home: [
    'shoes off at the door',
    'it is warmer in here than outside',
    'the good blanket is already out',
  ],
};

// --- Outfits by archetype + context ---------------------------------------------

export type OutfitContext = 'sleep' | 'home_day' | 'home_evening' | 'date_casual' | 'date_out';
export type StyleArchetype =
  | 'cozy_casual'
  | 'girly_glam'
  | 'sporty'
  | 'alt_edgy'
  | 'polished_chic'
  | 'preppy_classic'
  | 'rugged_casual';

export const OUTFITS: Record<StyleArchetype, Record<OutfitContext, readonly string[]>> = {
  cozy_casual: {
    sleep: ['an oversized tee and shorts, hair a mess', 'a worn hoodie over pajama pants'],
    home_day: ['leggings and a soft cardigan, hair clipped up', 'jeans and a baggy sweater, fuzzy socks'],
    home_evening: ['an oversized hoodie and shorts, hair up', 'sweats and a tank top, blanket within reach'],
    date_casual: ['high-waisted jeans, a tucked tee, and white sneakers', 'a sundress with a denim jacket'],
    date_out: ['a soft knit dress and ankle boots', 'dark jeans, a silky top, and a little gold jewelry'],
  },
  girly_glam: {
    sleep: ['a matching silk pajama set', 'an oversized sorority tee, hair in a claw clip'],
    home_day: ['bike shorts and a cropped sweatshirt, skincare done', 'a matching lounge set, hair in a bun'],
    home_evening: ['a cute lounge set, gold hoops still in', 'leggings and a cropped hoodie, fresh manicure'],
    date_casual: ['a flowy mini skirt, fitted top, and sandals', 'a pastel sundress and her favorite bag'],
    date_out: ['a bodycon dress and heels, hair curled', 'a satin slip dress with a shimmer on her cheekbones'],
  },
  sporty: {
    sleep: ['running shorts and a team tee', 'compression shorts and a loose tank'],
    home_day: ['joggers and a half-zip, hair in a ponytail', 'gym shorts and a hoodie, post-workout glow'],
    home_evening: ['track pants and a fitted tee', 'leggings and a zip-up, sneakers by the door'],
    date_casual: ['fitted jeans, clean sneakers, and a simple tee', 'a tennis skirt and a cropped top with a sporty watch'],
    date_out: ['wide-leg trousers and a tucked blouse', 'a sporty-chic dress with heels and a leather jacket'],
  },
  alt_edgy: {
    sleep: ['a band tee three sizes too big', 'black shorts and a faded tour shirt'], 
    home_day: ['ripped black jeans and a flannel', 'a band tee and cargo pants, rings still on'],
    home_evening: ['fishnets under shorts and an oversized hoodie', 'a cropped band tee and plaid pajama pants'],
    date_casual: ['black skinny jeans, docs, and a leather jacket', 'a graphic tee under a pleated skirt with chains'],
    date_out: ['a black slip dress with fishnets and boots', 'vinyl pants and a mesh top, dark lipstick'],
  },
  polished_chic: {
    sleep: ['a linen sleep set', 'a long satin robe over shorts'],
    home_day: ['tailored trousers and a soft tee, reading glasses on', 'a cashmere sweater and slim jeans'],
    home_evening: ['a silk camisole and lounge pants', 'an oversized button-down shirt and bare legs'],
    date_casual: ['a midi skirt, fitted knit, and loafers with a cable knit sweater worn around the neck', 'wide-leg trousers and a tucked blouse'],
    date_out: ['a structured blazer over a slip dress', 'a backless black dress and delicate jewelry'],
  },
  preppy_classic: {
    sleep: ['a pastel pajama set', 'a long silk robe over shorts'],
    home_day: ['a pleated skirt and a tucked blouse, pearls in place', 'a cardigan and tailored trousers'],
    home_evening: ['a silk camisole and lounge pants', 'an oversized button-down shirt and bare legs'],
    date_casual: ['a midi skirt, fitted knit, and loafers with a cable knit sweater worn around the neck', 'wide-leg trousers and a tucked polo shirt with the collar popped'],
    date_out: ['a structured blazer over a slip dress', 'a backless black dress and delicate jewelry'],
  },
  rugged_casual: {
    sleep: ['just sweatpants, shirt long gone', 'a faded tee and flannel pants'],
    home_day: ['worn jeans and a henley, sleeves pushed up', 'a flannel over a white tee'],
    home_evening: ['a soft tee and joggers', 'jeans and a half-buttoned overshirt'],
    date_casual: ['dark jeans, boots, and a field jacket', 'a denim shirt with the sleeves rolled'],
    date_out: ['a charcoal button-down and dark jeans', 'a knit polo and chinos, leather watch'],
  },
};

// Per-companion style mapping (default cozy_casual for anyone unlisted).
export const CHARACTER_STYLE: Record<string, StyleArchetype> = {
  mina: 'alt_edgy',
  becca: 'girly_glam',
  madison: 'preppy_classic',
  jordan: 'sporty',
  serena: 'alt_edgy',
  riot: 'alt_edgy',
  lexi: 'girly_glam',
  lin: 'cozy_casual',
  iris: 'polished_chic',
  ash: 'rugged_casual',
};

export function styleFor(characterId: string): StyleArchetype {
  return CHARACTER_STYLE[characterId] ?? 'cozy_casual';
}

export function outfitContextFor(phase: string, hour: number): OutfitContext {
  if (phase === 'on_date' || phase === 'planning') {
    return hour >= 18 || hour < 4 ? 'date_out' : 'date_casual';
  }
  if (hour >= 23 || hour < 7) return 'sleep';
  if (hour >= 18) return 'home_evening';
  return 'home_day';
}

// --- The canonical best friend ---------------------------------------------------
// Each companion gets ONE stable friend, derived deterministically from her id —
// same name forever, across users and sessions. Names avoid companion names and
// phonetic neighbors (cast disambiguation rule). The LLM never invents names;
// these are engine facts.

const FRIEND_NAMES = [
  'Rachel', 'Priya', 'Dana', 'Sofia', 'Tessa', 'Maya', 'Jules', 'Carmen',
  'Noelle', 'Kayla', 'Brooke', 'Femi', 'Hana', 'Zoe',
] as const;

const FRIEND_ROLES = ['roommate', 'best friend since college', 'older sister', 'coworker and partner-in-crime'] as const;

const FRIEND_VIBES = [
  'protective and a little skeptical of whoever her friend is texting',
  'loud, funny, zero filter',
  'the responsible one, always herding everyone',
  'chaotic, always with a story going',
  'dry humor, sizes people up fast',
] as const;

export const FRIEND_AGENDAS = [
  'is mid-campaign to drag her out tonight and wants backup',
  'came to borrow an outfit and is in a hurry',
  'is camped on the couch making them both watch her show',
  'is venting about her own disaster of a week',
  'brought food over and is staying exactly as long as the food lasts',
  'is "just leaving" and has been just leaving for an hour',
] as const;

export interface FriendCanon {
  name: string;
  role: string;
  vibe: string;
}

/** Deterministic friend identity for a companion (stable forever). */
export function friendFor(characterId: string): FriendCanon {
  const r = rng(hashSeed(`friend:${characterId}`));
  return {
    name: pickFrom(FRIEND_NAMES, r),
    role: pickFrom(FRIEND_ROLES, r),
    vibe: pickFrom(FRIEND_VIBES, r),
  };
}

// --- First meetings ---------------------------------------------------------------
// How the match happened, used ONLY for the very first conversation between a
// user and a character (consistent with the app's "you just matched" fiction).
// After the first chat exists, openings describe a pair who already know
// each other.

export const FIRST_MEET_HOOKS = [
  'You two met online and hit it off immediately. Now you have exchanged numbers and are ready to get to know each other better.',
] as const;

