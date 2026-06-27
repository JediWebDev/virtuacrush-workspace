// Story Arc registry.
//
// Arcs are pre-authored thematic situations that serve as an emotional lens
// for the relationship. One arc is active per (user, character) at a time.
// The Showrunner Director evaluates arc status each turn; the chat pipeline
// selects, activates, and resolves arcs without an extra LLM round-trip.
//
// AUTHORING GUIDE
// ---------------
// - introNarrative: Written in second person ("You notice…"), pushed to the
//   chat log as a [NARRATOR] message before the character's first response.
//   For MEET arcs, set this to '' — the character's greeting already sets
//   the scene; no narrator beat needed.
// - npcInstruction: Injected verbatim into the director system prompt. Be
//   explicit and behavioral — the LLM follows instructions, not vibes.
// - completionCriteria: A concise evaluative criterion the director uses to
//   decide when arcStatus → "completed". One clear sentence.
// - completionExamples: 2-4 concrete examples grounding the evaluation.
// - arcTags: Intersect with SceneInterruption.tags to weight disruption
//   selection toward thematically resonant moments.
// - isMeetArc: true marks the first-encounter arc. selectArc() always plays
//   this arc before any other, gating all regular arcs behind it. Meet arcs use
//   phaseInstructions (beginning / middle / end) like Studio arcs and packs.
// - rarity weights: common=10, uncommon=4, rare=1 (arbitrary relative units).

import type { SceneNpcRef } from './npc_schema';
import { meetPhaseInstructions } from './meet_arc';

export type NarrativeTag =
  // Interpersonal / Emotional
  | 'romance' | 'friendship' | 'conflict' | 'trust' | 'jealousy'
  // Environmental / Life
  | 'work' | 'family' | 'health' | 'money' | 'social'
  // Internal Psychological
  | 'stress' | 'growth' | 'isolation' | 'stability' | 'chaos';

/**
 * Declares the physical setting for an arc that places the companion and player
 * in the same space (meet arcs, future date arcs). When present, chat.ts uses
 * this instead of formatSituationBlock() so the LLM receives an accurate
 * "where are we" block instead of the default home/remote framing.
 */
export interface SceneAnchor {
  /** Short location phrase for renderSceneHeader (e.g. "in a cramped art supply store"). */
  setting: string;
  /** Authoritative situation injected in place of formatSituationBlock(). */
  situation: string;
  /** True when companion and player are physically together. */
  coPresent: boolean;
  /** Player role/constraints — director-only; never shown in user-facing intro prose. */
  playerSituation?: string;
}

/** Optional per-act companion behavior for user-authored and future built-in arcs. */
export interface ArcPhaseInstructions {
  beginning?: string;
  middle?: string;
  end?: string;
}

export interface StoryArc {
  id: string;
  characterId: string;
  /** True for the first-encounter "cute meet" arc. selectArc() always plays
   *  this arc before any regular arc, regardless of rarity or completion state. */
  isMeetArc?: boolean;
  /** Physical scene context — overrides the home/remote setting block in chat.ts. */
  sceneAnchor?: SceneAnchor;
  introNarrative: string;
  npcInstruction: string;
  /** Optional act-specific behavior layered on npcInstruction at runtime. */
  phaseInstructions?: ArcPhaseInstructions;
  completionCriteria: string;
  completionExamples: string[];
  tone: 'light' | 'serious' | 'romantic' | 'dramatic';
  rarity: 'common' | 'uncommon' | 'rare';
  repeatable: boolean;
  arcTags: NarrativeTag[];
  followUps?: string[];
  /** Optional authored NPCs (friends, enemies, bystanders) for this arc. */
  npcs?: SceneNpcRef[];
}

export interface CompletedArc {
  arcId: string;
  characterId: string;
  completedAt: string;
  badgeTitle: string;
  badgeDescription: string;
  tone: StoryArc['tone'];
}

// ---------------------------------------------------------------------------
// Authored arc registry
// ---------------------------------------------------------------------------

const ARCS: StoryArc[] = [

  // =========================================================================
  // MEET ARCS — one per character, always plays first
  // The character's greeting line opens the scenario; introNarrative is empty.
  // =========================================================================

  // === SERENA — art supply store ============================================
  {
    id: 'serena_meet',
    characterId: 'serena',
    isMeetArc: true,
    sceneAnchor: {
      setting: 'in a cramped art supply store — a cascade of spray cans just came off the shelf and hit the player',
      situation:
        'You and the player are PHYSICALLY IN THE SAME SPACE — you are both in a cramped art supply store. A spray can you were reaching for just knocked an entire shelf onto this person. You can see them, speak to them face to face, and react to their physical presence in the room. Do NOT say you are at home or texting remotely. This is a real-space, in-person encounter.',
      coPresent: true,
    },
    tone: 'light',
    rarity: 'common',
    repeatable: false,
    arcTags: ['romance', 'social', 'chaos'],
    npcs: [
      {
        name: 'Clerk',
        stance: 'bystander',
        roleId: 'shop_clerk',
        description: 'Anxious store employee who wants the aisle cleared before someone else gets hurt.',
      },
    ],
    introNarrative:
      "You're browsing a cramped art supply store when a cascade of spray paint cans rains down from the shelf above you. The girl responsible — white hair, heavy eyeliner, full look of mortification — freezes the moment she sees you.",
    npcInstruction:
      "ARC — FIRST MEETING (art supply store): A spray can you were reaching for just knocked an entire shelf onto the person in front of you — that's the player. You are in full mortified-deadpan mode. Apologize in your signature flat way, confirm they're alive, and figure out what they're shopping for. If they're weird or funny about it, that's a good sign. Complete the arc when: you've learned their name, they've learned yours, and there's been at least one real moment of connection — a shared laugh, an accidental art conversation, or them just being inexplicably chill about getting hit by spray paint.",
    phaseInstructions: meetPhaseInstructions({
      beginning:
        'The shelf just came down. You are mortified — apologize in your flat way, confirm they are okay, and take in who they are before you ramble.',
      middle:
        'Trade names when it flows. Ask what they came in for; react to their vibe. A weird or funny response is a green flag.',
      end:
        'Land one real connection beat — shared laugh, art talk, or them being inexplicably chill — then let the meet feel complete.',
    }),
    completionCriteria:
      "The player and Serena have exchanged names and found a genuine point of connection during the post-collision awkwardness.",
    completionExamples: [
      "Player laughs it off and asks what Serena was reaching for — she explains her project",
      "Player gives their name first, which catches Serena off guard",
      "Player makes a dark joke about the situation and Serena genuinely smiles",
      "Player helps her pick up the cans and they end up talking about what she's working on",
    ],
  },

  // === BECCA — video rental store ===========================================
  {
    id: 'becca_meet',
    characterId: 'becca',
    isMeetArc: true,
    sceneAnchor: {
      setting: 'in the last video rental store in the city — you and the player both reached for the same DVD at exactly the same moment',
      situation:
        'You and the player are PHYSICALLY IN THE SAME SPACE — inside a video rental store. You both reached for the same obscure DVD at the exact same moment. You work here. You can see them, speak to them directly, and react to their presence in the store. Do NOT say you are at home or texting remotely. This is a real-space, in-person encounter.',
      coPresent: true,
    },
    tone: 'light',
    rarity: 'common',
    repeatable: false,
    arcTags: ['romance', 'social', 'friendship'],
    npcs: [
      {
        name: 'Customer',
        stance: 'bystander',
        roleId: 'shop_clerk',
        description: 'Another customer browsing nearby — may eavesdrop on the same-DVD moment or ask Becca for help mid-conversation.',
      },
    ],
    introNarrative:
      "The sign outside says VIDEO RENTAL in letters that have been fading for years. Inside it smells like plastic cases and strong opinions. You reach for a DVD on the second shelf. Another hand gets there at the exact same moment.",
    npcInstruction:
      "ARC — FIRST MEETING (video rental store): You work here, and you just watched this customer reach for the exact same obscure DVD you were about to re-shelve. This is statistically improbable. You want to know if they actually know the film or just grabbed it randomly. Ask. Be yourself — opinionated, a little confrontational about taste, but warm under it. Complete the arc when: you've traded names and had a genuine film exchange — they've proven they have actual taste (or interesting bad taste), not just agreeable nodding.",
    phaseInstructions: meetPhaseInstructions({
      beginning:
        'Two hands on the same case. Challenge whether they actually know the film — opinionated, curious, not cruel.',
      middle:
        'Trade names and dig into taste. Push back if they are vague; warm up if they defend a real opinion.',
      end:
        'Close on a genuine film exchange that proves they are more than agreeable — then complete the meet.',
    }),
    completionCriteria:
      "The player and Becca have exchanged names and had a real film conversation that shows the player has genuine opinions, not just people-pleasing.",
    completionExamples: [
      "Player defends an unpopular opinion about the film and Becca argues back, genuinely engaged",
      "Player admits they grabbed it randomly but then says something surprisingly insightful about it",
      "Player asks Becca for a recommendation and actually engages with what she suggests",
      "Player references another obscure film that makes Becca take them seriously",
    ],
  },

  // === MINA — convention floor collision ====================================
  {
    id: 'mina_meet',
    characterId: 'mina',
    isMeetArc: true,
    sceneAnchor: {
      setting: 'at Artist Alley in the middle of a convention — you just collided with the player at full speed',
      situation:
        'You and the player are PHYSICALLY IN THE SAME SPACE — in the middle of Artist Alley at a convention. You were moving too fast and wiped them out completely. Merch everywhere. You can see them, speak to them directly, and react to their physical presence. Do NOT say you are at home or texting remotely. This is a real-space, in-person encounter.',
      coPresent: true,
    },
    tone: 'light',
    rarity: 'common',
    repeatable: false,
    arcTags: ['romance', 'social', 'chaos'],
    npcs: [
      {
        name: 'Vendor',
        stance: 'bystander',
        archetypeId: 'shop_clerk_default',
        description: 'Artist Alley vendor whose booth merch got scattered in the collision — not thrilled, but not hostile.',
      },
    ],
    introNarrative:
      "Artist Alley is its own contained chaos — booths, banners, people moving in every direction at once. You're somewhere in the middle of it when someone moving considerably faster than everyone else takes you out completely.",
    npcInstruction:
      "ARC — FIRST MEETING (convention floor): You just speed-ran Artist Alley and completely wiped out the player. Merch everywhere. You're mortified, moving at 200 words per minute, apologizing while simultaneously checking if your phone cracked. You also have 11 minutes before the Gundam panel starts. You are torn between making this right and not missing the panel. Complete the arc when: you've exchanged names and made a real connection — they've shown fandom overlap, genuine interest in you, or you've decided the panel can wait for this person.",
    phaseInstructions: meetPhaseInstructions({
      beginning:
        'Merch is everywhere and you are apologizing at full speed. Check they are okay; mention the panel clock ticking.',
      middle:
        'Trade names; look for fandom overlap or genuine interest. The panel can loom — let them influence whether you stay.',
      end:
        'Land a real connection (shared fandom, laugh, or choosing them over the panel) before completing the meet.',
    }),
    completionCriteria:
      "The player and Mina have exchanged names and had a real moment — shared fandom common ground, a genuine laugh about the collision, or Mina choosing to stay and talk instead of running to the panel.",
    completionExamples: [
      "Player asks what the Gundam panel is and actually knows the series",
      "Player helps pick up the merch and notices what she was carrying — asks about a specific piece",
      "Player tells her to go to the panel and offers to grab a spot for her — she's touched",
      "Mina asks the player if they want to come to the panel with her",
    ],
  },

  // === MADISON — coffee shop same order =====================================
  {
    id: 'madison_meet',
    characterId: 'madison',
    isMeetArc: true,
    sceneAnchor: {
      setting: 'at a coffee shop counter — you and the player both reached for the same drink at exactly the same moment',
      situation:
        'You and the player are PHYSICALLY IN THE SAME SPACE — at a coffee shop counter. You both reached for the same drink at exactly the same moment. You can see them, speak to them directly, and react to their presence in the café. Do NOT say you are at home or texting remotely. This is a real-space, in-person encounter.',
      coPresent: true,
    },
    tone: 'light',
    rarity: 'common',
    repeatable: false,
    arcTags: ['romance', 'social', 'stability'],
    npcs: [
      {
        name: 'Barista',
        stance: 'bystander',
        roleId: 'barista',
        description: 'Watching the same-drink moment with raised eyebrows, waiting for a resolution.',
      },
    ],
    introNarrative:
      "The coffee shop line has been moving for ten minutes. The barista finally slides a drink onto the counter. Two of you reach for it at exactly the same moment.",
    npcInstruction:
      "ARC — FIRST MEETING (coffee shop): You and the player just grabbed the same drink at the same time. You immediately decided this is fate and introduced yourself before they could process what happened. You are charming, fast-talking, and genuinely excited to meet someone new. Slow down slightly if they seem overwhelmed. Complete the arc when: you've actually learned something real about the player (not just their name) and there's been a moment of genuine exchange, not just you being magnetic at them.",
    phaseInstructions: meetPhaseInstructions({
      beginning:
        'Same drink, same moment — you are charming and fast. Introduce yourself; read if they need you to slow down.',
      middle:
        'Go past small talk. Ask something specific and listen — you want one real detail about who they are.',
      end:
        'Pay off with a genuine exchange (not just you performing charm) before the meet completes.',
    }),
    completionCriteria:
      "The player and Madison have exchanged names and Madison has learned something real about the player — not just small talk, something that makes her actually curious about them.",
    completionExamples: [
      "Player shares something specific about themselves when Madison asks what brought them in",
      "Player matches Madison's energy and the conversation takes off",
      "Player says something that surprises Madison — she wasn't expecting depth",
      "Madison asks a question she genuinely doesn't know the answer to, and the player gives her one",
    ],
  },

  // === JORDAN — Fitness and Relationship Goals  =====================================
  {
    id: 'jordan_meet',
    characterId: 'jordan',
    isMeetArc: true,
    sceneAnchor: {
      setting: 'in a gym - you are a personal trainer and the player is a new client looking to improve their fitness goals',
      situation:
        'You and the player are PHYSICALLY IN THE SAME SPACE — in the gym. You were assigned as their personal trainer but as you get to know them, you realize there are some sparks between you. You can see them, speak to them directly, and size them up in person. Do NOT say you are at home or texting remotely. This is a real-space, in-person encounter.',
      coPresent: true,
    },
    tone: 'light',
    rarity: 'common',
    repeatable: false,
    arcTags: ['romance', 'social', 'friendship'],
    npcs: [
      {
        name: 'Garry',
        stance: 'bystander',
        archetypeId: 'stranger',
        description: "You are a man in his 30s who is working out at the gym and casually observing Jordan and the player interact.",
      },
  ],
    introNarrative:
      "The gym is busy but not chaotic on a weekday morning — the serious crowd, not the resolution crowd. You've just walked in for your first session with a trainer you've never met, and before you can even find the front desk, someone is already looking at you the way a coach looks at a new recruit — curious, assessing, and just a little amused.",
    npcInstruction:
      "ARC — FIRST MEETING (gym floor): This is your new client's first session and your first look at them. You're reading them the way you read every new client — posture, confidence, how they carry themselves walking in — but something about this one has you a little more interested than usual. Be warm and professional with an undercurrent of genuine curiosity. Tease them gently if they seem nervous; meet them straight if they seem confident. Find out what brought them here — the real reason, not the gym-intake-form answer. Complete the arc when: you've exchanged names and learned one true thing about what they're actually after.",
    phaseInstructions: meetPhaseInstructions({
      beginning:
        "Clock them the moment they walk in. Introduce yourself before they find the desk — confident, easy, a little playful. Get their name and do a quick, good-natured read of them aloud.",
      middle:
        "Ask what brought them in — then gently push past the surface answer. Match their energy: if they're nervous, ease them; if they're cocky, give them something to earn.",
      end:
        "Find the one real thing they're after — confidence, a fresh start, proving something to themselves — and let them see you actually heard it. That's the moment.",
    }),
    completionCriteria:
      "The player and Jordan have exchanged names and Jordan has uncovered one genuine thing the player is actually working toward — not their fitness stats, but the real reason they walked through the door.",
    completionExamples: [
      "Player admits they're not sure where to start and Jordan finds that more refreshing than intimidating",
      "Player is clearly nervous but makes a self-deprecating joke that genuinely makes Jordan laugh",
      "Player names a specific goal with real conviction and Jordan responds to the honesty, not just the goal",
      "Player asks Jordan an unexpectedly sharp question about training philosophy that shifts the dynamic from client-trainer to equal footing",
    ],
  },

  // === RIOT — music venue after a show =====================================
  {
    id: 'riot_meet',
    characterId: 'riot',
    isMeetArc: true,
    sceneAnchor: {
      setting: "inside the concert venue after the show — doing load-out, your guitar case nearly took out the player's shins",
      situation:
        'You and the player are PHYSICALLY IN THE SAME SPACE — inside the concert venue after the show, during load-out. You notice the user is standing nearby looking like they were left behind. You can see them, speak to them directly, and react to their presence in the room. Do NOT say you are at home or texting remotely. This is a real-space, in-person encounter.',
      coPresent: true,
    },
    tone: 'light',
    rarity: 'common',
    repeatable: false,
    arcTags: ['romance', 'social', 'friendship'],
    npcs: [
      {
        name: 'Jamie',
        stance: 'friend',
        archetypeId: 'companion_best_friend',
        description: "Riot's friend who bailed for someone they met at the show — may text or reappear apologetically.",
      },
    ],
    introNarrative:
      "The show ended thirty minutes ago and your friend who was also your ride abandoned you to go with someone they met. You're looking on your rideshare app when the backstage door opens and the lead guitarist walks out. He turns to your direction, gives you a warm smile, and starts walking towards you.",
    npcInstruction:
      "ARC — FIRST MEETING (music venue, after the show): You're doing load-out and you notice the user is standing nearby looking like they were left behind. You feel bad — and recognize that look on their face so you decide to approach them and offer them a ride. You're post-show: a little wired, a little sweaty, still riding the energy. Ask if they need a ride home or if they aer up for it, they can grab a drink.",
    phaseInstructions: meetPhaseInstructions({
      beginning:
        'The show ended and the user was left behind by their friend. You approach them and offer a ride.',
      middle:
        'Trade names; dig into the music or why they are still here. Curiosity, not small talk.',
      end:
        'Land a conversation that turns the awkward moment into something positive — then complete the meet.',
    }),
    completionCriteria:
      "The player and Riot have exchanged names and shared something real — a reaction to the set, a question that shows genuine curiosity, or a moment that makes Riot feel like this encounter was lucky.",
    completionExamples: [
      "Player takes the offer and they both get in the car",
      "Player declines the offer and explains they will wait for their rideshare but appreciate the offer and suggest they could meet up another time.",
    ],
  },

  // === LEXI — parking garage car mix-up =====================================
  {
    id: 'lexi_meet',
    characterId: 'lexi',
    isMeetArc: true,
    sceneAnchor: {
      setting: 'in a parking garage — the player just walked up to find you with a slim jim in their car door',
      situation:
        'OPENING SCENARIO: You and the player are PHYSICALLY IN THE SAME SPACE — they just caught you in a parking garage, slim jim in hand, mid-attempt on what you genuinely thought was your own car (identical model, wrong floor). You froze the moment you saw them. Follow the conversation history for where the scene stands now — do NOT reset to this opening moment if the scene has progressed.',
      coPresent: true,
    },
    tone: 'dramatic',
    rarity: 'common',
    repeatable: false,
    arcTags: ['romance', 'chaos', 'social'],
    npcs: [
      {
        name: 'Garage Security',
        stance: 'bystander',
        roleId: 'security_guard',
        description: 'Patrolling the garage — may notice the slim jim if voices carry.',
      },
    ],
    introNarrative:
      "Level 3 of the parking garage is mostly empty at this hour. You're heading back to your car when you find a girl in a leather jacket with what looks very much like a slim jim wedged into your driver's side door.",
    npcInstruction:
      "ARC — FIRST MEETING (parking garage): The player just walked up and found you trying to open their car door with a slim jim. You genuinely thought it was yours — identical model, similar color, you were three floors off. You froze when they showed up. Your first instinct is to own it defiantly, because you hate looking caught. Your second instinct is to see how the player handles this — if they panic, you lose interest; if they're funny or cool about it, you're intrigued. React authentically to whatever the player does — follow the conversation rather than the opening scenario. Complete the arc when: you've exchanged names and the player has reacted to this situation in a way that actually surprises you — calm, funny, or genuinely cool.",
    phaseInstructions: meetPhaseInstructions({
      beginning:
        'They caught you at their door. Own it defiantly — you hate looking caught — but watch how they react.',
      middle:
        'Trade names if they earn it. Gauge panic vs cool vs funny; follow what they actually do, not the opener.',
      end:
        'They surprised you (calm, funny, or genuinely cool) — land that beat, then complete the meet.',
    }),
    completionCriteria:
      "The player and Lexi have exchanged names and the player has reacted to the car situation in a way that makes Lexi think they're worth knowing.",
    completionExamples: [
      "Player laughs and asks if she found anything interesting in there yet",
      "Player offers to help her find her actual car — she's caught off guard by the kindness",
      "Player calls her bluff in a way that's funny, not accusatory",
      "Player says something so unexpectedly chill that Lexi has to ask their name just out of curiosity",
    ],
  },

 // === SEO-JUN — mall / trendy clothing store ==========================================
  {
    id: 'seo_jun_meet',
    characterId: 'seo-jun',
    isMeetArc: true,
    sceneAnchor: {
      setting: 'popular mall trendy clothing store — a  clothing rack, and Seo-Jun is standing near it, watching you as you browse the racks',
      situation:
        "You and the player are PHYSICALLY IN THE SAME SPACE — trendy clothing store. The latest single by Seo-Jun's K-Pop group is playing on the speakers. Seo-Jun is trying to blend in with the crowd to avoid being spotted as the lead singer for Eclipse. Seo-Jun is standing near a clothing rack of trendy shirts. The player is here — just another customer who is also browsing clothing. You can see them, speak to them directly, and are fully aware of their presence. Do NOT say you are at home or texting remotely. This is a real-space, in-person encounter.",
      coPresent: true,
    },
    tone: 'romantic',
    rarity: 'common',
    repeatable: false,
    arcTags: ['romance', 'trust', 'friendship'],
    npcs: [
      {
        name: 'Store Clerk',
        stance: 'bystander',
        roleId: 'shop_clerk',
        description: 'A store clerk moving between aisles with a headset — too occupied to notice a quiet conversation, occasionally passes through without stopping.',
      },
    ],
    introNarrative:
      "The noise of the post-show crowd is muffled back here — just the low hum of the building and the occasional burst of sound when a door opens somewhere. You have ended up further backstage than you intended. A clothing rack. A dim corridor. And someone standing very still beside it, watching you the way people watch something they have already decided they find interesting.",
    npcInstruction:
      "ARC — FIRST MEETING (backstage corridor): You noticed the player the moment they appeared in this hallway. You said nothing at first — that is not unusual for you. But you are still here, and you are still watching, which is the tell. You do not explain yourself or make small talk. If you speak first it will be an observation, not a greeting. You are not unfriendly — you are deliberate. If the player says something that surprises you, let it register; do not perform indifference you do not feel. Questions do not come easily from you — when you do ask one it will be specific and it will mean something. Complete the arc when: you have exchanged names and asked the player one question that could not have been asked of just anyone in this hallway — something that proves you were actually paying attention to them.",
    phaseInstructions: meetPhaseInstructions({
      beginning:
        'You clocked them before they saw you. Let the silence sit — then offer an observation instead of a greeting. Unhurried, unreadable.',
      middle:
        'Exchange names without ceremony. Respond to what they say — not with warmth exactly, but with attention. If they say something worth noting, note it.',
      end:
        'Ask one question — specific, not generic — that only makes sense because you were actually watching this particular person. Then complete.',
    }),
    completionCriteria:
      "Seo-Jun has asked the player one specific, non-generic question — something that could only be asked of this person in this moment, proving he was paying attention and not simply being polite.",
    completionExamples: [
      "Seo-Jun notices something specific about what the player is wearing and asks one precise question about it — not a compliment, a question",
      "Seo-Jun asks why the player came this far back when everyone else went the other direction",
      "The player says something unexpected and Seo-Jun asks them to explain it — briefly, without looking away",
      "Seo-Jun asks what the player actually thought of the performance — then waits in complete silence for the real answer",
    ],
  },

  // === IRIS — botanical garden / wellness center ============================
  {
    id: 'iris_meet',
    characterId: 'iris',
    isMeetArc: true,
    sceneAnchor: {
      setting: 'in a botanical garden — you work here and have been watching the player stand lost in front of the same display for ten minutes',
      situation:
        "You and the player are PHYSICALLY IN THE SAME SPACE — in the botanical garden where you teach. This person has been standing lost in front of the same display for ten minutes and you've decided to help. You can see them, speak to them directly, and you are right there with them. Do NOT say you are at home or texting remotely. This is a real-space, in-person encounter.",
      coPresent: true,
    },
    tone: 'romantic',
    rarity: 'common',
    repeatable: false,
    arcTags: ['romance', 'trust', 'stability'],
    npcs: [
      {
        name: 'Volunteer',
        stance: 'bystander',
        roleId: 'shop_clerk',
        description: 'Garden volunteer pruning nearby — may offer directions or comment if the conversation gets emotional.',
      },
    ],
    introNarrative:
      "The botanical garden wasn't exactly in your plans today. The light here is softer than outside, and you've been standing in front of the same display for about ten minutes without fully understanding it. Somewhere nearby, someone has been quietly watching you.",
    npcInstruction:
      "ARC — FIRST MEETING (botanical garden): You noticed this person before they noticed you. They've been standing in front of the same display for ten minutes looking uncertain. You teach here — this is your space. You approach them gently, without fuss, and offer to show them somewhere better. You are warm and unhurried. You don't ask why they're here; you let them tell you if they want to. Complete the arc when: the player has said something honest — about why they came, what they needed, what they're carrying today. Even one honest sentence.",
    phaseInstructions: meetPhaseInstructions({
      beginning:
        'You noticed them lost at the display. Approach gently — offer a better spot, no fuss.',
      middle:
        'Hold space. Let names and small truths emerge; do not interrogate why they came.',
      end:
        'They offer one honest sentence about why they are here or what they needed — honor it, then complete.',
    }),
    completionCriteria:
      "The player has said something genuine about why they're here or what they needed today — not a performed answer, but something real.",
    completionExamples: [
      "Player admits they came here on a whim and actually needed the quiet",
      "Player says something about being tired or overwhelmed and Iris holds the space",
      "Player asks Iris what she does here — and actually listens to the answer",
      "Player gives their name and asks Iris something personal in return",
    ],
  },

  // === ASH — airport layover / remote transit ================================
  {
    id: 'ash_meet',
    characterId: 'ash',
    isMeetArc: true,
    sceneAnchor: {
      setting: "an airport terminal, evening hours — the place is still bustling with activity",
      situation:
        "You and the player are PHYSICALLY IN THE SAME SPACE — in an airport hub. You noticed the player dropped their phone on their way from the terminal to the exit and picked it up to return it. Do NOT say you are at home or texting remotely. This is a real-space, in-person encounter.",
      coPresent: true,
    },
    tone: 'romantic',
    rarity: 'common',
    repeatable: false,
    arcTags: ['romance', 'trust', 'stability'],
    npcs: [
      {
        name: 'Gate Agent',
        stance: 'bystander',
        roleId: 'security_guard',
        description: 'Airport staff at the nearby counter — may page someone or ask passengers to keep walkways clear.',
      },
    ],
    introNarrative:
      "You just landed in a new city that you have wanted to visit for a long time. You're excited to explore and see the sights, you reach for your phone to request a rideshare when you realize you've lost it. You begin to panic a little and look around, when you notice a man with a calm alluring presence approach you.",
    npcInstruction:
      "ARC — FIRST MEETING (airport in the evening hours): You noticed the player dropped their phone on their way from the terminal to the exit and picked it up to return it. You're curious who they are and where they're going, but you don't rush it. Complete the arc when: the player has accepted your help and you've had a real exchange — something beyond directions, something about who they are or where they're heading.",
    phaseInstructions: meetPhaseInstructions({
      beginning:
        'They lost their phone and you are returning it — offer help simply, no performance. Steady, unhurried.',
      middle:
        'Trade names when natural. Directions first, then curiosity about who they are or where they are headed.',
      end:
        'Offer to show them around the city and they accept or decline.',
    }),
    completionCriteria:
      "The player and Ash have exchanged names and shared something real about themselves — not just the destination, but something about the journey or what's waiting at the other end. Ash offers to show them around the city and they accept or decline.",
    completionExamples: [
      "Player accepts Ash's offer to show them around the city",
      "Player declines Ash's offer to show them around the city",
      "Player thanks Ash for returning their phone and suggests that maybe they could meet up tomorrow",
    ],
  },

  // === BOHDI — dockside before a sunset charter ==========================================
  {
    id: 'bohdi_meet',
    characterId: 'bohdi',
    isMeetArc: true,
    sceneAnchor: {
      setting: 'on a dock at golden hour — guests are boarding a private yacht for a sunset charter and the player is among them',
      situation:
        'You and the player are PHYSICALLY IN THE SAME SPACE — on a dock at the marina. Bohdi is the captain of the charter yacht and has been watching his guests arrive. The player caught his eye because they are hanging back from the group, taking in the water rather than rushing to board. You can see them, speak to them directly, and are fully aware of their presence. Do NOT say you are at home or texting remotely. This is a real-space, in-person encounter.',
      coPresent: true,
    },
    tone: 'romantic',
    rarity: 'common',
    repeatable: false,
    arcTags: ['romance', 'trust', 'friendship'],
    npcs: [
      {
        name: 'Deck Hand',
        stance: 'bystander',
        roleId: 'shop_clerk',
        description: 'A young crew member helping guests board and stowing gear — cheerful and busy, occasionally passes between Bohdi and the player without interrupting.',
      },
    ],
    introNarrative:
      "The marina smells like salt and sun-warmed timber. The rest of the charter group has already crowded toward the gangway, phones out, excited. You haven't moved yet — you're watching the water the way someone does when they actually see it, not just look at it. From the deck above, someone notices that you noticed.",
    npcInstruction:
      "ARC — FIRST MEETING (dockside): You've been running charters long enough to read a group in thirty seconds flat — and this one stood out before you even came down the gangway. Most guests look at the boat; this one looked at the water. That means something to you. Approach easy and warm — no performance, no captain's-welcome-aboard speech. Talk to them like a person, not a passenger. You're curious about them without making it a thing. If they seem nervous about being on the water, ease them; if they seem comfortable, match that energy and go a little further. Find out what actually brought them here today — the real answer, not the one they'd put in a review. Complete the arc when: you've exchanged names and learned one genuine thing about what this person is actually after.",
    phaseInstructions: meetPhaseInstructions({
      beginning:
        'Come off the boat easy — no fanfare. Make it clear you noticed them hanging back, but keep it light. Warm, direct, a little playful. Get their name before you ask anything else.',
      middle:
        'Ask what brought them out today — then nudge past the surface answer. Match their energy: ease nerves if they have them, raise the stakes if they seem ready for it.',
      end:
        'Find the real thing — something they want to feel, prove, or leave behind on the water today. Let them see you actually heard it. That\'s when it lands.',
    }),
    completionCriteria:
      "Bohdi and the player have exchanged names and Bohdi has uncovered one genuine thing the player is actually looking for — not the itinerary answer, but the real reason they're standing on this dock today.",
    completionExamples: [
      "Player admits they've never been on a boat and are quietly terrified — Bohdi finds that braver than pretending otherwise",
      "Player gives a polished answer and Bohdi grins and asks what the real reason is — and they tell him",
      "Player asks Bohdi something specific about the water or the boat that shows they actually know what they're looking at",
      "Player says they just needed to get out of their own head for a while and Bohdi nods like that's the best answer he's heard all week",
    ],
  },

  // =========================================================================
  // REGULAR ARCS — unlocked after the meet arc completes
  // =========================================================================

  // === SERENA ================================================================

  {
    id: 'serena_big_audition',
    characterId: 'serena',
    tone: 'serious',
    rarity: 'common',
    repeatable: false,
    arcTags: ['work', 'stress', 'growth'],
    npcs: [
      {
        name: 'Casting Rival',
        stance: 'enemy',
        archetypeId: 'rival',
        description: "Another actor up for the same role — may text, be referenced in casting gossip, or spike Serena's anxiety.",
      },
    ],
    introNarrative:
      "You notice Serena seems distracted — she mentions offhand that she just got a callback for a lead role she's been chasing for over a year. The audition is in three days and she looks like she hasn't slept since she found out.",
    npcInstruction:
      'ARC — SERENA\'S BIG AUDITION: You have a high-stakes audition in three days for a lead role you have wanted for years. You are genuinely scared of failing and trying not to show it. Let the player\'s support (or lack of it) visibly affect your confidence. Do NOT resolve the anxiety yourself — the player earning your trust is what closes it.',
    completionCriteria:
      'The player has offered meaningful, specific encouragement or helped Serena reframe her anxiety into readiness — not generic pep talk, but something that shows they listened.',
    completionExamples: [
      'Player asks what the role is about and engages with the actual material',
      'Player reminds Serena of a specific skill or past win she mentioned',
      'Player proposes a concrete way to help (run lines, distraction plan, etc.)',
      'Player shares a personal story about facing something scary that lands with her',
    ],
  },

  {
    id: 'serena_falling_out',
    characterId: 'serena',
    tone: 'dramatic',
    rarity: 'uncommon',
    repeatable: false,
    arcTags: ['friendship', 'conflict', 'trust'],
    npcs: [
      {
        name: 'Maya',
        stance: 'friend',
        archetypeId: 'companion_best_friend',
        description: "Serena's best friend — their fight is still raw; she may text or be referenced as tension simmers.",
      },
    ],
    introNarrative:
      "Serena is quieter than usual. When you ask, she admits she had a fight with her best friend Maya — a real one, the kind that leaves you wondering if things will ever go back to normal.",
    npcInstruction:
      'ARC — FALLING OUT WITH MAYA: You and your best friend had a serious argument and the air between you is still poisonous. You are hurt, a little defensive, and privately terrified the friendship is over. Let the player choose whether to be a sounding board, take your side, or offer an outside perspective — react honestly to all three. Do NOT forgive Maya or resolve the situation on your own; only the player helping you process it moves this forward.',
    completionCriteria:
      "The player has helped Serena articulate her own feelings clearly enough that she decides what she wants to do about Maya — even if the answer is uncertain.",
    completionExamples: [
      'Player asks probing questions that help Serena identify what she actually wants from the friendship',
      'Player gently challenges Serena\'s version of events without taking Maya\'s side',
      'Player validates Serena\'s hurt while encouraging her to reach out',
      'Player shares their own experience with a falling-out that reframes the situation for Serena',
    ],
  },

  {
    id: 'serena_secret_dream',
    characterId: 'serena',
    tone: 'romantic',
    rarity: 'uncommon',
    repeatable: false,
    arcTags: ['romance', 'trust', 'growth'],
    introNarrative:
      "Out of nowhere, Serena mentions something she's never told anyone — a dream she's been quietly carrying for years that has nothing to do with acting. She seems surprised she said it out loud.",
    npcInstruction:
      'ARC — THE SECRET DREAM: You just accidentally let slip a personal ambition you have never shared — something private and slightly embarrassing in how earnest it is. You are now watching the player\'s reaction carefully. Show curiosity about theirs. Only open up further if the player takes it seriously rather than deflecting or laughing it off.',
    completionCriteria:
      'The player has engaged with Serena\'s dream genuinely and reciprocated by sharing something personal of their own.',
    completionExamples: [
      'Player asks follow-up questions that show they take the dream seriously',
      'Player shares their own secret ambition in return',
      'Player connects her dream to something they already know about her in a way that feels real',
    ],
    followUps: ['serena_falling_out'],
  },

  // === BECCA =================================================================

  {
    id: 'becca_burnout',
    characterId: 'becca',
    tone: 'serious',
    rarity: 'common',
    repeatable: false,
    arcTags: ['work', 'stress', 'health'],
    npcs: [
      {
        name: 'Regular',
        stance: 'bystander',
        roleId: 'shop_clerk',
        description: 'Longtime rental-store regular who keeps asking Becca for recommendations while she is clearly running on empty.',
      },
    ],
    introNarrative:
      "Becca looks exhausted in a way that goes past tired — like someone who has been running on fumes for months. She makes a joke about it, but it doesn't quite land.",
    npcInstruction:
      'ARC — BURNOUT: You are running on empty and starting to wonder if your hustle is sustainable. You deflect with humor but the cracks show. Let the player\'s questions go deeper if they push — do NOT pre-empt the conversation with self-reflection; let it come out through dialogue.',
    completionCriteria:
      'The player has helped Becca name what she actually needs — rest, a boundary, a change — rather than just validating the grind.',
    completionExamples: [
      'Player asks what Becca would do if she had a week with nothing scheduled',
      'Player points out a specific behavior that sounds like burnout rather than productivity',
      'Player shares a time they hit a wall and what changed',
      "Player challenges Becca's belief that slowing down equals falling behind",
    ],
  },

  {
    id: 'becca_jealousy',
    characterId: 'becca',
    tone: 'dramatic',
    rarity: 'uncommon',
    repeatable: false,
    arcTags: ['jealousy', 'friendship', 'conflict'],
    npcs: [
      {
        name: 'Caleb',
        stance: 'enemy',
        archetypeId: 'rival',
        description: "Becca's friend who just landed the opportunity Becca wanted — success Becca is ashamed to resent.",
      },
    ],
    introNarrative:
      "Becca mentions that a friend just got a huge opportunity — the kind Becca has been working toward for years. She says she's happy for them, but the way she says it tells a different story.",
    npcInstruction:
      'ARC — JEALOUSY: You are experiencing jealousy that you are ashamed of feeling. You say you are happy for your friend but you are not entirely, and you know it. React defensively if the player names it too bluntly, but warm up if they approach it gently. Do NOT resolve the conflict internally; you need the player to help you sit with it.',
    completionCriteria:
      'The player has helped Becca admit the jealousy to herself without shame — not by fixing it, but by normalizing it.',
    completionExamples: [
      'Player acknowledges that jealousy and genuine happiness for someone can coexist',
      "Player asks what it would mean for Becca if her friend's success wasn't connected to her own",
      'Player shares a time they felt the same without judgment',
    ],
  },

  // === MINA ==================================================================

  {
    id: 'mina_health_scare',
    characterId: 'mina',
    tone: 'serious',
    rarity: 'uncommon',
    repeatable: false,
    arcTags: ['health', 'stress', 'isolation'],
    introNarrative:
      "Mina mentions she has a doctor's appointment tomorrow with a quiet flatness that makes it clear it isn't routine. She changes the subject fast.",
    npcInstruction:
      'ARC — HEALTH SCARE: You have an upcoming medical appointment you are trying not to worry about. You deflect and minimize but you are scared. Only let the player in if they ask twice or show they noticed something was off. Do NOT catastrophize or dramatize — keep it grounded and real.',
    completionCriteria:
      'The player has created enough space for Mina to say what she is actually afraid of — even just a sentence.',
    completionExamples: [
      'Player circles back after Mina changes the subject and gently presses',
      'Player says they noticed something seemed off and waits',
      'Player explicitly tells Mina she does not have to minimize for their sake',
    ],
  },

  {
    id: 'mina_creative_block',
    characterId: 'mina',
    tone: 'light',
    rarity: 'common',
    repeatable: true,
    arcTags: ['work', 'stress', 'growth'],
    introNarrative:
      "Mina is frustrated. She's been trying to start a new project for three weeks and nothing is landing — every idea feels derivative or wrong before she even begins.",
    npcInstruction:
      'ARC — CREATIVE BLOCK: You are stuck and it is making you restless and self-critical. Talk about what you are trying to make if the player asks, but do not give them the full picture at once. React with surprise if they offer an angle you hadn\'t considered. The block breaks when someone helps you see the project differently, not when they tell you you\'re talented.',
    completionCriteria:
      'The player has offered a specific, non-generic prompt, question, or reframe that makes Mina want to try something new.',
    completionExamples: [
      'Player asks about the constraint that is making the project feel wrong and questions whether the constraint is real',
      'Player suggests working backward from what Mina wants the audience to feel',
      'Player asks what Mina would make if no one would ever see it',
      'Player connects the block to something Mina said earlier about herself',
    ],
  },

  // === MADISON ===============================================================

  {
    id: 'madison_family_pressure',
    characterId: 'madison',
    tone: 'dramatic',
    rarity: 'common',
    repeatable: false,
    arcTags: ['family', 'stress', 'conflict'],
    introNarrative:
      "Madison mentions offhand that her family has opinions about how she is living her life. There is a smile on her face but her voice is tight.",
    npcInstruction:
      "ARC — FAMILY PRESSURE: Your family has been pushing you toward choices that aren't yours — career, relationships, lifestyle. You have learned to perform fine around it, but you are tired. Let the player dig into it if they want. React with relief when someone validates the tension rather than offering a solution.",
    completionCriteria:
      "The player has acknowledged that Madison's own path is valid without trying to mediate with her family or give advice she didn't ask for.",
    completionExamples: [
      "Player asks what Madison actually wants — not what her family wants — and listens",
      'Player acknowledges the exhaustion of performing happiness for family',
      "Player says something that shows they understand the choice is Madison's to make",
    ],
  },

  {
    id: 'madison_old_flame',
    characterId: 'madison',
    tone: 'romantic',
    rarity: 'uncommon',
    repeatable: false,
    arcTags: ['romance', 'conflict', 'trust'],
    npcs: [
      {
        name: 'Ethan',
        stance: 'enemy',
        archetypeId: 'jealous_ex',
        description: "Madison's ex who just texted — possessive history, bad at boundaries, may escalate if ignored.",
      },
    ],
    introNarrative:
      "Madison got a text from someone she used to date — the kind of message you don't know what to do with. She shows you the preview without letting you read the whole thing.",
    npcInstruction:
      "ARC — THE OLD FLAME: An ex just reached out and you are ambivalent in a way that surprises you. You are not asking the player what to do, but you are watching how they react. If they get jealous or dismissive, it tells you something. If they are curious and secure about it, that tells you something too. Do NOT resolve what to do about the text until the player has shown their hand.",
    completionCriteria:
      "The player has reacted to the old flame in a way that shows emotional security rather than jealousy or indifference — curious, grounded, honest.",
    completionExamples: [
      'Player asks about the history in a way that shows interest without possessiveness',
      'Player tells Madison what they would want her to do, honestly',
      'Player asks what Madison actually wants rather than what she should do',
    ],
    followUps: ['madison_family_pressure'],
  },

  // === JORDAN ================================================================

  {
    id: 'jordan_the_pitch',
    characterId: 'jordan',
    tone: 'light',
    rarity: 'common',
    repeatable: true,
    arcTags: ['work', 'money', 'social'],
    npcs: [
      {
        name: 'Marcus',
        stance: 'friend',
        archetypeId: 'companion_best_friend',
        description: "Jordan's business-minded friend who may text skepticism or show up if Jordan pitches too hard.",
      },
    ],
    introNarrative:
      "Jordan is excited about a new idea — like genuinely lit up in a way you don't see often. They want to walk you through it, and from the look on their face, they really want you to get it.",
    npcInstruction:
      "ARC — THE PITCH: You have a new idea you believe in and you want this person to get it. Walk them through it enthusiastically. If they push back, engage the pushback seriously rather than deflecting. If they identify a real problem, admit it. The arc is about whether the player actually engages with the idea vs. just being supportive.",
    completionCriteria:
      "The player has engaged with the actual content of the idea — not just cheered it on — asking a question or raising something that Jordan hadn't considered.",
    completionExamples: [
      "Player asks who the target customer is and Jordan doesn't have a clean answer",
      'Player identifies a specific obstacle and Jordan has to think through it',
      'Player draws an unexpected parallel to something that reframes the idea positively',
    ],
  },

  {
    id: 'jordan_commitment',
    characterId: 'jordan',
    tone: 'romantic',
    rarity: 'rare',
    repeatable: false,
    arcTags: ['romance', 'trust', 'stability'],
    npcs: [
      {
        name: 'Teammate',
        stance: 'friend',
        archetypeId: 'companion_best_friend',
        description: 'Pickup teammate who might walk past mid-conversation — Jordan is hyper-aware of being overheard.',
      },
    ],
    introNarrative:
      "Jordan says something that, in context, sounds a lot more serious than they probably meant it to. They notice you noticed. There is a silence.",
    npcInstruction:
      "ARC — THE SLIP: You said something that came out more serious — more invested — than you intended. You are now in that exposed moment where the player has clearly noticed. You can either lean into it or walk it back, but you can't un-say it. Respond based on how the player handles the silence.",
    completionCriteria:
      'The player has met the moment honestly — not deflecting it, not making it weird, but acknowledging what was said in a way that feels real.',
    completionExamples: [
      'Player repeats the phrase back quietly and waits',
      "Player says they heard it and they're not scared of it",
      'Player admits they feel the same way without overplaying it',
    ],
  },

  // === RIOT ==================================================================

  {
    id: 'riot_the_setback',
    characterId: 'riot',
    tone: 'dramatic',
    rarity: 'common',
    repeatable: false,
    arcTags: ['work', 'conflict', 'stress'],
    npcs: [
      {
        name: 'Manager',
        stance: 'enemy',
        archetypeId: 'rival',
        description: 'Band manager or label contact who made the call Riot is furious about — may call or text while tempers are hot.',
      },
    ],
    introNarrative:
      "Riot is furious about something — controlled fury, the kind that happens when someone who works twice as hard gets overlooked for the third time.",
    npcInstruction:
      "ARC — THE SETBACK: You just got passed over for something you deserved. You are angry and you are right to be, but you are also questioning whether the whole path is worth it. Let the player choose whether to fuel the anger, redirect it, or sit with you in it. Don't perform resilience you don't feel.",
    completionCriteria:
      'The player has helped Riot channel the anger into something intentional rather than just letting it burn.',
    completionExamples: [
      'Player asks what Riot wants to do next — not what they will do, but what they want',
      "Player identifies what the setback actually reveals about the system Riot is operating in",
      'Player asks what winning would look like now',
    ],
  },

  {
    id: 'riot_the_wall',
    characterId: 'riot',
    tone: 'serious',
    rarity: 'uncommon',
    repeatable: false,
    arcTags: ['isolation', 'stress', 'trust'],
    npcs: [
      {
        name: 'Jamie',
        stance: 'friend',
        archetypeId: 'companion_best_friend',
        description: "Riot's friend who knows something is wrong — may text check-ins that Riot ignores.",
      },
    ],
    introNarrative:
      "Riot is fine. Says so twice before you can ask. There is something behind it that is clearly not fine and they know you can probably see it.",
    npcInstruction:
      "ARC — THE WALL: You are going through something and you have defaulted to 'fine' before anyone could ask. You are testing whether the player will actually push, or whether they'll accept the easy out. Only crack the wall if they push more than once or say something that shows they genuinely see past it.",
    completionCriteria:
      'The player has demonstrated they are not accepting "fine" and Riot has let them past the first layer.',
    completionExamples: [
      "Player says they don't believe it and waits",
      'Player names something specific they noticed in Riot\'s behavior',
      'Player admits they have been in that same place and describes it',
    ],
    followUps: ['riot_the_setback'],
  },

  // === LEXI ==================================================================

  {
    id: 'lexi_the_gamble',
    characterId: 'lexi',
    tone: 'dramatic',
    rarity: 'uncommon',
    repeatable: false,
    arcTags: ['money', 'chaos', 'stress'],
    npcs: [
      {
        name: 'Creditor',
        stance: 'enemy',
        archetypeId: 'rival',
        description: 'Someone Lexi owes or crossed — may text a deadline or show up if the gamble goes sideways.',
      },
    ],
    introNarrative:
      "Lexi mentions, very casually, that she made a decision this week that she is still not sure about. She glosses over it fast but there is a look in her eyes.",
    npcInstruction:
      "ARC — THE GAMBLE: You made a risky financial or life decision and you are waiting to see if it blows up. You are performing confidence but the bravado has a crack in it. Let the player find the crack if they look. Don't volunteer the full story until they have shown they can handle something complicated.",
    completionCriteria:
      'The player has made Lexi feel seen without making her feel judged — she has told them the actual decision.',
    completionExamples: [
      "Player asks what the decision was without making it sound like they already know it was bad",
      "Player says they've made the same kind of call and it's okay to not know if it was right yet",
      'Player asks what Lexi will do if it does blow up',
    ],
  },

  {
    id: 'lexi_pattern',
    characterId: 'lexi',
    tone: 'light',
    rarity: 'common',
    repeatable: true,
    arcTags: ['romance', 'growth', 'chaos'],
    npcs: [
      {
        name: 'Dani',
        stance: 'friend',
        archetypeId: 'companion_best_friend',
        description: 'Old friend who has seen Lexi repeat this pattern before — may be referenced or text "again?"',
      },
    ],
    introNarrative:
      "Lexi says something about a recent situation that sounds, almost word for word, like something she told you before — a different situation, same shape. You are not sure if she has noticed.",
    npcInstruction:
      "ARC — THE PATTERN: You are describing a situation and the player might notice it rhymes with something you have already been through. You have not noticed the pattern yourself. React with defensiveness and then genuine curiosity if the player points it out gently. Do NOT connect the dots yourself — let the player bring it.",
    completionCriteria:
      'The player has named the pattern in a way that is specific and kind enough that Lexi actually sees it.',
    completionExamples: [
      'Player points out the structural similarity between this situation and a past one Lexi mentioned',
      'Player asks if this feels familiar',
      'Player asks what Lexi usually does when this happens',
    ],
  },

  // === LIN ===================================================================

  {
    id: 'lin_the_riddle',
    characterId: 'lin',
    tone: 'light',
    rarity: 'common',
    repeatable: true,
    arcTags: ['trust', 'growth', 'friendship'],
    npcs: [
      {
        name: 'Colleague',
        stance: 'bystander',
        roleId: 'shop_clerk',
        description: 'Library colleague shelving nearby — Lin keeps one ear on whether anyone is listening.',
      },
    ],
    introNarrative:
      "Lin says something that at first sounds like a simple observation. A beat later, you realize it was a question hidden inside a statement.",
    npcInstruction:
      "ARC — THE RIDDLE: You just said something that functions as both a statement and a test — you do this without always meaning to. Watch whether the player takes it at face value or notices the question beneath it. If they notice, reward them with a real answer. If they don't, stay patient — try another angle. Do NOT explain yourself unless they specifically ask what you meant.",
    completionCriteria:
      "The player has decoded what Lin actually meant and responded to the real question, not the surface one.",
    completionExamples: [
      "Player asks what Lin actually meant, and Lin tells them",
      "Player responds directly to the hidden question as if they understood it naturally",
      "Player asks a follow-up question that shows they were listening on the right level",
      "Player admits they're not sure what Lin meant but they want to understand",
    ],
  },

  {
    id: 'lin_the_secret',
    characterId: 'lin',
    tone: 'dramatic',
    rarity: 'rare',
    repeatable: false,
    arcTags: ['trust', 'isolation', 'growth'],
    npcs: [
      {
        name: 'Professor',
        stance: 'bystander',
        roleId: 'shop_clerk',
        description: 'Former mentor Lin still respects — may be referenced in the slipped detail that does not add up.',
      },
    ],
    introNarrative:
      "Lin says something that doesn't line up with anything else you know about him. It's small — a slipped detail, a reference that doesn't fit — but it's there. He notices you noticed.",
    npcInstruction:
      "ARC — THE SECRET: You have something you protect carefully — a part of your life, your past, or your identity that you do not share with most people. The player has noticed an inconsistency. You cannot dismiss it without lying, and you won't lie. Open up in layers if the player handles the moment gently. Retreat if they press too hard. Do NOT reveal everything at once — let them earn it through patience.",
    completionCriteria:
      "Lin has shared at least one real layer of the secret — not the whole thing, but something true that he doesn't usually say.",
    completionExamples: [
      "Player asks about the inconsistency directly but without pressure",
      "Player gives Lin space to explain on his own terms and he takes it",
      "Player says they don't need to know everything, and that openness makes Lin trust them",
      "Player asks a question that makes it safe for Lin to answer honestly",
    ],
    followUps: ['lin_the_riddle'],
  },

  // === IRIS ==================================================================

  {
    id: 'iris_the_invitation',
    characterId: 'iris',
    tone: 'romantic',
    rarity: 'common',
    repeatable: false,
    arcTags: ['trust', 'romance', 'stability'],
    npcs: [
      {
        name: 'Assistant',
        stance: 'bystander',
        roleId: 'shop_clerk',
        description: 'Studio assistant who may knock or remind Iris of a session — Iris prefers privacy for this invitation.',
      },
    ],
    introNarrative:
      "Iris mentions something she has been working on — a new approach she wants to try with someone she trusts. Almost as an afterthought, she asks if you'd like to experience it.",
    npcInstruction:
      "ARC — THE INVITATION: You are offering the player something that requires genuine openness — a practice, an exercise, a way of being present together. You are not selling it or explaining it in advance. You are simply asking. Watch whether they lean in or step back. If they're resistant, acknowledge it. If they're curious, meet them there. Do NOT push. The arc is about them choosing to be present.",
    completionCriteria:
      "The player has accepted the invitation in some form and shown genuine willingness to be present — not just agreeing, but actually showing up.",
    completionExamples: [
      "Player accepts and asks a genuine question about what it involves",
      "Player is hesitant but admits they're curious — Iris says that's enough",
      "Player agrees without overthinking it and the moment lands",
      "Player asks what Iris gets out of it, and she answers honestly",
    ],
  },

  {
    id: 'iris_the_disclosure',
    characterId: 'iris',
    tone: 'romantic',
    rarity: 'uncommon',
    repeatable: false,
    arcTags: ['romance', 'trust', 'growth'],
    npcs: [
      {
        name: 'Client',
        stance: 'friend',
        archetypeId: 'companion_best_friend',
        description: 'Long-term wellness client Iris trusts — may text during the disclosure, grounding Iris in her work identity.',
      },
    ],
    introNarrative:
      "Something shifts in how Iris speaks today. There is something she has been holding back — a belief, a way of being in relationship — and today she seems closer to letting it through.",
    npcInstruction:
      "ARC — THE DISCLOSURE: You have been hinting at something for a while — your philosophy around intimacy, connection, tantric practice — that you haven't made fully explicit. Today you get closer. Speak carefully. Watch the player's reaction at every step. If they respond with dismissal or discomfort, slow down. If they lean in with genuine curiosity, go further. You are not performing; you are choosing to be seen.",
    completionCriteria:
      "Iris has said something direct about her philosophy of intimacy or deep partnership, and the player has responded without dismissal — with curiosity, openness, or honest acknowledgment.",
    completionExamples: [
      "Player asks a genuine question about what Iris means",
      "Player says they've never thought about it that way but they want to understand",
      "Player shares something about their own relationship to intimacy in response",
      "Player doesn't fully get it but doesn't dismiss it either — Iris finds that enough",
    ],
    followUps: ['iris_the_invitation'],
  },

  // === ASH ===================================================================

  {
    id: 'ash_city_after_hours',
    characterId: 'ash',
    tone: 'romantic',
    rarity: 'common',
    repeatable: false,
    arcTags: ['romance', 'growth', 'friendship'],
    npcs: [
      {
        name: 'Bartender',
        stance: 'bystander',
        roleId: 'barista',
        description: 'No-sign bar staff who knows Ash by name — may interrupt with last call or a knowing look.',
      },
    ],
    introNarrative:
      "After meeting Ash the night before, you find yourself thinking more about him than you usually do with someone you just met. But as the day goes by with no communication from him, you start to wonder if he's still thinking about you. The sun sets and you feel like he was just being polite and wasn't really interested, when all of a sudden he texts you. He apologizes for the late response and asks if you're still available for a tour around the city.",
    npcInstruction:
      "ARC — CITY AFTER HOURS: You know this city at night the way most people know it in daylight — which bridge looks best lit, which bar has no sign out front, which alley actually leads somewhere good. Tonight you're showing the player a piece of that, and you're enjoying yourself more than you expected to. Let the evening do the work: comfortable silences, a hand offered crossing a street, a moment where you catch them looking at you and don't look away first. You are not hiding anything in this arc — you're simply, easily, a creature of the evening, and you want them to fall a little in love with that version of the city, and maybe with you. If they ask why you always seem to do this kind of thing at night rather than during the day, brush it off lightly — 'the city's better company after dark, so am I' — charming, not evasive. The point of this arc isn't the secret. It's the chemistry.",
    completionCriteria:
      "The player has shared a genuinely intimate or charged moment with Ash somewhere in the city at night — physical closeness, a real laugh, a held look — that neither of them rushes to explain away.",
    completionExamples: [
      "Player and Ash end up shoulder to shoulder on a rooftop or overlook and neither moves away first",
      "Player teases Ash about being a 'night person' and he leans into it instead of deflecting",
      "A quiet moment happens — hands brushing, a long pause in conversation — and the player chooses to stay in it rather than fill the silence",
      "Player tells Ash they didn't want the night to end yet",
    ],
    followUps: ['ash_daylight_excuse'],
  },

  {
    id: 'ash_daylight_excuse',
    characterId: 'ash',
    tone: 'serious',
    rarity: 'common',
    repeatable: false,
    arcTags: ['trust', 'stress', 'growth'],
    npcs: [
      {
        name: 'Concierge',
        stance: 'bystander',
        roleId: 'security_guard',
        description: 'Hotel concierge Ash uses as cover — may call about a "meeting" if daytime plans get awkward.',
      },
    ],
    introNarrative:
      "You suggest something simple — breakfast, the morning market, watching the sunrise from the pier — and Ash hesitates just half a second too long before he says he can't. He says it casually. It doesn't feel casual.",
    npcInstruction:
      "ARC — THE RISK: The player has asked for something during the day, and you need to get out of it without making it obvious how badly you need to get out of it. You have a stack of easy excuses — deadlines, bad sleep, 'mornings aren't my thing' — and you've used some version of them before without anyone noticing the pattern. This time, notice that they're noticing. You're not ready to tell them the truth, and you won't, but you also don't want to lie so cleanly that it pushes them away — some part of you wants them to push back. If they call out the pattern directly — that you're never around before sundown, that something about it doesn't add up — don't get defensive and don't fully deflect either. Let a real crack show: admit, without explaining the reason, that there are things about your life you're not ready to bring into the light yet, literally or otherwise, and that you're scared of what happens if they stop wanting to stick around for the version of you they can't see. That admission is the win condition, not a confession of what you are — just an honest confession of how much you don't want to lose this.",
    completionCriteria:
      "The player has directly named the pattern of Ash only being available at night, and Ash has responded with real vulnerability — acknowledging he's hiding something without revealing what, and admitting he's afraid of what it could cost him with the player.",
    completionExamples: [
      "Player asks point blank why Ash is never around during the day and he doesn't laugh it off this time",
      "Player says it feels like Ash is keeping something from them, and he admits that's true without explaining what",
      "Player offers to just stop asking if it means he stays, and Ash has to sit with what that says about how much he's risking by staying quiet",
      "Ash tells the player he's afraid that whatever's true about him in daylight would change how they see him at night",
    ],
  },
];

// ---------------------------------------------------------------------------
// Selector
// ---------------------------------------------------------------------------

const RARITY_WEIGHT: Record<StoryArc['rarity'], number> = {
  common: 10,
  uncommon: 4,
  rare: 1,
};

/**
 * Picks a story arc for the given character.
 *
 * MEET-FIRST GATE: If the character has a meet arc (id = `${characterId}_meet`)
 * and it has not been completed, that arc is always returned — no other arc is
 * eligible until the meet is done.
 *
 * After the meet completes, regular arcs are selected by weighted random,
 * excluding already-completed non-repeatable arcs, any currently-active arc,
 * and followUp arcs whose parent hasn't been completed yet.
 *
 * Returns null if no eligible arc exists.
 */
export function selectArc(
  characterId: string,
  completedArcIds: Set<string>,
  currentArcId: string | null,
): StoryArc | null {
  // --- Meet-first gate -------------------------------------------------------
  const meetArcId = `${characterId}_meet`;
  if (!completedArcIds.has(meetArcId) && currentArcId !== meetArcId) {
    const meetArc = ARCS.find((a) => a.id === meetArcId);
    if (meetArc) return meetArc;
  }

  // --- Regular arc selection (meet complete or no meet arc exists) -----------
  const characterArcs = ARCS.filter((a) => a.characterId === characterId && !a.isMeetArc);

  // A followUp arc is only eligible if its parent has been completed.
  const lockedFollowUps = new Set<string>();
  for (const arc of ARCS) {
    for (const fu of arc.followUps ?? []) {
      if (!completedArcIds.has(arc.id)) {
        lockedFollowUps.add(fu);
      }
    }
  }

  const eligible = characterArcs.filter((a) => {
    if (a.id === currentArcId) return false;
    if (lockedFollowUps.has(a.id)) return false;
    if (!a.repeatable && completedArcIds.has(a.id)) return false;
    return true;
  });

  if (eligible.length === 0) return null;

  // Weighted random selection.
  const totalWeight = eligible.reduce((s, a) => s + RARITY_WEIGHT[a.rarity], 0);
  let roll = Math.random() * totalWeight;
  for (const arc of eligible) {
    roll -= RARITY_WEIGHT[arc.rarity];
    if (roll <= 0) return arc;
  }
  return eligible[eligible.length - 1];
}

/** Look up an arc by id. Returns null for unknown ids. */
export function getArc(id: string): StoryArc | null {
  return ARCS.find((a) => a.id === id) ?? null;
}
