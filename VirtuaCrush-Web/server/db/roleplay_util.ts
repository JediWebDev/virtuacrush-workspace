// Roleplay framing directives injected into the chat prompt.
//
// Two concerns, both pure strings so they're trivially testable:
//   1. INPUT FORMAT — teaches the model how the USER's input is tagged: text
//      wrapped in *asterisks* is a physical ACTION the user performs in the
//      scene (with real consequences); everything else is the user SPEAKING
//      aloud. Pairs with the on-screen roleplay instructions that replaced the
//      old "Vibe" panel.
//   2. STAY-IN-ROLE — keeps the date character from (a) slipping into
//      third-person "narrator" voice about itself and (b) hallucinating people,
//      pets, or objects that were never established. These were the two most
//      common immersion breaks in testing (the character narrating itself, and
//      inventing a pet at the scene).

/** How the user's tagged input reaches the model + that actions carry weight. */
export const ROLEPLAY_INPUT_DIRECTIVE =
  `\n\nINPUT FORMAT: When the user wraps text in *asterisks*, that is a physical ACTION they are ` +
  `performing in the scene right now — not speech. Text OUTSIDE asterisks is the user speaking aloud. ` +
  `Treat actions as real events with real consequences: they can change the scene, the mood, what ` +
  `happens next, and your relationship. React to what the user actually did, not only what they said.`;

/** First-person discipline + anti-hallucination guardrail for the date character. */
export function characterDisciplineDirective(characterName: string): string {
  return (
    `\n\nSTAY IN ROLE: You are ${characterName} and ONLY ${characterName}. Speak and act in the FIRST ` +
    `person. Do NOT narrate the scene as an outside third-person narrator, and never write about ` +
    `yourself in the third person (no "${characterName} does X" — narration is not your job). Use a ` +
    `short *stage direction* in asterisks only for your OWN small gestures or expressions. Only ` +
    `reference people, pets, objects, and places that have actually been established in this ` +
    `conversation, your memory, or the current scene — do NOT invent or assume new ones. For example, ` +
    `do not claim a pet, friend, or item is present with you unless it was actually established here.`
  );
}

/** Convenience: both directives, in the order they should appear in the prompt. */
export function formatRoleplayDirectives(characterName: string): string {
  return ROLEPLAY_INPUT_DIRECTIVE + characterDisciplineDirective(characterName);
}
