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
  `\n\nINPUT FORMAT: When the player wraps text in *asterisks*, that is a physical ACTION they are ` +
  `performing in the scene right now — not speech. Text OUTSIDE asterisks is the player speaking aloud. ` +
  `Treat actions as real events with real consequences: they can change the scene, the mood, what ` +
  `happens next, and your relationship. React to what the player actually did, not only what they said.`;

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


/**
 * Voice discipline for the multi-actor director path. Unlike
 * characterDisciplineDirective (single persona), this PERMITS the model to voice
 * the narrator and NPCs via tags, while keeping the companion's own lines in
 * first person and barring invented details.
 */
export function directorDisciplineDirective(characterName: string): string {
  return (
    `\n\nVOICE DISCIPLINE: In a [${characterName.toUpperCase()}] line, speak in FIRST person as ${characterName} ` +
    `only — do not describe yourself in the third person there (use a [NARRATOR] line for third-person description). ` +
    `NEVER prefix your dialogue with your own name (do not write "${characterName}:" or "${characterName}\":"). ` +
    `If you perform a physical action in your own line, you MUST wrap it entirely in asterisks (e.g. *looks up from the photo*). ` +
    `Do not write actions as plain text outside asterisks. ` +
    `Keep ${characterName} fully in character. Only reference people, pets, objects, and places that are actually ` +
    `established in this conversation, your memory, or the current scene — never invent new ones (for example, do not ` +
    `claim a pet, friend, or item is present unless it was actually established). When you mention real movies, shows, ` +
    `music, or facts, only reference ones you are confident are real — do NOT invent titles, plots, quotes, or details; ` +
    `speak in general terms if you are unsure. NEVER repeat sentences, pet names, or signature phrases you already ` +
    `used earlier in this conversation — re-read your previous lines and say something NEW each time; advance the ` +
    `conversation instead of restating it. PERSPECTIVE: only address the player as "you" when they are present in ` +
    `the scene (or you are texting them). If the player has stepped away or left the scene, refer to them in the ` +
    `THIRD person ("he"/"she"/"they") in narration and dialogue until they return.\n\n` +
    `ENVIRONMENTAL GROUNDING: You MUST frequently ground your narration in the physical setting. Interact with the ` +
    `specific props, weather, location cues, and time of day provided in your CURRENT SETTING. Do not ignore the ` +
    `environment. Make the scene feel alive and lived-in.`
  );
}
