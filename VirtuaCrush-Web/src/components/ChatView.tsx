import { useEffect, useRef, useState } from 'react';
import { useChat } from '../hooks/useChat';
import { useUsage } from '../hooks/useUsage';
import { UpgradeModal } from './UpgradeModal';

interface ChatViewProps {
  characterId: string;
  characterName: string;
  greeting: string;
}

export function ChatView({ characterId, characterName, greeting }: ChatViewProps) {
  const [showUpgrade, setShowUpgrade] = useState(false);
  const { usage, refresh: refreshUsage } = useUsage();

  const {
    messages,
    send,
    stop,
    streaming,
    error,
    quotaExceeded,
    clearQuotaFlag,
  } = useChat({
    characterId,
    initialMessages: [{ id: 'greeting', role: 'assistant', content: greeting }],
    onDone: () => refreshUsage(),
    onQuotaExceeded: () => setShowUpgrade(true),
  });

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    send(input);
    setInput('');
  };

  const remainingText =
    usage && !usage.subscribed
      ? `${usage.remaining} of ${usage.limit} free messages left today`
      : usage?.subscribed
      ? 'Premium'
      : '';

  return (
    <>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="text-lg font-semibold text-white">{characterName}</h2>
          <span className="text-xs text-zinc-400">{remainingText}</span>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                  m.role === 'user'
                    ? 'bg-pink-500 text-white'
                    : 'bg-zinc-800 text-zinc-100'
                }`}
              >
                {m.content || (streaming && m.role === 'assistant' ? '…' : '')}
              </div>
            </div>
          ))}
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-red-900/40 px-4 py-2 text-sm text-red-200">
            Something went wrong: {error}
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSubmit} className="border-t border-white/10 p-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Message ${characterName}…`}
              disabled={streaming}
              className="flex-1 rounded-xl bg-zinc-800 px-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-pink-500"
              maxLength={4000}
            />
            {streaming ? (
              <button
                type="button"
                onClick={stop}
                className="rounded-xl bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="rounded-xl bg-pink-500 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-400 disabled:opacity-50"
              >
                Send
              </button>
            )}
          </div>
        </form>
      </div>

      <UpgradeModal
        open={showUpgrade || quotaExceeded}
        onClose={() => {
          setShowUpgrade(false);
          clearQuotaFlag();
        }}
        reason="quota"
      />
    </>
  );
}