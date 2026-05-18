import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Send, User, ArrowLeft, Loader2, Sparkles, LayoutGrid, X, Play, Lock, History, Search, Info } from "lucide-react";
import { Character, buildRivalrySystemContext } from "../types/character";
import SocialFeed from "./SocialFeed";

const AFFINITY_PER_MESSAGE = 4;
const MAX_AFFINITY = 100;

interface Message {
  id: string;
  text: string;
  sender: "user" | "bot";
  timestamp: Date;
}

type PrivateMessage = {
  id: string;
  title: string;
  locked: boolean;
  duration?: string;
};

const PRIVATE_MESSAGES: PrivateMessage[] = [
  { id: "audio-1", title: "Audio Message - 0:14", locked: false, duration: "0:14" },
  { id: "video-1", title: "Video Update", locked: true },
  { id: "pic-1", title: "Picture", locked: true },
];

const DEMO_AUDIO_MESSAGE = {
  title: "Audio Message - 0:14",
  caption: "I couldn't sleep, so I just wanted to say hi...",
};

const CHAT_HISTORY_ARCHIVE = [
  {
    id: "hist-1",
    date: "May 15, 2026",
    title: "Late night thoughts about the future",
    preview: "You: I keep thinking about where we'll be in five years...",
  },
  {
    id: "hist-2",
    date: "May 12, 2026",
    title: "Game day and chapter brunch plans",
    preview: "Callie: OMG you have to see this fit before brunch 🥂",
  },
  {
    id: "hist-3",
    date: "May 8, 2026",
    title: "Voice note ideas and study break",
    preview: "You: Send me a voice note when you get a sec?",
  },
  {
    id: "hist-4",
    date: "April 30, 2026",
    title: "First conversation",
    preview: "You: Hey — glad we matched on here.",
  },
];

interface Props {
  character: Character;
  onBack: () => void;
  onAffinityChange?: (characterId: string, affinity: number) => void;
  autoOpenMessageId?: string;
}

function PrivateMessagesInbox({ onPlayAudio }: { onPlayAudio: () => void }) {
  return (
    <div className="mb-6 w-full rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.03] dark:bg-white/[0.03] p-4 text-left">
      <h4 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
        Private Messages
      </h4>
      <ul className="space-y-2">
        {PRIVATE_MESSAGES.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              disabled={item.locked}
              title={item.locked ? "Subscription Required" : undefined}
              onClick={() => {
                if (!item.locked) {
                  onPlayAudio();
                }
              }}
              className={`relative flex w-full items-center gap-3 rounded-xl border border-black/[0.06] dark:border-white/[0.06] px-3 py-2.5 text-left transition-colors ${
                item.locked
                  ? "cursor-not-allowed"
                  : "hover:border-accent/25 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
              }`}
            >
              {item.locked ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl backdrop-blur-sm">
                  <Lock size={16} className="text-stone-600 dark:text-stone-400" />
                </div>
              ) : null}
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  item.locked ? "bg-stone-200 dark:bg-stone-800/60" : "bg-accent/15 text-accent"
                }`}
              >
                {item.locked ? (
                  <Lock size={14} className="text-stone-900 dark:text-stone-500" />
                ) : (
                  <Play size={14} fill="currentColor" />
                )}
              </span>
              <span className={`text-sm font-medium ${item.locked ? "text-stone-900 dark:text-stone-500" : "text-stone-700 dark:text-stone-200"}`}>
                {item.title}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ChatInterface({ character, onBack, onAffinityChange, autoOpenMessageId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showHistoryView, setShowHistoryView] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [feedOpen, setFeedOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeMessage, setActiveMessage] = useState<typeof DEMO_AUDIO_MESSAGE | null>(null);
  const navigate = useNavigate();
  const [affinity, setAffinity] = useState(character.currentAffinity);
  const scrollRef = useRef<HTMLDivElement>(null);

  const characterWithAffinity: Character = { ...character, currentAffinity: affinity };

  const openAudioMessage = () => setActiveMessage(DEMO_AUDIO_MESSAGE);

  useEffect(() => {
    if (!autoOpenMessageId) return;
    const item = PRIVATE_MESSAGES.find((m) => m.id === autoOpenMessageId);
    if (item && !item.locked) {
      setActiveMessage(DEMO_AUDIO_MESSAGE);
    }
  }, [autoOpenMessageId]);

  useEffect(() => {
    setAffinity(character.currentAffinity);
  }, [character.id, character.currentAffinity]);

  useEffect(() => {
    const welcomeMsg: Message = {
      id: "welcome",
      text: `Hey there, I'm ${character.name}, your ${character.role}. ${character.bio} What would you like to talk about?`,
      sender: "bot",
      timestamp: new Date()
    };
    setMessages([welcomeMsg]);
  }, [character]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [messages, isLoading]);

  const handleSend = async (overrideText?: string) => {
    const textToSend = overrideText || input;
    if (!textToSend.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: textToSend,
      sender: "user",
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    const nextAffinity = Math.min(MAX_AFFINITY, affinity + AFFINITY_PER_MESSAGE);
    setAffinity(nextAffinity);
    onAffinityChange?.(character.id, nextAffinity);

    const rivalryContext = buildRivalrySystemContext({
      ...character,
      currentAffinity: nextAffinity,
    });

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          characterPersona: character.persona,
          rivalryContext,
        })
      });

      if (!response.ok) {
         const errData = await response.json();
         throw new Error(errData.error || "Message failed to send. Try again.");
      }

      const data = await response.json();
      
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: data.text || "Something went wrong. Tap send again when you're ready.",
        sender: "bot",
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMsg]);
    } catch (error: unknown) {
      console.error("Chat Error:", error);
      const message = error instanceof Error ? error.message : "Message failed to send. Try again.";
      const errorMsg: Message = {
        id: "err-" + Date.now(),
        text: message.includes("failed") ? message : "Message failed to send. Try again.",
        sender: "bot",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const suggestions = [
    "How was your day?",
    "Send me a voice note idea.",
    "What's on your mind lately?",
    "Tell me something nobody else knows about you."
  ];

  const handleBack = () => {
    onBack();
    navigate("/");
  };

  const filteredHistory = CHAT_HISTORY_ARCHIVE.filter((item) => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      item.preview.toLowerCase().includes(q) ||
      item.date.toLowerCase().includes(q)
    );
  });

  return (
    <motion.div
      initial={{ opacity: 0, scale: 1.02 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="relative flex h-[calc(100vh-104px)] w-full flex-col overflow-hidden bg-stone-50 dark:bg-surface lg:grid lg:grid-cols-[300px_1fr_350px] lg:grid-rows-1 lg:flex-none"
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(201,113,125,0.12),transparent)]" />

      {/* Profile rail — dating / social profile feel */}
      <motion.div className="hidden w-full flex-col border-b border-black/[0.06] p-6 glass backdrop-blur-2xl lg:flex lg:h-full lg:overflow-y-auto lg:border-b-0 lg:border-r dark:border-white/[0.06]">
        <div className="mb-8 flex items-center justify-between">
            <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-2 text-sm font-medium text-stone-600 dark:text-stone-400 transition-colors hover:text-stone-800 dark:hover:text-stone-100"
            >
            <ArrowLeft size={16} />
            Back
            </button>
            <button
                type="button"
                onClick={() => setShowHistoryView((v) => !v)}
                className={`rounded-xl p-2 transition-all ${showHistoryView ? "bg-accent text-white" : "text-stone-600 dark:text-stone-400 hover:bg-black/[0.06] dark:hover:bg-white/[0.06] hover:text-stone-800 dark:hover:text-stone-100"}`}
                aria-label="Toggle chat history"
                aria-pressed={showHistoryView}
            >
                <History size={18} />
            </button>
        </div>

        <div className="flex flex-col items-center text-center">
          <motion.div 
            whileHover={{ scale: 1.02 }}
            className="relative mb-5 h-44 w-44 overflow-hidden rounded-[2rem] border border-black/10 dark:border-white/10 bg-stone-200 dark:bg-stone-800/40 p-1 shadow-xl shadow-black/20"
          >
            <img src={character.image} alt="" className="h-full w-full rounded-[1.75rem] object-cover" />
            <div className="absolute bottom-3 right-3 h-3.5 w-3.5 rounded-full border-2 border-stone-50 bg-emerald-400 dark:border-surface shadow-[0_0_0_2px_rgba(16,185,129,0.35)]" />
          </motion.div>
          
          <h2 className="mb-1 font-serif text-2xl font-bold text-stone-900 dark:text-stone-50">{character.name}</h2>
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.12em] text-accent">{character.role}</p>
          <span className="mb-5 inline-flex items-center rounded-full border border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-stone-600 dark:text-stone-300">
            Affinity {affinity}%
          </span>
          
          <div className="mb-6 w-full rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.03] dark:bg-white/[0.03] p-4 text-left">
            <h4 className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Vibe
            </h4>
            <div className="flex flex-wrap gap-2">
                {character.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-rose-100/95"
                  >
                    {tag}
                  </span>
                ))}
            </div>
          </div>

          <PrivateMessagesInbox onPlayAudio={openAudioMessage} />
        </div>

        <div className="mt-auto border-t border-black/[0.06] dark:border-white/[0.06] pt-6">
            <p className="text-center text-[11px] leading-relaxed text-stone-900 dark:text-stone-500">
              Private chat · Encrypted in transit
            </p>
        </div>
      </motion.div>

      {/* Main chat */}
      <motion.div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-stone-100/80 dark:bg-stone-950/40">
        <div className="z-10 flex shrink-0 items-center justify-between gap-2 border-b border-black/[0.06] dark:border-white/[0.06] bg-stone-50/70 px-4 py-3 backdrop-blur-xl dark:bg-surface/70 md:px-8 md:py-5">
            <div className="flex min-w-0 flex-1 items-center gap-2">
                <button
                  type="button"
                  onClick={handleBack}
                  className="mr-1 shrink-0 rounded-xl p-2 text-stone-600 transition-colors hover:bg-black/[0.06] hover:text-stone-800 dark:text-stone-400 dark:hover:bg-white/[0.06] dark:hover:text-stone-100 lg:hidden"
                  aria-label="Back to home"
                >
                  <ArrowLeft size={20} />
                </button>
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-accent/25">
                    <img src={character.image} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0">
                    <h3 className="truncate font-semibold text-stone-900 dark:text-stone-50">{character.name}</h3>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-500 dark:text-emerald-400/95">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                        Online now
                    </div>
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 lg:hidden">
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                className="rounded-xl border border-black/10 p-2 text-stone-600 transition-all hover:border-accent/30 hover:text-stone-800 dark:border-white/10 dark:text-stone-300 dark:hover:text-stone-100"
                aria-label="View profile"
              >
                <Info size={18} />
              </button>
              <button
                type="button"
                onClick={() => setFeedOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-black/10 bg-black/[0.04] px-2.5 py-2 text-xs font-semibold text-stone-600 transition-all hover:border-accent/30 hover:text-stone-800 dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-300 dark:hover:text-stone-100"
              >
                <LayoutGrid size={16} />
                <span className="hidden sm:inline">Feed</span>
              </button>
            </div>
        </div>

        {showHistoryView ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="sticky top-0 z-10 border-b border-black/[0.06] dark:border-white/[0.06] bg-stone-50/90 dark:bg-surface/90 px-5 py-4 backdrop-blur-xl md:px-8">
              <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-50">Chat History</h3>
              <div className="relative mt-3">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-900 dark:text-stone-500"
                />
                <input
                  type="search"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search past conversations..."
                  className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.04] py-2.5 pl-9 pr-4 text-sm text-stone-800 dark:text-stone-100 outline-none transition-colors placeholder:text-stone-500 focus:border-accent/35 focus:ring-2 focus:ring-accent/10"
                />
              </div>
            </div>
            <div className="no-scrollbar flex-1 overflow-y-auto p-4 md:p-6">
              {filteredHistory.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-900 dark:text-stone-500">No conversations match your search.</p>
              ) : (
                <ul className="space-y-1">
                  {filteredHistory.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setShowHistoryView(false)}
                        className="flex w-full flex-col gap-1 rounded-xl px-4 py-3 text-left transition-colors hover:bg-black/[0.04] dark:bg-white/[0.04]"
                      >
                        <span className="text-[11px] font-medium uppercase tracking-wide text-stone-900 dark:text-stone-500">
                          {item.date}
                        </span>
                        <span className="text-sm font-semibold text-stone-800 dark:text-stone-100">{item.title}</span>
                        <span className="line-clamp-2 text-sm text-stone-600 dark:text-stone-400">{item.preview}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <>
        <div
            ref={scrollRef}
            className="no-scrollbar flex-1 space-y-4 overflow-y-auto p-4 md:space-y-5 md:p-8"
        >
          {messages.length === 1 && (
            <div className="flex flex-col items-center justify-center space-y-6 py-16 text-center md:py-24">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10">
                    <Sparkles className="text-accent" size={26} />
                </div>
                <div className="space-y-2">
                    <h4 className="text-xl font-semibold text-stone-900 dark:text-stone-50">Say hi to {character.name}</h4>
                    <p className="mx-auto max-w-sm text-sm text-stone-600 dark:text-stone-400">Start a message or tap a suggestion below.</p>
                </div>
                <div className="flex max-w-lg flex-wrap justify-center gap-2">
                    {suggestions.map((s, i) => (
                        <button
                            type="button"
                            key={s}
                            onClick={() => handleSend(s)}
                            className="rounded-full border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.04] dark:bg-white/[0.04] px-4 py-2 text-xs font-medium text-stone-600 dark:text-stone-300 transition-all hover:border-accent/35 hover:text-stone-800 dark:hover:text-stone-100"
                            style={{ animationDelay: `${i * 80}ms` }}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </div>
          )}

          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex w-full ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`flex max-w-[88%] gap-2.5 md:max-w-[72%] ${msg.sender === "user" ? "flex-row-reverse" : "flex-row"}`}>
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    msg.sender === "user"
                      ? "bg-gradient-to-br from-accent to-violet-warm text-white shadow-md shadow-accent/20"
                      : "border border-black/10 dark:border-white/10 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200"
                  }`}
                >
                  {msg.sender === "user" ? <User size={16} /> : <span className="text-[11px]">{character.name.charAt(0)}</span>}
                </div>
                <div className={`min-w-0 space-y-1 ${msg.sender === "user" ? "items-end" : "items-start"} flex flex-col`}>
                    <div
                      className={`max-w-full px-4 py-3 text-[15px] leading-relaxed ${
                        msg.sender === "user"
                          ? "rounded-2xl rounded-tr-sm bg-gradient-to-br from-accent to-accent-deep text-white shadow-sm"
                          : "rounded-2xl rounded-tl-sm border border-black/[0.07] dark:border-white/[0.07] bg-stone-200 dark:bg-stone-800/90 text-stone-800 dark:text-stone-100 shadow-sm backdrop-blur-sm"
                      }`}
                    >
                    {msg.text}
                    </div>
                    <p className={`text-[10px] font-medium tabular-nums text-stone-900 dark:text-stone-500 ${msg.sender === "user" ? "pr-1 text-right" : "pl-1 text-left"}`}>
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>
              </div>
            </motion.div>
          ))}
          {isLoading && (
            <motion.div 
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start pl-1"
            >
               <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm border border-black/[0.07] dark:border-white/[0.07] bg-stone-200 dark:bg-stone-800/90 px-4 py-3 shadow-sm backdrop-blur-sm">
                    <span className="flex gap-1" aria-hidden>
                        <span className="h-2 w-2 animate-bounce rounded-full bg-stone-400 [animation-duration:0.55s]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-stone-400 [animation-delay:0.12s] [animation-duration:0.55s]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-stone-400 [animation-delay:0.24s] [animation-duration:0.55s]" />
                    </span>
                    <span className="text-sm text-stone-600 dark:text-stone-400">Typing…</span>
               </div>
            </motion.div>
          )}
        </div>

        {!isLoading && messages.length > 1 && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1 md:px-8">
                {suggestions.slice(0, 3).map((s) => (
                    <button
                        type="button"
                        key={s}
                        onClick={() => handleSend(s)}
                        className="whitespace-nowrap rounded-full border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.03] dark:bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-stone-600 dark:text-stone-400 transition-all hover:border-accent/25 hover:text-stone-700 dark:text-stone-200"
                    >
                        {s}
                    </button>
                ))}
            </div>
        )}

        <div className="border-t border-black/[0.05] dark:border-white/[0.05] bg-gradient-to-t from-surface to-transparent p-4 md:p-8 md:pt-6">
          <div className="relative mx-auto max-w-3xl">
            <div className="relative flex items-center gap-2">
                <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={isLoading ? "…" : `Message ${character.name}…`}
                disabled={isLoading}
                className="min-h-[52px] flex-1 rounded-[1.75rem] border border-black/10 bg-stone-200/80 py-3.5 pl-5 pr-14 text-[15px] text-stone-800 outline-none transition-all placeholder:text-stone-500 focus:border-accent/35 focus:ring-2 focus:ring-accent/10 dark:border-white/10 dark:bg-stone-900/60 dark:text-stone-100"
                />
                <button
                type="button"
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                className="absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-accent text-white shadow-md shadow-accent/25 transition-all hover:bg-accent-deep active:scale-95 disabled:opacity-45"
                >
                {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={19} />}
                </button>
            </div>
          </div>
        </div>
          </>
        )}
      </motion.div>
      {/* Desktop social feed */}
      <div className="hidden min-h-0 flex-col border-l border-black/[0.06] dark:border-white/[0.06] lg:flex">
        <SocialFeed character={characterWithAffinity} className="h-full w-full" isActive />
      </div>

      <AnimatePresence>
        {feedOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[55] bg-black/50 backdrop-blur-sm lg:hidden"
              onClick={() => setFeedOpen(false)}
              aria-hidden
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="absolute inset-y-0 right-0 z-[60] flex w-full max-w-[350px] flex-col border-l border-black/[0.08] dark:border-white/[0.08] bg-stone-50 dark:bg-surface shadow-2xl lg:hidden"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-black/[0.06] dark:border-white/[0.06] px-4 py-3">
                <span className="text-sm font-semibold text-stone-700 dark:text-stone-200">Feed</span>
                <button
                  type="button"
                  onClick={() => setFeedOpen(false)}
                  className="rounded-lg p-2 text-stone-600 dark:text-stone-400 transition-colors hover:bg-black/[0.06] dark:hover:bg-white/[0.06] hover:text-stone-800 dark:hover:text-stone-100"
                  aria-label="Close feed"
                >
                  <X size={20} />
                </button>
              </div>
              <SocialFeed character={characterWithAffinity} className="min-h-0 flex-1" isActive={feedOpen} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {profileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[55] bg-black/50 backdrop-blur-sm lg:hidden"
              onClick={() => setProfileOpen(false)}
              aria-hidden
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="absolute inset-y-0 left-0 z-[60] flex w-full max-w-[320px] flex-col border-r border-black/[0.08] dark:border-white/[0.08] bg-stone-50 dark:bg-surface shadow-2xl lg:hidden"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-black/[0.06] dark:border-white/[0.06] px-4 py-3">
                <span className="text-sm font-semibold text-stone-700 dark:text-stone-200">Profile</span>
                <button
                  type="button"
                  onClick={() => setProfileOpen(false)}
                  className="rounded-lg p-2 text-stone-600 transition-colors hover:bg-black/[0.06] hover:text-stone-800 dark:text-stone-400 dark:hover:bg-white/[0.06] dark:hover:text-stone-100"
                  aria-label="Close profile"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="no-scrollbar flex-1 overflow-y-auto p-6">
                <div className="flex flex-col items-center text-center">
                  <div className="relative mb-5 h-36 w-36 overflow-hidden rounded-[2rem] border border-black/10 bg-stone-200 p-1 shadow-xl shadow-black/10 dark:border-white/10 dark:bg-stone-800/40 dark:shadow-black/20">
                    <img src={character.image} alt="" className="h-full w-full rounded-[1.75rem] object-cover" />
                    <div className="absolute bottom-3 right-3 h-3.5 w-3.5 rounded-full border-2 border-stone-50 bg-emerald-400 dark:border-surface shadow-[0_0_0_2px_rgba(16,185,129,0.35)]" />
                  </div>
                  <h2 className="mb-1 font-serif text-2xl font-bold text-stone-900 dark:text-stone-50">{character.name}</h2>
                  <p className="mb-3 text-xs font-medium uppercase tracking-[0.12em] text-accent">{character.role}</p>
                  <span className="mb-5 inline-flex items-center rounded-full border border-black/10 bg-black/[0.04] px-3 py-1 text-[11px] font-semibold text-stone-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-300">
                    Affinity {affinity}%
                  </span>
                  <div className="w-full rounded-2xl border border-black/[0.06] bg-black/[0.03] p-4 text-left dark:border-white/[0.06] dark:bg-white/[0.03]">
                    <h4 className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Vibe</h4>
                    <div className="flex flex-wrap gap-2">
                      {character.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-rose-700 dark:text-rose-100/95"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <PrivateMessagesInbox
                    onPlayAudio={() => {
                      setProfileOpen(false);
                      openAudioMessage();
                    }}
                  />
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeMessage ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setActiveMessage(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="relative w-full max-w-md rounded-3xl border border-black/10 dark:border-white/10 bg-stone-50 dark:bg-surface p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setActiveMessage(null)}
                className="absolute right-4 top-4 rounded-lg p-1.5 text-stone-600 dark:text-stone-400 transition-colors hover:bg-black/[0.06] dark:hover:bg-white/[0.06] hover:text-stone-800 dark:hover:text-stone-100"
                aria-label="Close message"
              >
                <X size={20} />
              </button>

              <div className="mb-5 flex items-center gap-3 pr-8">
                <img
                  src={character.image}
                  alt=""
                  className="h-12 w-12 rounded-full object-cover ring-2 ring-accent/25"
                />
                <div className="text-left">
                  <p className="font-semibold text-stone-900 dark:text-stone-50">{character.name}</p>
                  <p className="text-xs text-stone-900 dark:text-stone-500">{activeMessage.title}</p>
                </div>
              </div>

              <div className="mb-5 flex h-14 items-end justify-center gap-1 rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.03] dark:bg-white/[0.03] px-4 py-3">
                {Array.from({ length: 28 }, (_, i) => (
                  <span
                    key={i}
                    className="w-1 rounded-full bg-accent/70"
                    style={{ height: `${28 + Math.sin(i * 0.55) * 22}%` }}
                  />
                ))}
              </div>

              <div className="mb-4 flex items-center gap-3">
                <button
                  type="button"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-md shadow-accent/25"
                  aria-label="Play audio message"
                >
                  <Play size={18} fill="currentColor" />
                </button>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-1/3 rounded-full bg-accent" />
                </div>
                <span className="text-xs tabular-nums text-stone-900 dark:text-stone-500">0:14</span>
              </div>

              <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-300">{activeMessage.caption}</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

    </motion.div>
  );
}
