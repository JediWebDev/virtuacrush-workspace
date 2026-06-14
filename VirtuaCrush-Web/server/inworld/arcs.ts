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
// - npcInstruction: Injected verbatim into the director system prompt. Be
//   explicit and behavioral — the LLM follows instructions, not vibes.
// - completionCriteria: A concise evaluative criterion the director uses to
//   decide when arcStatus → "completed". One clear sentence.
// - completionExamples: 2-4 concrete examples grounding the evaluation.
// - arcTags: Intersect with SceneInterruption.tags to weight disruption
//   selection toward thematically resonant moments.
// - rarity weights: common=10, uncommon=4, rare=1 (arbitrary relative units).

export type NarrativeTag =
  // Interpersonal / Emotional
  | 'romance' | 'friendship' | 'conflict' | 'trust' | 'jealousy'
  // Environmental / Life
  | 'work' | 'family' | 'health' | 'money' | 'social'
  // Internal Psychological
  | 'stress' | 'growth' | 'isolation' | 'stability' | 'chaos';

export interface StoryArc {
  id: string;
  characterId: string;
  introNarrative: string;
  npcInstruction: string;
  completionCriteria: string;
  completionExamples: string[];
  tone: 'light' | 'serious' | 'romantic' | 'dramatic';
  rarity: 'common' | 'uncommon' | 'rare';
  repeatable: boolean;
  arcTags: NarrativeTag[];
  followUps?: string[];
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

  // === SERENA ================================================================

  {
    id: 'serena_big_audition',
    characterId: 'serena',
    tone: 'serious',
    rarity: 'common',
    repeatable: false,
    arcTags: ['work', 'stress', 'growth'],
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
 * Picks a story arc for the given character, excluding already-completed
 * non-repeatable arcs and any currently-active arc. Weights by rarity and
 * respects followUp unlock ordering (a followUp arc is only eligible after
 * its parent has been completed).
 *
 * Returns null if no eligible arc exists.
 */
export function selectArc(
  characterId: string,
  completedArcIds: Set<string>,
  currentArcId: string | null,
): StoryArc | null {
  const characterArcs = ARCS.filter((a) => a.characterId === characterId);

  // Collect all arcs that are listed as a followUp of something.
  const lockedFollowUps = new Set<string>();
  for (const arc of ARCS) {
    for (const fu of arc.followUps ?? []) {
      // A followUp arc is only unlocked if its parent has been completed.
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

/** Look up a specific arc by ID (returns null if not found). */
export function getArc(arcId: string): StoryArc | null {
  return ARCS.find((a) => a.id === arcId) ?? null;
}
