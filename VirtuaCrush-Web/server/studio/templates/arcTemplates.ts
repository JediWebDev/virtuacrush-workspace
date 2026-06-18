/**
 * Starter story-arc scenario templates — one pool per tone is enough to bootstrap random.
 */
import type { ArcScenarioTemplate } from './types';

export const ARC_SCENARIO_TEMPLATES: ArcScenarioTemplate[] = [
  // --- light ---
  {
    id: 'arc_food_truck_hunt',
    label: 'Legendary Food Truck Hunt',
    tone: 'light',
    arcTags: ['social', 'friendship'],
    coPresent: true,
    settingTemplate: 'a sunny food-truck row by the waterfront',
    situationTemplate:
      `You and {{companionName}} are on an unofficial quest to find a food truck everyone online keeps hyping — ` +
      `but the pin keeps moving, the line is chaos, and a smug rival foodie keeps beating you to the best spots.`,
    playerSituationTemplate:
      `You're hungry, competitive, and along for the ride — free to suggest shortcuts or call out bad takes.`,
    npcInstructionTemplate:
      `{{companionName}} treats this like a serious culinary expedition — hyping every lead, rating each bite out of ten, ` +
      `and getting playfully dramatic when the rival shows up.`,
    introNarrativeTemplate:
      `The boardwalk smells like grilled onions and possibility. Somewhere out there, the perfect meal is waiting.`,
    completionCriteriaTemplate:
      `You find the legendary truck together and crown a winner — or get gloriously full trying.`,
    completionExamples: [
      'You both try the signature dish and declare a verdict',
      'The rival concedes you had better taste today',
    ],
    beginningInstruction: 'Ground the silly stakes — hunger, hype, and friendly rivalry.',
    middleInstruction: 'Escalate with wrong turns, long lines, or the rival one-upping you.',
    endInstruction: 'Pay off with a shared victory meal or a funny near-miss.',
    weight: 1,
  },
  {
    id: 'arc_stuck_elevator',
    label: 'Stuck Elevator Small Talk',
    tone: 'light',
    arcTags: ['social', 'stress'],
    coPresent: true,
    settingTemplate: 'a boutique hotel lobby during a power outage',
    situationTemplate:
      `You and {{companionName}} are stuck in a stalled elevator between floors during a brief power blip. ` +
      `The emergency phone works but help is "twenty minutes out."`,
    npcInstructionTemplate:
      `{{companionName}} keeps the mood weirdly fun — bad jokes, honest questions, and zero panic.`,
    completionCriteriaTemplate:
      `The elevator moves again after you've had a real conversation neither of you expected.`,
    weight: 1,
  },
  // --- romantic ---
  {
    id: 'arc_rooftop_stargaze',
    label: 'Rooftop Stargaze',
    tone: 'romantic',
    arcTags: ['romance', 'trust'],
    coPresent: true,
    settingTemplate: 'a rain-slick city rooftop at dusk',
    situationTemplate:
      `You and {{companionName}} snuck up to a rooftop after a group gathering wound down. ` +
      `City noise is distant; someone left a blanket and a half-finished thermos.`,
    npcInstructionTemplate:
      `{{companionName}} is softer than usual — curious, a little nervous, letting silences happen.`,
    introNarrativeTemplate:
      `The sky turns indigo. For once, neither of you is in a hurry.`,
    completionCriteriaTemplate:
      `You share something personal under the stars and the moment feels mutual — not forced.`,
    completionExamples: [
      'One of you admits interest and the other responds warmly',
      'You trade a vulnerable story and stay present with it',
    ],
    weight: 1,
  },
  // --- comedic ---
  {
    id: 'arc_mistaken_for_a_couple',
    label: 'Mistaken for a Couple',
    tone: 'comedic',
    arcTags: ['romance', 'comedic',],
    coPresent: true,
    settingTemplate: 'a crowded weekend street market filled with vendors and performers',
    situationTemplate:
      `You and {{companionName}} are browsing the market together when a cheerful stranger ` +
      `mistakes you for a couple and starts asking questions about your relationship. ` +
      `Before either of you can fully explain, the cheerful stanger offers you their tickets for a romantic cruise trip they can no longer make.`,
    npcInstructionTemplate:
      `{{companionName}} is flustered but trying to play it cool. They alternate between denying the misunderstanding ` +
      `and accidentally making it worse through awkward comments and nervous reactions.`,
    introNarrativeTemplate:
      `A vendor grins knowingly as you approach. "You two are adorable together," they say, loud enough for everyone nearby to hear.`,
    completionCriteriaTemplate:
      `The misunderstanding reaches a humorous peak before you and {{companionName}} share a genuine moment about why the assumption felt surprisingly believable.`,
    completionExamples: [
      'You accept the offer for the romantic cruise',
      'One of you declines the offer and explains the misunderstanding.',
    ],
    weight: 1,
  },
  // --- dramatic ---
  {
    id: 'arc_last_train',
    label: 'Last Train Decision',
    tone: 'dramatic',
    arcTags: ['conflict', 'romance'],
    coPresent: true,
    settingTemplate: 'a moonlit pier with carnival lights in the distance',
    situationTemplate:
      `You and {{companionName}} missed the last train home after an argument at a friend's party. ` +
      `You can wait an hour for a rideshare split, walk forty minutes, or call it and go separate ways.`,
    npcInstructionTemplate:
      `{{companionName}} is still heated but doesn't want the night to end badly — push for honesty, not performance.`,
    completionCriteriaTemplate:
      `You choose what happens next together and address the fight directly — not just the logistics.`,
    weight: 1,
  },
  // --- suspense ---
  {
    id: 'arc_escape_room_countdown',
    label: 'Escape Room Countdown',
    tone: 'suspenseful',
    arcTags: ['chaos', 'stress'],
    coPresent: true,
    settingTemplate: 'a dimly lit escape room facility after hours',
    situationTemplate:
      `You and {{companionName}} enter an escape room expecting a fun challenge, but the experience is far more convincing than either of you anticipated. ` +
      `Locked doors, cryptic messages, strange recordings, and a steadily ticking countdown create mounting pressure. ` +
      `Neither of you can solve the puzzles alone, and every clue seems connected to a larger mystery hidden within the facility.`,
    npcInstructionTemplate:
      `{{companionName}} is focused and determined but occasionally rattled by the intensity of the experience. ` +
      `They actively share discoveries, ask for your perspective, and rely on your help when the pressure begins to build.`,
    introNarrativeTemplate:
      `A heavy door slams shut behind you. Red digits illuminate above the exit: 60:00. Somewhere in the darkness, a recorded voice calmly says, "Containment failure detected."`,
    completionCriteriaTemplate:
      `You and {{companionName}} uncover the final sequence of clues and escape before time runs out, strengthening your trust and confidence in one another along the way.`,
    weight: 1,
  },
  // --- serious ---
  {
    id: 'arc_honest_checkin',
    label: 'Honest Check-In',
    tone: 'serious',
    arcTags: ['trust', 'growth'],
    coPresent: false,
    settingTemplate: 'a dimly lit bedroom with soft lighting and a warm atmosphere',
    situationTemplate:
      `{{companionName}} texted you out of nowhere: "can we talk?" — not angry, just heavy. ` +
      `You're on the phone / video chat, not in the same room.`,
    playerSituationTemplate:
      `You're willing to listen but won't accept guilt-trips; you can set boundaries.`,
    npcInstructionTemplate:
      `{{companionName}} is working up to something real — stress, family stuff, or doubt — and needs you steady, not fixing everything.`,
    completionCriteriaTemplate:
      `They say what's actually wrong and you reach a clear emotional landing — heard, supported, or honestly declined.`,
    weight: 1,
  },
  // --- kinky ---
  {
    id: 'arc_kinky_exploration',
    label: 'Kinky Exploration',
    tone: 'kinky',
    arcTags: ['kinky', 'erotic'],
    coPresent: true,
    settingTemplate: 'a BDSM dungeon with dim lighting and restraints',
    situationTemplate:
      `{{companionName}} is exploring their kinks and wants to share the experience with you. ` +
      `You're in a safe space and can explore your desires together.`,
    playerSituationTemplate:
      `You're open to exploring new experiences and can communicate your boundaries clearly.`,
    npcInstructionTemplate:
      `{{companionName}} is open about their desires and wants to explore them with you.`,
    completionCriteriaTemplate:
      `They climax sexually and you both feel satisfied.`,
    weight: 1,
  },
];

export function getArcScenario(id: string): ArcScenarioTemplate | undefined {
  return ARC_SCENARIO_TEMPLATES.find((t) => t.id === id);
}

export function arcScenariosForTone(tone: ArcScenarioTemplate['tone']): ArcScenarioTemplate[] {
  return ARC_SCENARIO_TEMPLATES.filter((t) => t.tone === tone);
}
