// The "scene director": builds the prompt that turns one LLM call into a short,
// multi-actor tagged transcript. The ENGINE decides which actors are present and
// what just happened (passed in via the stage); the director only decides how it
// is voiced. Parsing of the result lives in script_util.ts.
import type { ChatMessage } from './chat';

export type ActorKind = 'companion' | 'narrator' | 'npc';
export interface Actor {
  tag: string;    // uppercase token used in [TAG]
  name: string;   // display name
  kind: ActorKind;
  brief?: string; // who they are / why present / what they do this turn
}

export interface DirectorStage {
  companionSystem: string; // the companion persona system prompt
  companionTag: string;    // e.g. "SERENA"
  companionName: string;   // e.g. "Serena"
  npcs: Actor[];           // engine-decided NPCs present this turn
  directives: string;      // situation + facts + roleplay + narration + event + memory blocks
  history: ChatMessage[];
  userMessage: string;     // the user's (action/speech) turn
}

const MAX_HISTORY_TURNS = 30;

/** Companion tag derived from a display name (single word, uppercased). */
export function companionTagFor(displayName: string): string {
  return (displayName || 'YOU').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'YOU';
}

export function buildDirectorPrompt(stage: DirectorStage): string {
  const turns = stage.history
    .slice(-MAX_HISTORY_TURNS)
    .map((m) => (m.role === 'user' ? `User: ${m.content}` : m.content))
    .join('\n');

  const npcLines = stage.npcs
    .map((n) => `- [${n.tag}] — ${n.name}.${n.brief ? ' ' + n.brief : ''} Speaks and acts only as themselves.`)
    .join('\n');

  const speakerList =
    `- [${stage.companionTag}] — you, ${stage.companionName}, speaking and acting in FIRST person. This is your default voice.\n` +
    `- [NARRATOR] — a neutral third-person narrator for non-verbal beats and what the world/others do. Third person ONLY, wrapped in *asterisks*, never first-person, never dialogue.` +
    (npcLines ? `\n${npcLines}` : '');

  return (
`${stage.companionSystem}${stage.directives}

=== SCENE FORMAT (follow exactly) ===
This is a live scene that may include more than just you. Write the next moment as one or more TAGGED lines, each beginning with a speaker tag in brackets:
${speakerList}

RULES:
- Every line MUST start with one of the tags above. Never use a tag that isn't listed, and never write a line for the User.
- By DEFAULT only [${stage.companionTag}] speaks — keep ordinary conversation to a single [${stage.companionTag}] line.
- Add a [NARRATOR] line only when there is a real non-verbal beat, action, or change in the scene to describe.
- Bring in another listed speaker ONLY when they are present and have a clear reason to act this turn.
- Keep the whole thing short (usually 1, up to 4 short lines). Stay strictly in each speaker's voice.

${turns ? turns + '\n' : ''}User: ${stage.userMessage}
`
  );
}
