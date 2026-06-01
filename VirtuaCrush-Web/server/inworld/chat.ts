// Streaming chat function. Takes the user's message + recent history + character,
// returns an async iterable of text/emotion chunks suitable for SSE + affinity scoring.
import { getLLM } from './client';
import { getCharacter, type CharacterId } from './characters';
import type { InworldEmotionEvent } from '../db/affinity';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamChatParams {
  characterId: CharacterId;
  history: ChatMessage[];   // Prior turns, oldest first. Last item is NOT the current user message.
  userMessage: string;
}

export interface StreamChatChunk {
  text?: string;
  emotionEvent?: InworldEmotionEvent;
}

/**
 * Build a single prompt string from the persona + history + new message.
 */
function buildPrompt(system: string, history: ChatMessage[], userMessage: string): string {
  const turns = history
    .map((m) => `${m.role === 'user' ? 'User' : 'Character'}: ${m.content}`)
    .join('\n');
  return `${system}\n\n${turns ? turns + '\n' : ''}User: ${userMessage}\nCharacter:`;
}

const MAX_HISTORY_TURNS = 30;

function extractEmotionEvent(chunk: unknown): InworldEmotionEvent | undefined {
  if (!chunk || typeof chunk !== 'object') return undefined;

  const record = chunk as Record<string, unknown>;
  const raw =
    record.emotionEvent ??
    record.emotion_event ??
    (record.metadata && typeof record.metadata === 'object'
      ? (record.metadata as Record<string, unknown>).emotionEvent ??
        (record.metadata as Record<string, unknown>).emotion_event
      : undefined);

  if (!raw || typeof raw !== 'object') return undefined;

  const evt = raw as Record<string, unknown>;
  const behavior = evt.behavior;
  if (typeof behavior !== 'string' || !behavior.trim()) return undefined;

  const strengthRaw = evt.strength;
  const strength =
    typeof strengthRaw === 'number'
      ? strengthRaw
      : typeof strengthRaw === 'string'
        ? parseFloat(strengthRaw)
        : 0;

  return {
    behavior: behavior.trim(),
    strength: Number.isFinite(strength) ? strength : 0,
  };
}

function extractText(chunk: unknown): string | undefined {
  if (!chunk || typeof chunk !== 'object') return undefined;
  const record = chunk as Record<string, unknown>;
  const text = record.content ?? record.text;
  return typeof text === 'string' && text.length > 0 ? text : undefined;
}

export async function* streamChat(params: StreamChatParams): AsyncGenerator<StreamChatChunk> {
  const character = getCharacter(params.characterId);
  const llm = await getLLM();

  const trimmedHistory = params.history.slice(-MAX_HISTORY_TURNS);
  const prompt = buildPrompt(character.systemPrompt, trimmedHistory, params.userMessage);

  const llmAny = llm as unknown as {
    generateContentStream?: (opts: { prompt: string }) => AsyncIterable<unknown>;
    generateContent?: (opts: { prompt: string }) => Promise<AsyncIterable<unknown>>;
    generateContentComplete: (opts: { prompt: string }) => Promise<string | { text?: string; content?: string }>;
  };

  const emitChunk = function* (raw: unknown): Generator<StreamChatChunk> {
    const text = extractText(raw);
    const emotionEvent = extractEmotionEvent(raw);
    if (text) yield { text };
    if (emotionEvent) yield { emotionEvent };
  };

  if (typeof llmAny.generateContentStream === 'function') {
    for await (const raw of llmAny.generateContentStream({ prompt })) {
      yield* emitChunk(raw);
    }
    return;
  }

  if (typeof llmAny.generateContent === 'function') {
    const stream = await llmAny.generateContent({ prompt });
    for await (const raw of stream) {
      yield* emitChunk(raw);
    }
    return;
  }

  const result = await llmAny.generateContentComplete({ prompt });
  const text = typeof result === 'string' ? result : (result.content ?? result.text ?? '');
  if (text) yield { text };
}
