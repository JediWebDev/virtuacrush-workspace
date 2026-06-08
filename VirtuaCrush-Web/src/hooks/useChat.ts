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

interface UseChatOptions {
  characterId: string;
  initialMessages?: Message[];
  onDone?: (remaining: number | null) => void;
  onQuotaExceeded?: (info?: { limit?: number; used?: number }) => void;
  onAffinityUpdate?: (score: number) => void;
  onChoice?: (choice: any) => void;
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
  onChoice,
}: UseChatOptions) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [affinityScore, setAffinityScore] = useState<number | null>(null);
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
            onDone?.(evt.data.remaining ?? null);
            if (typeof evt.data.affinityScore === 'number') {
              setAffinityScore(evt.data.affinityScore);
              onAffinityUpdate?.(evt.data.affinityScore);
            }
          } else if (evt.event === 'choice') {
            onChoice?.(evt.data);
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
    [characterId, streaming, onDone, onQuotaExceeded, onAffinityUpdate, onChoice],
  );

  const clearQuotaFlag = useCallback(() => setQuotaExceeded(false), []);

  return { messages, setMessages, send, stop, streaming, error, quotaExceeded, clearQuotaFlag, affinityScore };
}