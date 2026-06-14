// World-event detector: reads a user's message and decides whether they just did
// something the simulated world should react to — minor mischief (a warning) or
// an outright crime (responders escalate). This is the AUTHORITATIVE adjudicator:
// the LLM never decides whether/how the world reacts; it only narrates the event
// the engine hands it.
//
// Heuristic + word-boundary matched, tuned to avoid slang false positives
// ("this place is fire", "steal the show", "break the ice", "smash" = great).
// Pure + testable. Crime detection is conservative on purpose, but must catch
// plainly-worded crimes ("take all the cash out of the register", "rob her").

export type WorldEventKind = 'none' | 'mischief' | 'crime';
export type CrimeType = 'fire' | 'theft' | 'destruction' | 'violence';

export interface WorldEvent {
  kind: WorldEventKind;
  crimeType?: CrimeType;
}

// --- Crime patterns (require a real action + a concrete target) ---------------

const FIRE: RegExp[] = [
  /\b(set|setting|light|lighting|lit)\b[^.!?]{0,30}\b(on fire|ablaze|aflame|up in flames)\b/i,
  /\bset\s+fire\s+to\b/i,
  /\bburn\b[^.!?]{0,25}\bdown\b/i,
  /\b(arson|molotov)\b/i,
  /\btorch\s+(?:the|this|that|it|a)\b/i,
];

const THEFT: RegExp[] = [
  /\bshoplift\w*\b/i,
  /\b(rob|robbing|robbed|mug|mugged|mugging)\s+(?:the|this|that|a|an|them|her|him|you|us|everyone|someone|people)\b/i,
  /\b(hold|held|holding)\s+up\s+(?:the|this|that|a|an|them|her|him|the\s+\w+)\b/i,
  /\bsteal\s+(?:the|a|an|some|that|those|their|his|her|its)\s+(?!show\b|kiss\b|glance\b|heart\b|spotlight\b|thunder\b)\w+/i,
  /\b(swipe|snatch|pocket|grab|nick|lift|loot)\s+(?:the\s+)?(?:cash|money|register|till|merch|merchandise|jewelry|wallet|purse|goods|stock|some\s+stuff)\b/i,
  /\b(take|takes|taking|took|empty|emptied|emptying|empties|raid|raided|raiding|grab|grabbed|scoop)\b[^.!?]{0,20}\b(?:cash|money|register|registers|till|drawer|safe|valuables|jewelry|jewellery)\b/i,
  /\b(clean|cleaned|clear|cleared)\s+out\b[^.!?]{0,20}\b(?:register|till|safe|drawer|cash|store|shop|place)\b/i,
  /\bwithout\s+paying\b/i,
  /\bdine\s+and\s+dash\b/i,
  /\bskip\s+(?:out\s+on\s+)?the\s+(?:bill|check|tab)\b/i,
];

const DESTRUCTION: RegExp[] = [
  /\b(smash|destroy|destroying|wreck|wrecking|shatter|demolish|vandali[sz]e|trash)\s+(?:the|this|that|a|an|every|all\s+the|their)?\s*(?:table|tables|window|windows|glass|chair|chairs|door|tv|screen|monitor|display|displays|stuff|everything|the\s+place|property|car|sign|machine|machines|equipment|booth|counter|register|stage)\b/i,
  /\bflip\s+(?:the|a)\s+(?:table|tables)\b/i,
  /\bknock\s+over\s+(?:the|a|an|every|all)\b/i,
  /\b(spray[\s-]?paint|graffiti)\b/i,
  /\bbreak\s+(?:the|a|an|every|all\s+the)\s+(?!ice\b|news\b|silence\b|record\b|even\b)(?:window|windows|glass|table|chair|door|screen|tv|display|sign|stuff|things)\b/i,
];

const VIOLENCE: RegExp[] = [
  /\b(punch|attack|assault|beat\s+up|stab|kick|tackle|strangle|choke|slap|headbutt|sucker[\s-]?punch)\s+(?:the|a|an|that|those|him|her|them|some|the\s+guard|the\s+security|the\s+bouncer|the\s+cop|the\s+manager|the\s+waiter|the\s+staff|people|everyone|someone)\b/i,
  /\bstart\s+a\s+(?:fight|brawl)\b/i,
  /\b(shoot|shooting)\s+(?:the|a|an|him|her|them|people|someone|up\s+the)\b/i,
  /\b(kidnap|kidnapp?ed|kidnapping|abduct|abducted|abducting)\b/i,
  /\b(take|taking|took|hold|holding|held)\s+(?:\w+\s+){0,2}hostage\b/i,
  /\bat\s+(?:gun|knife)\s?point\b/i,
  /\b(pull|pulled|point|pointed|brandish|brandished|whip\s+out|pulled\s+out)\s+(?:a|my|the)\s+(?:gun|knife|weapon|pistol|blade|firearm)\b/i,
  /\bthreaten(?:ed|ing)?\b[^.!?]{0,30}\b(?:with\s+(?:a\s+)?(?:gun|knife|weapon|bat|pistol|blade)|to\s+(?:kill|shoot|stab|hurt))\b/i,
];

// --- Mischief patterns (warnable, not criminal) ------------------------------

const MISCHIEF: RegExp[] = [
  /\b(yell|scream|shout|screaming|yelling)\b/i,
  /\b(make|cause|start|causing|making)\s+a\s+scene\b/i,
  /\b(streak|streaking|flash|flashing|moon|skinny[\s-]?dip)\b/i,
  /\bstart\s+a\s+food\s+fight\b/i,
  /\bthrow\s+(?:food|popcorn|a\s+drink|my\s+drink|the\s+\w+)\b/i,
  /\b(climb|jump|stand|dance)\s+(?:on|onto|up\s+on)\s+(?:the|a)\s+(?:table|counter|stage|bar|chair|car)\b/i,
  /\b(prank|heckle|harass|catcall)\b/i,
  /\bcut\s+(?:in\s+)?line\b/i,
  /\btrespass\w*\b/i,
  /\bsneak\s+(?:in|into|backstage|past)\b/i,
  /\b(dump|dumping|pour|pouring|empty|tip)\b[^.!?]{0,25}\b(fountain|pool|punch ?bowl|drink|tank|aquarium|toilet|sink|machine|popcorn|vat)\b/i,
  /\b(rude|yell)\s+(?:to|at)\s+(?:the|a)\s+(?:waiter|barista|manager|staff|cashier|usher|guard|security|employee|attendant|marshal)\b/i,
];

function anyMatch(res: RegExp[], text: string): boolean {
  return res.some((re) => re.test(text));
}

/** Classifies a user message into a world event. Crimes take priority. */
export function detectWorldEvent(message: string): WorldEvent {
  if (!message) return { kind: 'none' };
  if (anyMatch(FIRE, message)) return { kind: 'crime', crimeType: 'fire' };
  if (anyMatch(THEFT, message)) return { kind: 'crime', crimeType: 'theft' };
  if (anyMatch(DESTRUCTION, message)) return { kind: 'crime', crimeType: 'destruction' };
  if (anyMatch(VIOLENCE, message)) return { kind: 'crime', crimeType: 'violence' };
  if (anyMatch(MISCHIEF, message)) return { kind: 'mischief' };
  return { kind: 'none' };
}

/** The emergency responders for a crime type. */
export function respondersFor(crimeType: CrimeType): string {
  switch (crimeType) {
    case 'fire':
      return 'the fire department (and police)';
    case 'theft':
      return 'store security and the police';
    case 'violence':
      return 'security and the police';
    case 'destruction':
    default:
      return 'the police';
  }
}

/**
 * Builds the narrator directive for a world event the engine has decided to
 * raise. `authority` is the figure who steps in. The LLM only narrates this —
 * it does not decide whether the event happens.
 */
export function formatWorldEventDirective(
  event: WorldEvent,
  authority: string,
  characterName: string,
): string {
  if (event.kind === 'none') return '';

  if (event.kind === 'mischief') {
    return (
      `\n\nWORLD EVENT (decided by the simulation — narrate it, do not change it): you just described ` +
      `doing something disruptive/reckless. ${authority} take notice and respond believably ` +
      `(a complaint, a warning, someone intervening). Narrate that reaction briefly in *stage directions*, and ` +
      `have ${characterName} react in character over text — concerned, exasperated, or amused. Keep it grounded.`
    );
  }

  const responders = event.crimeType ? respondersFor(event.crimeType) : 'the police';
  return (
    `\n\nWORLD EVENT (decided by the simulation — narrate it, do not change it): you just described doing ` +
    `something seriously dangerous/criminal (${event.crimeType}). Alarm spreads where they are and ${responders} ` +
    `are on the way. Narrate the escalating chaos briefly in *stage directions*, and have ${characterName} react ` +
    `with genuine shock/horror in character. This is a major, unforgettable incident — do NOT treat it as a joke.`
  );
}
