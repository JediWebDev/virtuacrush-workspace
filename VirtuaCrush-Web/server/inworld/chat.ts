// Streaming chat function. Takes the user's message + recent history + character,
// returns an async iterable of text chunks suitable for SSE.
import { getLLM } from './client';
import { getCharacter, type CharacterId } from './characters';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamChatParams {
  characterId: CharacterId;
  history: ChatMessage[];   // Prior turns, oldest first. Last item is NOT the current user message.
  userMessage: string;
}

/**
 * Build a single prompt string from the persona + history + new message.
 * Trade-off: the Inworld LLM primitive accepts either a raw `prompt` string
 * or a chat-style `messages` array. We use the string form here because it
 * works across every modelId without per-provider message-format quirks.
 * If you switch to a chat-completion model and want function calling or
 * vision later, swap this for the messages array form.
 */
function buildPrompt(system: string, history: ChatMessage[], userMessage: string): string {
  const turns = history
    .map((m) => `${m.role === 'user' ? 'User' : 'Character'}: ${m.content}`)
    .join('\n');
  return `${system}\n\n${turns ? turns + '\n' : ''}User: ${userMessage}\nCharacter:`;
}

/**
 * Trim history so we never blow past the model's context window.
 * 30 most-recent turns (~15 user + 15 assistant) keeps prompts well under 8k tokens
 * for normal chat. Bump this up if you're using a 128k context model and want
 * longer memory.
 */
const MAX_HISTORY_TURNS = 30;

export async function* streamChat(params: StreamChatParams): AsyncGenerator<string> {
  const character = getCharacter(params.characterId);
  const llm = await getLLM();

  const trimmedHistory = params.history.slice(-MAX_HISTORY_TURNS);
  const prompt = buildPrompt(character.systemPrompt, trimmedHistory, params.userMessage);

  // The Inworld Runtime LLM primitive exposes streaming via generateContentStream().
  // It returns an async iterable of { text } chunks. If your installed SDK
  // version differs, the fallback path below uses generateContentComplete().
  const llmAny = llm as unknown as {
    generateContentStream?: (opts: { prompt: string }) => AsyncIterable<{ text: string }>;
    generateContentComplete: (opts: { prompt: string }) => Promise<string | { text: string }>;
  };

  if (typeof llmAny.generateContentStream === 'function') {
    for await (const chunk of llmAny.generateContentStream({ prompt })) {
      if (chunk?.text) yield chunk.text;
    }
    return;
  }

  // Fallback: non-streaming. Still works, just no typing-effect on client.
  const result = await llmAny.generateContentComplete({ prompt });
  yield typeof result === 'string' ? result : result.text;
}