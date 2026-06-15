import React, { useState, useEffect, useRef } from "react";
import { useChat } from "../hooks/useChat";
import { fetchGreeting, fetchCharacterState, respondToDesire, fetchChatHistory, travel, type CharacterState, type ChatHistoryDay, type TravelResult } from "../lib/api";
import { splitNarration } from "../lib/narration";
import { parseScript } from "../lib/script";
import ActivityLog from "./ActivityLog";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Send, User, ArrowLeft, Loader2, Sparkles, LayoutGrid, X, History, Search, Info, Heart, BookMarked } from "lucide-react";
import { Character } from "../types/character";
import type { UserTier } from "../types/subscription";
import SocialFeed from "./SocialFeed";
import CityMap from "./CityMap";
import UpgradeToast from "./UpgradeToast";
import SecretCard from "./SecretCard";
import DesireEventCard from "./DesireEventCard";
import PackList from "./PackList";
import ChoiceButtons from "./ChoiceButtons";
import { getActivePackSession, greetPackSession, abandonPackSession, fetchPackStories, type PackSession, type PackChoice, type PackStory } from "../lib/api";
import { parseSSE } from "../lib/sse";
import NoticeToast from "./NoticeToast";

function formatHistoryDate(day: string): string {
  // day is YYYY-MM-DD; anchor at noon to avoid timezone date shifts.
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

interface Props {
  character: Character;
  onBack: () => void;
  onAffinityChange?: (characterId: string, affinity: number) => void;
  userTier: UserTier;
}

export default function ChatInterface({ character, onBack, onAffinityChange, userTier }: Props) {
  const [affinity, setAffinity] = useState(character.currentAffinity);
  const [quotaToast, setQuotaToast] = useState(false);
  const [quotaLimit, setQuotaLimit] = useState<number | null>(null);
  const { messages, setMessages, send: sendMessage, streaming: isLoading } = useChat({
    characterId: character.id,
    initialMessages: [],
    onAffinityUpdate: (score) => {
      setAffinity(score);
      onAffinityChange?.(character.id, score);
    },
    onQuotaExceeded: (info) => { setQuotaLimit(info?.limit ?? null); setQuotaToast(true); },
    onDone: () => {
      // Refresh the status strip after each reply.
      fetchCharacterState(character.id)
        .then((st) => setStoryState(st))
        .catch(() => { /* non-fatal */ });
    },
  });

  const [input, setInput] = useState("");
  const [greetingLoading, setGreetingLoading] = useState(true);
  const [showHistoryView, setShowHistoryView] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyDays, setHistoryDays] = useState<ChatHistoryDay[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [packStories, setPackStories] = useState<PackStory[] | null>(null);
  const [feedOpen, setFeedOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [storyState, setStoryState] = useState<CharacterState | null>(null);
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);
  // Travel / city map
  const [playerLocation, setPlayerLocation] = useState<string | null>(null);
  const [isTraveling, setIsTraveling] = useState(false);
  const navigate = useNavigate();

  // Pack mode
  const [activePackSession, setActivePackSession] = useState<PackSession | null>(null);
  const [activeThread, setActiveThread] = useState<'freeRoam' | 'pack'>('freeRoam');
  const [packMessages, setPackMessages] = useState<{ id: string; role: 'user' | 'assistant'; content: string }[]>([]);
  const [packChoices, setPackChoices] = useState<PackChoice[] | null>(null);
  const [packLoading, setPackLoading] = useState(false);
  const [packCompleted, setPackCompleted] = useState(false);
  const packAbortRef = useRef<AbortController | null>(null);
  // Completion celebration: affinity-earned toast, "saved to history" toast,
  // and a timer that auto-closes the finished story tab.
  const [affinityToast, setAffinityToast] = useState<{ open: boolean; amount: number }>({ open: false, amount: 0 });
  const [historyToast, setHistoryToast] = useState<{ open: boolean; title: string }>({ open: false, title: '' });
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore an in-progress story when the chat is (re)opened so the Story tab
  // survives navigating away and coming back. Only ACTIVE sessions are
  // restored; completed/abandoned stories stay closed.
  useEffect(() => {
    let cancelled = false;
    // Reset pack UI when switching characters.
    if (completeTimerRef.current) { clearTimeout(completeTimerRef.current); completeTimerRef.current = null; }
    setActivePackSession(null);
    setPackMessages([]);
    setPackChoices(null);
    setPackCompleted(false);
    setActiveThread('freeRoam');
    setAffinityToast({ open: false, amount: 0 });
    setHistoryToast({ open: false, title: '' });

    (async () => {
      try {
        const session = await getActivePackSession(character.id);
        if (cancelled || !session) return;
        setActivePackSession(session);
        // Rehydrate the thread's transcript + current choices.
        const greet = await greetPackSession(session.sessionId);
        if (cancelled) return;
        const msgs: { id: string; role: 'user' | 'assistant'; content: string }[] = [];
        if (greet.hasHistory && greet.history?.length) {
          greet.history.forEach((m, i) =>
            msgs.push({ id: `pack-history-${i}`, role: m.role, content: m.content }),
          );
        } else if (greet.introNarrative) {
          msgs.push({ id: 'pack-intro', role: 'assistant', content: `[NARRATOR] ${greet.introNarrative}` });
        }
        setPackMessages(msgs);
        setPackChoices(greet.choices ?? null);
      } catch {
        /* no active story — non-fatal */
      }
    })();

    return () => {
      cancelled = true;
      if (completeTimerRef.current) { clearTimeout(completeTimerRef.current); completeTimerRef.current = null; }
    };
  }, [character.id]);

  const handleDesireRespond = async (choice: "encourage" | "redirect" | "decline") => {
    if (!storyState?.pendingEvent) return;
    try {
      const r = await respondToDesire(character.id, choice);
      if (typeof r.affinity === "number") {
        setAffinity(r.affinity);
        onAffinityChange?.(character.id, r.affinity);
      }
    } catch {
      /* non-fatal */
    }
    fetchCharacterState(character.id).then(setStoryState).catch(() => {});
  };
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setGreetingLoading(true);
    setMessages([]);

    async function initGreeting() {
      try {
        const result = await fetchGreeting(character.id);

        if (cancelled) return;

        // Scene header: VN-style opening narration from the scene engine,
        // rendered as a narrator bubble above the conversation.
        const sceneMsgs = result.sceneHeader
          ? [{ id: 'scene-header', role: 'assistant' as const, content: `[NARRATOR] ${result.sceneHeader}` }]
          : [];

        if (result.hasHistory) {
          if (result.history?.length) {
            setMessages([
              ...sceneMsgs,
              ...result.history.map((m, i) => ({
                id: `history-${i}`,
                role: m.role,
                content: m.content,
              })),
            ]);
          } else if (sceneMsgs.length) {
            setMessages(sceneMsgs);
          }
          setGreetingLoading(false);
          return;
        }

        if (result.greeting) {
          setMessages([
            ...sceneMsgs,
            {
              id: 'greeting',
              role: 'assistant',
              content: result.greeting,
            },
          ]);
        }
      } catch (err) {
        console.error('[greet] failed:', err);
      } finally {
        if (!cancelled) setGreetingLoading(false);
      }
    }

    initGreeting();
    return () => { cancelled = true; };
  }, [character.id, setMessages]);

  // Fetch the character's current story-engine state for the status strip.
  useEffect(() => {
    let cancelled = false;
    setStoryState(null);
    fetchCharacterState(character.id)
      .then((s) => {
        if (!cancelled) {
          setStoryState(s);
          // Seed the map's current location from persisted state.
          setPlayerLocation(s.sceneLocation ?? null);
        }
      })
      .catch((err) => console.error('[state] fetch failed:', err));
    return () => { cancelled = true; };
  }, [character.id]);

  // Travel handler — called by CityMap when the player clicks a pin.
  const handleTravel = async (locationSlug: string) => {
    if (isTraveling) return;
    setIsTraveling(true);
    try {
      const result: TravelResult = await travel(character.id, locationSlug);
      const newSlug = locationSlug === "player_home" ? null : locationSlug;
      setPlayerLocation(newSlug);
      // Inject a narrator travel message into the chat.
      const locationName = result.location.name;
      const travelMsg = result.sceneHeader
        ? `[NARRATOR] You're now at ${locationName}. ${result.sceneHeader}`
        : `[NARRATOR] You travel to ${locationName}.`;
      setMessages((prev) => [
        ...prev,
        { id: `travel-${Date.now()}`, role: "assistant" as const, content: travelMsg },
      ]);
    } catch (err: any) {
      const detail = err?.body?.error === "affinity_too_low"
        ? `You need ${err?.body?.required} affinity to visit here (you have ${err?.body?.current}).`
        : "Couldn't travel there right now.";
      setMessages((prev) => [
        ...prev,
        { id: `travel-err-${Date.now()}`, role: "assistant" as const, content: `[NARRATOR] ${detail}` },
      ]);
    } finally {
      setIsTraveling(false);
    }
  };

  const characterWithAffinity: Character = { ...character, currentAffinity: affinity };

  useEffect(() => {
    setAffinity(character.currentAffinity);
  }, [character.id, character.currentAffinity]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [messages, isLoading, packMessages, packLoading]);

  // 2. Refactored handleSend using the hook
  const handleSend = async (overrideText?: string) => {
    const textToSend = overrideText || input;
    const busy = activeThread === 'pack' ? packLoading : isLoading;
    if (!textToSend.trim() || busy) return;
    setInput("");
    if (activeThread === 'pack' && activePackSession) {
      void sendPackMessage(textToSend);
    } else {
      await sendMessage(textToSend);
    }
  };

  const handlePackStart = (session: PackSession & { introNarrative?: string | null }) => {
    setActivePackSession(session);
    setPackCompleted(false);
    const msgs: { id: string; role: 'user' | 'assistant'; content: string }[] = [];
    if (session.introNarrative) {
      msgs.push({ id: 'pack-intro', role: 'assistant', content: `[NARRATOR] ${session.introNarrative}` });
    }
    setPackMessages(msgs);
    setPackChoices((session as { choices?: PackChoice[] | null }).choices ?? null);
    setActiveThread('pack');
  };

  // Resume the already-loaded in-progress story (just switch to its tab).
  const handlePackResume = () => {
    if (!activePackSession) return;
    setActiveThread('pack');
  };

  // Abandon the active story so a new one can be started.
  const handlePackAbandon = async () => {
    if (!activePackSession) return;
    const sid = activePackSession.sessionId;
    setActivePackSession(null);
    setPackMessages([]);
    setPackChoices(null);
    setPackCompleted(false);
    setActiveThread('freeRoam');
    try { await abandonPackSession(sid); } catch { /* non-fatal */ }
  };

  // Close a FINISHED story tab: clear the pack thread, return to Free Roam, and
  // announce that the story was archived to chat history.
  const closeFinishedStory = (storyTitle: string) => {
    setActivePackSession(null);
    setPackMessages([]);
    setPackChoices(null);
    setPackCompleted(false);
    setActiveThread('freeRoam');
    setHistoryToast({ open: true, title: storyTitle });
  };

  // Completion sequence: bump the affinity bar + toast the reward, then after a
  // beat (so the player reads the ending) auto-close the tab and note the save.
  const finishPackStory = (info: { affinityAwarded?: number; affinity?: number }) => {
    setPackCompleted(true);
    setPackChoices(null);
    if (typeof info.affinity === 'number') {
      setAffinity(info.affinity);
      onAffinityChange?.(character.id, info.affinity);
    }
    const amount = info.affinityAwarded ?? 0;
    if (amount > 0) setAffinityToast({ open: true, amount });
    const storyTitle = activePackSession?.pack?.title ?? 'Your story';
    if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    completeTimerRef.current = setTimeout(() => {
      completeTimerRef.current = null;
      closeFinishedStory(storyTitle);
    }, 3800);
  };

  const sendPackMessage = async (text: string, advanceNode?: string) => {
    if (!activePackSession || packLoading || packCompleted) return;
    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();
    setPackMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: text },
      { id: assistantMsgId, role: 'assistant', content: '' },
    ]);
    setPackChoices(null);
    setPackLoading(true);
    const controller = new AbortController();
    packAbortRef.current = controller;

    // Replace the streaming assistant bubble with a narrator note (used for
    // any error path so the AI never silently "stops typing" with a blank bubble).
    const setNarratorNote = (note: string) =>
      setPackMessages((prev) => prev.map((m) =>
        m.id === assistantMsgId ? { ...m, content: `[NARRATOR] ${note}` } : m
      ));

    let gotChunk = false;
    let streamFailed = false;
    try {
      const res = await fetch(`/api/packs/session/${activePackSession.sessionId}/stream`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, advanceNode }),
        signal: controller.signal,
      });

      if (!res.ok) {
        // Most common: the story already ended (session_not_active). Surface it
        // instead of leaving a blank, never-resolving bubble.
        let errCode = '';
        try { errCode = (await res.json())?.error ?? ''; } catch { /* ignore */ }
        if (errCode === 'session_not_active') {
          setNarratorNote('This story has already ended.');
          setPackCompleted(true);
        } else if (errCode === 'session_not_found') {
          setNarratorNote('This story is no longer available.');
          setPackCompleted(true);
        } else {
          setNarratorNote("Something interrupted the story. Try again in a moment.");
        }
        setPackChoices(null);
        return;
      }

      for await (const evt of parseSSE(res)) {
        if (evt.event === 'chunk') {
          gotChunk = true;
          setPackMessages((prev) => prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: m.content + (evt.data.text ?? '') } : m
          ));
        } else if (evt.event === 'error') {
          streamFailed = true;
          setNarratorNote("Something interrupted the story. Try again in a moment.");
        } else if (evt.event === 'done') {
          const data = evt.data as { choices?: PackChoice[] | null; currentNode?: string; sessionCompleted?: boolean; finalText?: string; affinityAwarded?: number; affinity?: number };
          // Replace the streamed bubble with the server's cleaned transcript so
          // any stray JSON/formatting artifact never lingers on screen.
          if (data.finalText && data.finalText.trim()) {
            setPackMessages((prev) => prev.map((m) =>
              m.id === assistantMsgId ? { ...m, content: data.finalText! } : m
            ));
          }
          setPackChoices(data.choices ?? null);
          if (data.currentNode) {
            setActivePackSession((prev) => prev ? { ...prev, currentNode: data.currentNode! } : null);
          }
          if (data.sessionCompleted) {
            finishPackStory({ affinityAwarded: data.affinityAwarded, affinity: data.affinity });
          }
        }
      }

      // Guard against a 200 stream that yielded nothing (e.g. upstream hiccup).
      if (!gotChunk && !streamFailed) {
        setNarratorNote("…she trails off. Try sending that again.");
      }
    } catch (e: unknown) {
      if ((e as { name?: string })?.name !== 'AbortError') {
        console.error('[pack] stream error', e);
        setNarratorNote("Something interrupted the story. Try again in a moment.");
      }
    } finally {
      setPackLoading(false);
      packAbortRef.current = null;
    }
  };

  const handlePackChoice = (choice: PackChoice) => {
    void sendPackMessage(choice.userMessage, choice.next);
  };

  const suggestions = [
    "How was your day?",
    "Send me a voice note idea.",
    "What's on your mind lately?",
    "Tell me something nobody else knows about you."
  ];

  const handleBack = () => {
    onBack();
  };

  // Load the real conversation archive whenever the history panel is opened
  // (re-fetched on each open so new messages show up).
  useEffect(() => {
    if (!showHistoryView) return;
    let cancelled = false;
    setHistoryLoading(true);
    Promise.all([
      fetchChatHistory(character.id).then((r) => r.days).catch(() => []),
      fetchPackStories(character.id).catch(() => [] as PackStory[]),
    ])
      .then(([days, stories]) => {
        if (cancelled) return;
        setHistoryDays(days);
        setPackStories(stories);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showHistoryView, character.id]);

  const historyItems = (historyDays ?? []).map((d) => ({
    id: d.id,
    date: formatHistoryDate(d.day),
    title: d.title || `Conversation with ${character.name}`,
    preview: `${d.lastRole === "user" ? "You" : character.name}: ${d.lastMessage}`,
  }));

  const filteredHistory = historyItems.filter((item) => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      item.preview.toLowerCase().includes(q) ||
      item.date.toLowerCase().includes(q)
    );
  });

  const storyItems = (packStories ?? []).map((s) => ({
    id: `story-${s.sessionId}`,
    title: s.title,
    date: s.completedAt ? formatHistoryDate(s.completedAt.slice(0, 10)) : "Completed",
    preview: s.lastLine ? s.lastLine.replace(/^\[[^\]]+\]\s*/, "").replace(/\*/g, "").slice(0, 140) : (s.blurb ?? ""),
  }));

  const filteredStories = storyItems.filter((item) => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return true;
    return item.title.toLowerCase().includes(q) || item.preview.toLowerCase().includes(q);
  });

  const displayedMessages = activeThread === 'pack' ? packMessages : messages;
  const displayedLoading = activeThread === 'pack' ? packLoading : isLoading;
  // In a finished story the composer is locked; the user must switch threads or
  // start a new story.
  const composerLocked = activeThread === 'pack' && packCompleted;
  const inputDisabled = displayedLoading || composerLocked;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 1.02 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="relative flex h-[calc(100vh-104px)] w-full flex-col overflow-hidden bg-stone-50 dark:bg-surface lg:grid lg:grid-cols-[300px_1fr_350px] lg:grid-rows-1 lg:flex-none"
    >
      <UpgradeToast
        open={quotaToast}
        limit={quotaLimit}
        onClose={() => setQuotaToast(false)}
        onUpgrade={() => { setQuotaToast(false); navigate("/how-it-works"); }}
      />
      <NoticeToast
        open={affinityToast.open}
        title={`+${affinityToast.amount} affinity with ${character.name}`}
        detail="Your bond grew stronger by finishing this story."
        icon={<Heart size={18} className="fill-accent" />}
        onClose={() => setAffinityToast((t) => ({ ...t, open: false }))}
        offsetRem={6}
      />
      <NoticeToast
        open={historyToast.open}
        title="Story saved to your chat history"
        detail={`"${historyToast.title}" is now in your history.`}
        icon={<BookMarked size={18} />}
        onClose={() => setHistoryToast((t) => ({ ...t, open: false }))}
        offsetRem={1.5}
      />
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
          
          <PackList
            characterId={character.id}
            activeSession={packCompleted ? null : activePackSession}
            onSessionStart={handlePackStart}
            onResume={handlePackResume}
            onAbandon={handlePackAbandon}
          />
          <SecretCard secret={storyState?.secret} name={character.name} />
          <ActivityLog characterId={character.id} name={character.name} />
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
              {historyLoading && historyDays === null && packStories === null ? (
                <p className="flex items-center justify-center gap-2 py-8 text-sm text-stone-900 dark:text-stone-500">
                  <Loader2 size={16} className="animate-spin" /> Loading conversations…
                </p>
              ) : filteredHistory.length === 0 && filteredStories.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-900 dark:text-stone-500">
                  {historyItems.length === 0 && storyItems.length === 0 ? "No past conversations yet." : "Nothing matches your search."}
                </p>
              ) : (
                <div className="space-y-6">
                  {filteredStories.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-1.5 px-1">
                        <BookMarked size={13} className="text-accent" />
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">Completed Stories</p>
                      </div>
                      <ul className="space-y-1">
                        {filteredStories.map((item) => (
                          <li key={item.id}>
                            <div className="flex w-full flex-col gap-1 rounded-xl border border-accent/15 bg-accent/[0.04] px-4 py-3 text-left">
                              <span className="text-[11px] font-medium uppercase tracking-wide text-accent/80">
                                Story · {item.date}
                              </span>
                              <span className="text-sm font-semibold text-stone-800 dark:text-stone-100">{item.title}</span>
                              {item.preview ? (
                                <span className="line-clamp-2 text-sm italic text-stone-600 dark:text-stone-400">{item.preview}</span>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {filteredHistory.length > 0 && (
                    <div>
                      {filteredStories.length > 0 && (
                        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Conversations</p>
                      )}
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
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
        {/* Thread tab bar */}
        {activePackSession && (
          <div className="flex shrink-0 border-b border-black/[0.06] dark:border-white/[0.06]">
            <button type="button" onClick={() => setActiveThread('freeRoam')}
              className={`px-5 py-3 text-xs font-semibold transition-colors ${
                activeThread === 'freeRoam'
                  ? 'border-b-2 border-accent text-accent'
                  : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
              }`}>
              Free Roam
            </button>
            <button type="button" onClick={() => setActiveThread('pack')}
              className={`px-5 py-3 text-xs font-semibold transition-colors ${
                activeThread === 'pack'
                  ? 'border-b-2 border-accent text-accent'
                  : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
              }`}>
              {activePackSession.pack?.title ?? 'Story'}
            </button>
          </div>
        )}
        {/* Status strip removed: the daily-engine activity rarely matched the
            live conversation. The scene header narration owns scene-setting now. */}
        <div
            ref={scrollRef}
            className="no-scrollbar flex-1 space-y-4 overflow-y-auto p-4 md:space-y-5 md:p-8"
        >
          {displayedMessages.filter((m) => m.id !== "scene-header").length === 1 && (
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

          {/* 3. Render mappings changed to msg.role and msg.content */}
          {greetingLoading ? (
            <div className="flex items-center justify-start px-1">
              <div className="rounded-2xl bg-zinc-800 px-4 py-2 text-sm text-zinc-400">
                …
              </div>
            </div>
          ) : displayedMessages.flatMap((msg) => {
            // User messages render as a single bubble.
            if (msg.role === "user") {
              return [
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex w-full justify-end"
                >
                  <div className="flex max-w-[88%] flex-row-reverse gap-2.5 md:max-w-[72%]">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-violet-warm text-xs font-semibold text-white shadow-md shadow-accent/20">
                      <User size={16} />
                    </div>
                    <div className="flex min-w-0 flex-col items-end space-y-1">
                      <div className="max-w-full rounded-2xl rounded-tr-sm bg-gradient-to-br from-accent to-accent-deep px-4 py-3 text-[15px] leading-relaxed text-white shadow-sm">
                        {splitNarration(msg.content).map((seg, i) => (
                          <span key={i}>
                            {i > 0 ? " " : ""}
                            {seg.type === "narration" ? (
                              <em className="italic text-white/85">{seg.text}</em>
                            ) : (
                              seg.text
                            )}
                          </span>
                        ))}
                      </div>
                      <p className="pr-1 text-right text-[10px] font-medium tabular-nums text-stone-900 dark:text-stone-500">Just now</p>
                    </div>
                  </div>
                </motion.div>,
              ];
            }
            // Assistant turns are a multi-actor "scene": parse the tagged
            // transcript into ordered bubbles. The NARRATOR renders as a centered
            // italic line; the companion gets her avatar bubble; NPCs (security,
            // etc.) get their own labeled, distinctly-colored bubble.
            return parseScript(msg.content, character.name).map((bub, i) => {
              const key = `${msg.id}-${i}`;
              if (bub.kind === "narrator") {
                const nsegs = splitNarration(bub.text);
                return (
                  <motion.div
                    key={key}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex w-full justify-center px-4 py-1.5"
                  >
                    <p className="max-w-[82%] rounded-xl border border-violet-300/60 bg-violet-100 px-4 py-2.5 text-center text-[13px] italic leading-relaxed text-violet-900 dark:border-violet-300/30 dark:bg-violet-300/20 dark:text-violet-100">
                      {nsegs.map((seg) => seg.text).join(" ")}
                    </p>
                  </motion.div>
                );
              }
              const isNpc = bub.kind === "npc";
              const segs = splitNarration(bub.text);
              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex w-full justify-start"
                >
                  <div className="flex max-w-[88%] flex-row gap-2.5 md:max-w-[72%]">
                    <div
                      className={
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold " +
                        (isNpc
                          ? "border border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                          : "border border-black/10 bg-stone-100 text-stone-700 dark:border-white/10 dark:bg-stone-800 dark:text-stone-200")
                      }
                    >
                      <span className="text-[11px]">{(isNpc ? bub.name : character.name).charAt(0)}</span>
                    </div>
                    <div className="flex min-w-0 flex-col items-start space-y-1">
                      {isNpc && (
                        <span className="pl-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-400">
                          {bub.name}
                        </span>
                      )}
                      <div
                        className={
                          "max-w-full rounded-2xl rounded-tl-sm border px-4 py-3 text-[15px] leading-relaxed shadow-sm backdrop-blur-sm " +
                          (isNpc
                            ? "border-amber-500/25 bg-amber-500/10 text-stone-800 dark:text-stone-100"
                            : "border-purple-400/25 bg-gradient-to-br from-purple-500 to-purple-300 text-white shadow-purple-500/15 dark:border-purple-400/20 dark:from-purple-600 dark:to-purple-400")
                        }
                      >
                        {segs.map((seg, j) => (
                          <span key={j}>
                            {j > 0 ? " " : ""}
                            {seg.type === "narration" ? (
                              <em className={isNpc ? "italic text-stone-500 dark:text-stone-400" : "italic text-white/85"}>{seg.text}</em>
                            ) : (
                              seg.text
                            )}
                          </span>
                        ))}
                      </div>
                      <p className={"pl-1 text-left text-[10px] font-medium tabular-nums " + (isNpc ? "text-stone-900 dark:text-stone-500" : "text-purple-700 dark:text-stone-500")}>Just now</p>
                    </div>
                  </div>
                </motion.div>
              );
            });
          })}
          {displayedLoading && !greetingLoading && (
            <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start pl-1"
            >
               <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm border border-purple-400/20 bg-gradient-to-br from-purple-500 to-purple-300 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-white/[0.07] dark:from-purple-600 dark:to-purple-400">
                    <span className="flex gap-1" aria-hidden>
                        <span className="h-2 w-2 animate-bounce rounded-full bg-white/80 [animation-duration:0.55s]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-white/80 [animation-delay:0.12s] [animation-duration:0.55s]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-white/80 [animation-delay:0.24s] [animation-duration:0.55s]" />
                    </span>
                    <span className="text-sm text-white/90">Typing…</span>
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

        {storyState?.pendingEvent ? (
          <div className="px-4 pt-2 md:px-8">
            <DesireEventCard
              characterName={character.name}
              characterImage={character.image}
              event={storyState.pendingEvent}
              onRespond={handleDesireRespond}
            />
          </div>
        ) : null}
        {activeThread === 'pack' && !packCompleted && packChoices && packChoices.length > 0 && !packLoading && (
          <ChoiceButtons choices={packChoices} onChoice={handlePackChoice} disabled={packLoading} />
        )}
        {activeThread === 'pack' && packCompleted && (
          <div className="mx-auto mt-3 w-full max-w-[520px] px-4">
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-accent/25 bg-accent/[0.06] px-4 py-4 text-center">
              <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">The End</p>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                This story has wrapped up. Pick a new story from {character.name}'s profile, or switch to Free Roam to keep chatting.
              </p>
              <button
                type="button"
                onClick={() => setActiveThread('freeRoam')}
                className="mt-1 rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-deep"
              >
                Back to Free Roam
              </button>
            </div>
          </div>
        )}
        <div className="border-t border-purple-200/40 bg-gradient-to-t from-purple-200/90 via-purple-100/40 to-transparent p-4 dark:border-white/[0.05] dark:from-surface dark:via-surface/80 md:p-8 md:pt-6">
          <div className="relative mx-auto max-w-3xl">
            <div className="relative flex items-center gap-2">
                <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={composerLocked ? "This story has ended — switch to Free Roam to keep chatting" : displayedLoading ? "…" : `Message ${character.name}…`}
                disabled={inputDisabled}
                className="min-h-[52px] flex-1 rounded-[1.75rem] border border-purple-200/60 bg-white/90 py-3.5 pl-5 pr-14 text-[15px] text-stone-800 outline-none transition-all placeholder:text-purple-400/70 focus:border-purple-400/50 focus:ring-2 focus:ring-purple-300/25 dark:border-white/20 dark:bg-stone-600/75 dark:text-stone-50 dark:placeholder:text-stone-300 dark:focus:border-purple-300/40 dark:focus:ring-purple-400/20"
                />
                <button
                type="button"
                onClick={() => handleSend()}
                disabled={!input.trim() || inputDisabled}
                className="absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-accent text-white shadow-md shadow-accent/25 transition-all hover:bg-accent-deep active:scale-95 disabled:opacity-45"
                >
                {displayedLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={19} />}
                </button>
            </div>
          </div>
        </div>
          </>
        )}
      </motion.div>
      {/* Desktop right panel — city map above social feed */}
      <div className="hidden min-h-0 flex-col border-l border-black/[0.06] dark:border-white/[0.06] lg:flex overflow-y-auto">
        <div className="shrink-0 border-b border-black/[0.06] dark:border-white/[0.06]">
          <CityMap
            characterId={character.id}
            currentLocation={playerLocation}
            currentAffinity={affinity}
            onTravel={handleTravel}
            isTraveling={isTraveling}
          />
        </div>
        <SocialFeed character={characterWithAffinity} className="min-h-0 flex-1" isActive userTier={userTier} refreshKey={feedRefreshKey} />
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
              <div className="shrink-0 border-b border-black/[0.06] dark:border-white/[0.06]">
                <CityMap
                  characterId={character.id}
                  currentLocation={playerLocation}
                  currentAffinity={affinity}
                  onTravel={(slug) => { handleTravel(slug); setFeedOpen(false); }}
                  isTraveling={isTraveling}
                />
              </div>
              <SocialFeed character={characterWithAffinity} className="min-h-0 flex-1" isActive={feedOpen} userTier={userTier} refreshKey={feedRefreshKey} />
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
              className="absolute inset-y-0 left-0 z-[60] flex w-full max-w-[340px] flex-col overflow-y-auto bg-stone-50 dark:bg-surface shadow-2xl lg:hidden border-r border-black/[0.08] dark:border-white/[0.08]"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-black/[0.06] dark:border-white/[0.06] px-4 py-3">
                <span className="text-sm font-semibold text-stone-700 dark:text-stone-200">Profile</span>
                <button
                  type="button"
                  onClick={() => setProfileOpen(false)}
                  className="rounded-lg p-2 text-stone-600 dark:text-stone-400 transition-colors hover:bg-black/[0.06] dark:hover:bg-white/[0.06] hover:text-stone-800 dark:hover:text-stone-100"
                  aria-label="Close profile"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex flex-col items-center p-6 text-center">
                <div className="relative mb-4 h-32 w-32 overflow-hidden rounded-[1.5rem] border border-black/10 dark:border-white/10 bg-stone-200 dark:bg-stone-800/40 shadow-xl">
                  <img src={character.image} alt="" className="h-full w-full object-cover" />
                </div>
                <h2 className="mb-1 font-serif text-xl font-bold text-stone-900 dark:text-stone-50">{character.name}</h2>
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-accent">{character.role}</p>
                <span className="mb-4 inline-flex items-center rounded-full border border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-stone-600 dark:text-stone-300">
                  Affinity {affinity}%
                </span>
                      <SecretCard secret={storyState?.secret} name={character.name} />
                <ActivityLog characterId={character.id} name={character.name} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
