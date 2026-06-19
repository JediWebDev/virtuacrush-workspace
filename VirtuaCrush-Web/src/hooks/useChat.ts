// SSE-based streaming chat hook.
//
// Why fetch+ReadableStream instead of EventSource?
//   - EventSource only supports GET. We need POST to send the message body.
//   - This pattern is what the Vercel AI SDK uses under the hood.
//
// Returns:
//   - messages:      current conversation array (user + assistant turns)
//   - send(text):    sends a new user message, streams the assistant reply
//   - streaming:     true while the assistant is mid-response
//   - error:         null or last error code
//   - quotaExceeded: true if the server returned 402 (cap hit)
//   - stop():        abort the in-flight stream
import { useCallback, useRef, useState } from 'react';

export type Role = 'user' | 'assistant';
export interface Message {
  id: string;
  role: Role;
  content: string;
}

/** LLM-suggested next move for the player (free-roam choice buttons). */
export interface ReplyChoice {
  label: string;
  userMessage: string;
}

/** Fired when the server finishes a streamed reply (quota, affinity, arc badge, etc.). */
export interface ChatDoneInfo {
  remaining: number | null;
  affinityScore?: number;
  affinityAwarded?: number;
  earnedBadge?: { title: string; description: string } | null;
  meetArcComplete?: boolean;
}

interface UseChatOptions {
  characterId: string;
  initialMessages?: Message[];
  onDone?: (info: ChatDoneInfo) => void;
  onQuotaExceeded?: (info?: { limit?: number; used?: number }) => void;
  onAffinityUpdate?: (score: number) => void;
  /** Called when the character autonomously posted to their feed this turn. */
  onCharacterPosted?: () => void;
}

interface SSEEvent {
  event: string;
  data: any;
}

/**
 * Parses an SSE stream from a fetch Response into an async iterator of events.
 * Each event has shape: `event: <name>\ndata: <json>\n\n`
 */
async function* parseSSE(response: Response): AsyncGenerator<SSEEvent> {
  if (!response.body) throw new Error('no response body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE messages are separated by a blank line (\n\n).
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      let event = 'message';
      const dataLines: string[] = [];
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;

      let data: any = dataLines.join('\n');
      try { data = JSON.parse(data); } catch { /* leave as string */ }
      yield { event, data };
    }
  }
}

export function useChat({
  characterId,
  initialMessages = [],
  onDone,
  onQuotaExceeded,
  onAffinityUpdate,
  onCharacterPosted,
}: UseChatOptions) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [affinityScore, setAffinityScore] = useState<number | null>(null);
  const [replyChoices, setReplyChoices] = useState<ReplyChoice[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;

      setError(null);
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
      };
      const assistantId = crypto.randomUUID();
      const assistantStub: Message = { id: assistantId, role: 'assistant', content: '' };

      // Optimistically add both turns. We'll fill assistantStub as chunks arrive.
      setMessages((prev) => [...prev, userMsg, assistantStub]);
      // Clear last turn's suggestions while the next reply is generated.
      setReplyChoices([]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch('/api/chat/stream', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            characterId,
            message: trimmed,
            // We don't send history; server loads it from DB. Saves bandwidth
            // and ensures cross-device consistency.
          }),
          signal: controller.signal,
        });

        if (res.status === 402) {
          // Quota exceeded. Roll back the optimistic messages and flag the UI.
          setMessages((prev) => prev.filter((m) => m.id !== userMsg.id && m.id !== assistantId));
          setQuotaExceeded(true);
          let info: { limit?: number; used?: number } | undefined;
          try { const j = await res.json(); info = { limit: j?.limit, used: j?.used }; } catch { /* ignore */ }
          onQuotaExceeded?.(info);
          return;
        }
        if (res.status === 401) {
          setError('unauthorized');
          setMessages((prev) => prev.filter((m) => m.id !== userMsg.id && m.id !== assistantId));
          return;
        }
        if (!res.ok) {
          setError(`http_${res.status}`);
          return;
        }

        for await (const evt of parseSSE(res)) {
          if (evt.event === 'chunk') {
            const text: string = evt.data.text ?? '';
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + text } : m)),
            );
          } else if (evt.event === 'done') {
            const d = evt.data ?? {};
            onDone?.({
              remaining: d.remaining ?? null,
              affinityScore: typeof d.affinityScore === 'number' ? d.affinityScore : undefined,
              affinityAwarded: typeof d.affinityAwarded === 'number' ? d.affinityAwarded : undefined,
              earnedBadge: d.earnedBadge ?? null,
              meetArcComplete: d.meetArcComplete === true,
            });
            if (typeof d.affinityScore === 'number') {
              setAffinityScore(d.affinityScore);
              onAffinityUpdate?.(d.affinityScore);
            }
            if (Array.isArray(evt.data.choices)) setReplyChoices(evt.data.choices as ReplyChoice[]);
            if (evt.data.posted) onCharacterPosted?.();
          } else if (evt.event === 'error') {
            setError(evt.data.message ?? 'stream_error');
          }
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          console.error('[useChat] fetch error', e);
          setError('network_error');
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [characterId, streaming, onDone, onQuotaExceeded, onAffinityUpdate, onCharacterPosted],
  );

  const clearQuotaFlag = useCallback(() => setQuotaExceeded(false), []);
  const clearReplyChoices = useCallback(() => setReplyChoices([]), []);

  return { messages, setMessages, send, stop, streaming, error, quotaExceeded, clearQuotaFlag, affinityScore, replyChoices, clearReplyChoices };
}