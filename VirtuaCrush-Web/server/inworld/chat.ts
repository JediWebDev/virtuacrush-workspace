// Streaming chat function. Takes the user's message + recent history + character,
// returns an async iterable of text chunks suitable for SSE.
//
// LLM calls are routed through the provider layer (../llm), so the underlying
// model is swappable by env (Inworld today, OpenRouter/self-hosted tomorrow).
import { getCharacter, type CharacterId } from './characters';
import { completePrompt, streamPrompt } from '../llm';
import type { InworldEmotionEvent } from '../db/affinity';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamChatParams {
  characterId: CharacterId;
  history: ChatMessage[];   // Prior turns, oldest first. Last item is NOT the current user message.
  userMessage: string;
  memoryContext?: string;   // Long-term memory block injected into the system prompt (RAG).
  systemOverride?: string;  // Replaces the character persona (e.g. the jail narrator).
}

export interface StreamChatChunk {
  text?: string;
  emotionEvent?: InworldEmotionEvent;
}

/**
 * Build a single prompt string from the persona + history + new message.
 */
function buildPrompt(
  system: string,
  history: ChatMessage[],
  userMessage: string,
  memoryContext?: string,
): string {
  const turns = history
    .map((m) => `${m.role === 'user' ? 'User' : 'Character'}: ${m.content}`)
    .join('\n');
  const systemWithMemory = memoryContext ? `${system}${memoryContext}` : system;
  return `${systemWithMemory}\n\n${turns ? turns + '\n' : ''}User: ${userMessage}\nCharacter:`;
}

const MAX_HISTORY_TURNS = 30;

export async function* streamChat(params: StreamChatParams): AsyncGenerator<StreamChatChunk> {
  const character = getCharacter(params.characterId);
  const trimmedHistory = params.history.slice(-MAX_HISTORY_TURNS);
  const prompt = buildPrompt(
    params.systemOverride ?? character.systemPrompt,
    trimmedHistory,
    params.userMessage,
    params.memoryContext,
  );
  for await (const text of streamPrompt(prompt)) {
    if (text) yield { text };
  }
}

// Re-export the provider entry points so existing import sites keep working.
export { completePrompt, streamPrompt };
