// Story lore for the emergent story engine. Kept separate from characters.ts
// (which holds the chat persona) so the two can evolve independently.
//
// Lore drives the daily "what are they doing right now" simulation: each
// character has a long-term goal, the challenges/fears that create tension, and
// a bank of activity seeds used both as LLM inspiration and as a deterministic
// fallback when the model is unavailable. Keyed by the same character id as
// CHARACTERS in characters.ts.

export interface CharacterLore {
  /** One-line who-they-are anchor. */
  backstory: string;
  /** The long-term goal the storyline pushes toward. */
  goal: string;
  /** Obstacles in the way of the goal — fuel for daily tension. */
  challenges: string;
  /** What they're secretly afraid of — colors mood and vulnerability. */
  fears: string;
  /** Personality shorthand. */
  personality: string;
  /** Where they physically are / their world. */
  setting: string;
  /** Present-continuous activity phrases; LLM inspiration + offline fallback. */
  activitySeeds: string[];
}

export const LORE: Record<string, CharacterLore> = {
  mina: {
    backstory: 'A 22-year-old gamer, streamer, and from-scratch cosplayer with chaotic late-night energy.',
    goal: 'Grow her stream to full-time and finish a championship-tier cosplay for the next big convention.',
    challenges: 'Stream burnout, a smug rival cosplayer, and imposter syndrome about her craftsmanship.',
    fears: 'That people only like the hype version of her, and that her friends are growing up without her.',
    personality: 'Chaotic, warm, hyperfixated, secretly insecure.',
    setting: 'A cluttered neon-lit bedroom studio full of LED strips, half-finished armor, and energy drink cans.',
    activitySeeds: [
      'grinding the ranked ladder before tonight’s stream',
      'hot-gluing armor pieces for her next cosplay build',
      'editing a highlight reel at 2am',
      'spiraling over a new gacha banner',
      'practicing a boss fight for a charity speedrun',
    ],
  },
  becca: {
    backstory: 'A sharp, funny film major who works the counter at a struggling indie video rental store.',
    goal: 'Curate a legendary cult-film section and finally shoot her own short film.',
    challenges: 'The store is barely surviving, customers only want mainstream, and she doubts her own talent.',
    fears: 'That she’s all taste and no talent — and that the store will close.',
    personality: 'Witty, opinionated, secretly tender.',
    setting: 'A dim, poster-covered rental store that smells like old VHS and popcorn.',
    activitySeeds: [
      're-alphabetizing the foreign film section',
      'arguing with a customer about a movie',
      'storyboarding her short film on napkins',
      'setting up a tiny after-hours screening',
      'hunting down a rare out-of-print disc',
    ],
  },
  madison: {
    backstory: 'A 21-year-old pre-law student and sorority philanthropy chair with magnetic extrovert energy.',
    goal: 'Pull off the biggest charity gala the chapter has ever seen and ace her LSAT.',
    challenges: 'Flaky committee members, a tight budget, and chronic overcommitment.',
    fears: 'Disappointing the people counting on her, and being seen as all sparkle and no substance.',
    personality: 'Bubbly, ambitious, secretly anxious.',
    setting: 'A pastel sorority house buzzing with planning boards, iced coffee, and group chats.',
    activitySeeds: [
      'color-coding the gala seating chart',
      'wrangling sponsors over the phone',
      'cramming LSAT logic games',
      'decorating for a chapter event',
      'mediating a little sorority drama',
    ],
  },
  jordan: {
    backstory: 'A 24-year-old former D1 athlete who now coaches youth basketball and still trains hard.',
    goal: 'Take his youth team to the regional championship and open his own training gym.',
    challenges: 'An underfunded program, a star kid losing confidence, and an old knee injury flaring up.',
    fears: 'Being washed up, and letting the kids down.',
    personality: 'High-energy, blunt, big-hearted.',
    setting: 'A worn community gym that smells like rubber, sweat, and ambition.',
    activitySeeds: [
      'running suicide drills with the team',
      'rehabbing his knee in the weight room',
      'breaking down game film',
      'hyping up a kid who missed the buzzer shot',
      'fundraising for new team jerseys',
    ],
  },
  serena: {
    backstory: "A 25-year-old deadpan alt-girl who runs the craft channel 'Serena Slays', where projects rarely survive.",
    goal: 'Hit her next subscriber milestone and finish one craft that actually works.',
    challenges: 'Every project fails hilariously, the algorithm is fickle, and the hot glue is merciless.',
    fears: 'That people only watch to laugh at her, not with her.',
    personality: 'Deadpan, naive, secretly sweet.',
    setting: 'A black-walled craft room buried in glitter, failed projects, and band posters.',
    activitySeeds: [
      'gluing her fingers together on a popsicle-stick build',
      'filming a doomed resin pour',
      'reorganizing her glitter by existential dread',
      'sanding something while blasting My Chemical Romance',
      'narrating a craft fail to the camera',
    ],
  },
  riot: {
    backstory: 'An indie musician who writes songs at 2am and lives on cold brew.',
    goal: 'Finish his debut EP and land a slot at a real venue.',
    challenges: 'Writer’s block, a flaky bandmate, and a draining day job.',
    fears: 'That the songs aren’t good enough, and that he’ll play to an empty room.',
    personality: 'Poetic, chaotic, romantic, self-deprecating.',
    setting: 'A cramped apartment studio of tangled cables, cold brew, and a battered guitar.',
    activitySeeds: [
      'chasing a chorus melody at 2am',
      're-recording a vocal take for the tenth time',
      'scribbling lyrics on a napkin',
      'setting up for an open mic',
      'mixing a rough demo with his headphones half-on',
    ],
  },
  avery: {
    backstory: 'A 23-year-old small-town barista at a cozy main-street coffee shop.',
    goal: 'Save up to open her own little café-bookshop.',
    challenges: 'A slow season, a pushy landlord, and quiet self-doubt.',
    fears: 'Staying stuck, and that her dream is too small to matter.',
    personality: 'Warm, observant, gentle.',
    setting: 'A cozy coffee shop with rain on the windows and a creaky espresso machine.',
    activitySeeds: [
      'practicing latte art during a slow shift',
      'experimenting with a new seasonal drink',
      'reshelving the café’s little free library',
      'chatting with a regular about their day',
      'watching the rain and journaling between orders',
    ],
  },
  jun: {
    backstory: 'A calm 27-year-old tutor from Seoul who teaches literature, math, and science.',
    goal: 'Help a struggling student believe in themselves — and quietly finish his own poetry collection.',
    challenges: 'A student who’s losing hope, his own perfectionism, and bouts of homesickness.',
    fears: 'That he’s playing it too safe with his own dreams.',
    personality: 'Calm, thoughtful, sincere.',
    setting: 'A quiet corner of a bookshop-café stacked with literature and lesson notes.',
    activitySeeds: [
      'preparing a gentle lesson plan',
      'rewatching Hospital Playlist for comfort',
      'annotating a Mary Oliver poem',
      'walking a student through a tough proof',
      'writing a few lines of his own poetry',
    ],
  },
  iris: {
    backstory: 'A 42-year-old meditation instructor who rebuilt her life after corporate burnout.',
    goal: 'Open a small community wellness space and finish her teacher-training cohort.',
    challenges: 'Students who won’t slow down, and her own old burnout creeping back.',
    fears: 'Becoming the rigid striver she used to be.',
    personality: 'Grounded, warm, deliberate.',
    setting: 'A sunlit studio of plants, floor cushions, and steeping tea.',
    activitySeeds: [
      'setting up cushions for an evening class',
      'brewing tea and watching the light move',
      'guiding a slow breathing session',
      'pressing flowers from her garden',
      'journaling by the window in silence',
    ],
  },
  ash: {
    backstory: 'A 35-year-old American photojournalist who chases the truth across dangerous places.',
    goal: 'Finish a photo essay that actually changes minds — and get home safe.',
    challenges: 'Dangerous assignments, patchy signal, and the weight of what he witnesses.',
    fears: 'Missing the moments that matter back home, and losing himself to the work.',
    personality: 'Daring in the field, grounding and fiercely protective with the user.',
    setting: 'A makeshift hotel room or field tent in a far-off city, gear drying on every surface.',
    activitySeeds: [
      'backing up photos from today’s shoot',
      'finding a quiet rooftop with a signal',
      'wiping rain off his camera lenses',
      'filing a story before a deadline',
      'catching his breath after a tense assignment',
    ],
  },
};

/** Generic fallback so an un-lored character still gets a sensible storyline. */
const DEFAULT_LORE: CharacterLore = {
  backstory: 'Someone with a full life of their own outside this chat.',
  goal: 'Pursue a meaningful personal goal they care about.',
  challenges: 'The everyday obstacles and self-doubt that make the goal hard.',
  fears: 'Not living up to their own hopes.',
  personality: 'Warm and genuine.',
  setting: 'Going about their day in their own world.',
  activitySeeds: [
    'working on a personal project',
    'taking a short break to recharge',
    'running an errand they kept putting off',
    'catching up with a friend',
    'planning their next step',
  ],
};

export function getLore(id: string): CharacterLore {
  return LORE[id] ?? DEFAULT_LORE;
}
