// Dialogue-only prompt builder.
//
// In the engine-authoritative design the backend owns the world: scene, story,
// movement, NPCs, and events are all simulated outside the LLM. The model's ONLY
// job is to voice the single character the player is talking to — its tone, voice
// style, and current emotional state. No scene description, no narrator, no other
// speakers, no multi-actor JSON. The reply is plain first-person text.
import { getCharacter, type CharacterId } from './characters';
import { getLore } from './lore';
import { formatPersonaTraitsBlock } from '../sim/traits';
import { emotionToneBlock, type EmotionState } from '../sim/emotions';
import { ROLEPLAY_INPUT_DIRECTIVE } from '../db/roleplay_util';
import type { ChatMessage } from './chat';

const SINGLE_VOICE_DIRECTIVE =
  `\n\nYou are this one character only. Reply in first person as yourself, in character. ` +
  `Use only your own words and your own physical actions (wrapped in *asterisks*). ` +
  `Do NOT narrate the scene, setting, time, weather, or what other people do. ` +
  `Do NOT speak or act for the player or any other character. ` +
  `Do NOT prefix your reply with a name or a [LABEL]. ` +
  `Reply in natural English. Keep it to a few sentences.`;

export interface DialoguePromptParams {
  characterId: CharacterId;
  displayName: string;
  /** Prior turns, oldest first. Does NOT include the current user message. */
  history: ChatMessage[];
  userMessage: string;
  /** Current emotional gauges, if known, so tone tracks how they feel. */
  emotions?: EmotionState | null;
  /** Whether the character's secret is already known to the player. */
  secretDiscovered?: boolean;
}

/**
 * Builds the single flat prompt string for one in-voice character reply:
 *   persona + voice + emotional state + recent history + the player's message.
 */
export function buildDialoguePrompt(params: DialoguePromptParams): string {
  const character = getCharacter(params.characterId);

  let voiceBlock = '';
  try {
    voiceBlock = formatPersonaTraitsBlock(getLore(params.characterId), {
      discovered: Boolean(params.secretDiscovered),
      revealNow: false,
    });
  } catch {
    /* custom character without authored lore — persona prompt is enough */
  }

  const emotionBlock = params.emotions ? emotionToneBlock(params.emotions, params.displayName) : '';

  const system =
    character.systemPrompt + voiceBlock + emotionBlock + SINGLE_VOICE_DIRECTIVE + ROLEPLAY_INPUT_DIRECTIVE;

  const transcript = params.history
    .map((m) => `${m.role === 'user' ? 'User' : params.displayName}: ${m.content}`)
    .join('\n');

  return `${system}\n\n${transcript ? transcript + '\n' : ''}User: ${params.userMessage}\n${params.displayName}:`;
}
