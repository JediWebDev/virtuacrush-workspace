import React, { useState, useEffect, useRef } from "react";
import { useChat } from "../hooks/useChat";
import { fetchGreeting, fetchCharacterState, fetchActiveChoice, respondToDesire, fetchChatHistory, assetUrl, type CharacterState, type DialogueChoice, type ChoiceResolution, type ChatHistoryDay } from "../lib/api";
import ChoiceCard from "./ChoiceCard";
import { endDate, beginDate, shareViralMoment, requestBail } from "../lib/api";
import { splitNarration } from "../lib/narration";
import { parseScript } from "../lib/script";
import ActivityLog from "./ActivityLog";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Send, User, ArrowLeft, Loader2, Sparkles, LayoutGrid, X, Play, Lock, History, Search, Info } from "lucide-react";
import { Character } from "../types/character";
import { hasPremiumAccess, type UserTier } from "../types/subscription";
import SocialFeed from "./SocialFeed";
import UpgradeToast from "./UpgradeToast";
import SecretCard from "./SecretCard";
import DriveMeters from "./DriveMeters";
import DesireEventCard from "./DesireEventCard";

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

function formatHistoryDate(day: string): string {
  // day is YYYY-MM-DD; anchor at noon to avoid timezone date shifts.
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

// Photo backdrops served from the R2 bucket (via /api/assets) per date
// location. Keys are the object names in the bucket — after uploading a new
// image, add its location here. Locations without an entry fall back to the
// SCENE_BG gradient alone.
const SCENE_IMAGE: Record<string, string> = {
  coffee_shop: "cafe.png",
  restaurant: "restaurant.png",
  mall: "mall.png",
};

// Backdrop while the user is in a holding cell (jail mechanic).
const JAIL_IMAGE = "Jail.png";

// Subtle themed background per date location, layered under the photo (and
// shown alone when no photo is mapped in SCENE_IMAGE above).
const SCENE_BG: Record<string, string> = {
  coffee_shop: "linear-gradient(160deg, rgba(120,72,40,0.20), rgba(60,40,30,0.10))",
  restaurant: "linear-gradient(160deg, rgba(90,30,45,0.22), rgba(30,20,30,0.12))",
  movie_theater: "linear-gradient(160deg, rgba(22,22,45,0.34), rgba(8,8,18,0.20))",
  mall: "linear-gradient(160deg, rgba(40,80,120,0.18), rgba(30,40,70,0.10))",
  park: "linear-gradient(160deg, rgba(40,110,60,0.18), rgba(30,70,50,0.10))",
  concert: "linear-gradient(160deg, rgba(120,30,140,0.30), rgba(30,10,50,0.18))",
  golf_course: "linear-gradient(160deg, rgba(50,130,70,0.20), rgba(30,80,50,0.10))",
  sports_game: "linear-gradient(160deg, rgba(30,110,90,0.20), rgba(20,60,55,0.12))",
  arcade: "linear-gradient(160deg, rgba(200,40,140,0.24), rgba(40,20,80,0.16))",
  amusement_park: "linear-gradient(160deg, rgba(220,90,120,0.22), rgba(60,40,120,0.12))",
  user_home: "linear-gradient(160deg, rgba(120,90,140,0.18), rgba(40,30,50,0.10))",
  character_home: "linear-gradient(160deg, rgba(70,90,130,0.18), rgba(30,35,55,0.10))",
};

interface Props {
  character: Character;
  onBack: () => void;
  onAffinityChange?: (characterId: string, affinity: number) => void;
  autoOpenMessageId?: string;
  userTier: UserTier;
}

function PrivateMessagesInbox({
  onPlayAudio,
  userTier,
}: {
  onPlayAudio: () => void;
  userTier: UserTier;
}) {
  const premiumUnlocked = hasPremiumAccess(userTier);

  return (
    <div className="mb-6 w-full rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.03] dark:bg-white/[0.03] p-4 text-left">
      <h4 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
        Private Messages
      </h4>
      <ul className="space-y-2">
        {PRIVATE_MESSAGES.map((item) => {
          const isLocked = premiumUnlocked ? false : item.locked;
          return (
          <li key={item.id}>
            <button
              type="button"
              disabled={isLocked}
              title={isLocked ? "Subscription Required" : undefined}
              onClick={() => {
                if (!isLocked) {
                  onPlayAudio();
                }
              }}
              className={`relative flex w-full items-center gap-3 rounded-xl border border-black/[0.06] dark:border-white/[0.06] px-3 py-2.5 text-left transition-colors ${
                isLocked
                  ? "cursor-not-allowed"
                  : "hover:border-accent/25 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
              }`}
            >
              {isLocked ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl backdrop-blur-sm">
                  <Lock size={16} className="text-stone-600 dark:text-stone-400" />
                </div>
              ) : null}
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  isLocked ? "bg-stone-200 dark:bg-stone-800/60" : "bg-accent/15 text-accent"
                }`}
              >
                {isLocked ? (
                  <Lock size={14} className="text-stone-900 dark:text-stone-500" />
                ) : (
                  <Play size={14} fill="currentColor" />
                )}
              </span>
              <span className={`text-sm font-medium ${isLocked ? "text-stone-900 dark:text-stone-500" : "text-stone-700 dark:text-stone-200"}`}>
                {item.title}
              </span>
            </button>
          </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function ChatInterface({ character, onBack, onAffinityChange, autoOpenMessageId, userTier }: Props) {
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
    onChoice: (c: DialogueChoice) => setChoice(c),
    onQuotaExceeded: (info) => { setQuotaLimit(info?.limit ?? null); setQuotaToast(true); },
    onDone: () => {
      // The scene can change mid-conversation (e.g. arrival flips apart->together),
      // so refresh the status strip after each reply.
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
  const [feedOpen, setFeedOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeMessage, setActiveMessage] = useState<typeof DEMO_AUDIO_MESSAGE | null>(null);
  const [storyState, setStoryState] = useState<CharacterState | null>(null);
  const [choice, setChoice] = useState<DialogueChoice | null>(null);
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);
  const [viralMoment, setViralMoment] = useState<string | null>(null);
  const [endingDate, setEndingDate] = useState(false);
  const [beginningDate, setBeginningDate] = useState(false);
  const [bailing, setBailing] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  const navigate = useNavigate();

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

  // Fetch the character's current story-engine state for the status strip,
  // and resume any pending timed choice.
  useEffect(() => {
    let cancelled = false;
    setStoryState(null);
    setChoice(null);
    setViralMoment(null);
    fetchCharacterState(character.id)
      .then((s) => { if (!cancelled) setStoryState(s); })
      .catch((err) => console.error('[state] fetch failed:', err));
    fetchActiveChoice(character.id)
      .then((c) => { if (!cancelled && c) setChoice(c); })
      .catch((err) => console.error('[choice] resume failed:', err));
    return () => { cancelled = true; };
  }, [character.id]);

  // While jailed, tick a release countdown and auto-release when it elapses.
  useEffect(() => {
    if (storyState?.phase !== "jailed" || !storyState.scene?.jailedUntil) return;
    const until = new Date(storyState.scene.jailedUntil).getTime();
    const id = setInterval(() => {
      if (Date.now() >= until) {
        clearInterval(id);
        fetchCharacterState(character.id).then(setStoryState).catch(() => {});
      } else {
        setNowTick(Date.now());
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyState?.phase, storyState?.scene?.jailedUntil, character.id]);

  // Resolve a timed choice: append the user's pick + the character's reaction,
  // update affinity, refresh the feed if a social post was created.
  const handleChoiceResolved = (result: ChoiceResolution, chosenLabel?: string) => {
    setChoice(null);
    setMessages((prev) => {
      const next = [...prev];
      if (chosenLabel) {
        next.push({ id: crypto.randomUUID(), role: 'user', content: chosenLabel });
      }
      if (result.reaction) {
        next.push({ id: crypto.randomUUID(), role: 'assistant', content: result.reaction });
      }
      return next;
    });
    if (typeof result.affinityScore === 'number') {
      setAffinity(result.affinityScore);
      onAffinityChange?.(character.id, result.affinityScore);
    }
    if (result.posted) setFeedRefreshKey((k) => k + 1);
    if (result.viral && result.reaction) setViralMoment(result.reaction);
    // Scene/affinity may have changed — refresh the status strip.
    fetchCharacterState(character.id)
      .then((st) => setStoryState(st))
      .catch(() => { /* non-fatal */ });
  };

  const handleBail = async () => {
    if (bailing) return;
    setBailing(true);
    try {
      const res = await requestBail(character.id);
      if (res.reaction) {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: res.reaction! }]);
      }
      const st = await fetchCharacterState(character.id);
      setStoryState(st);
    } catch (err) {
      console.error("[bail] failed:", err);
    } finally {
      setBailing(false);
    }
  };

  const jailMsLeft =
    storyState?.phase === "jailed" && storyState.scene?.jailedUntil
      ? Math.max(0, new Date(storyState.scene.jailedUntil).getTime() - nowTick)
      : 0;
  const jailMmss = `${Math.floor(jailMsLeft / 60000)}:${String(Math.floor((jailMsLeft % 60000) / 1000)).padStart(2, "0")}`;

  const handleBeginDate = async () => {
    if (beginningDate) return;
    setBeginningDate(true);
    try {
      const res = await beginDate(character.id);
      if (res.reaction) {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: res.reaction }]);
      }
      const st = await fetchCharacterState(character.id);
      setStoryState(st);
    } catch (err) {
      console.error('[date] begin failed:', err);
    } finally {
      setBeginningDate(false);
    }
  };

  const handleEndDate = async () => {
    if (endingDate) return;
    setEndingDate(true);
    try {
      const billChoice = await endDate(character.id);
      setChoice(billChoice);
    } catch (err) {
      console.error('[date] end failed:', err);
    } finally {
      setEndingDate(false);
    }
  };

  const handleShareViral = async () => {
    const text = viralMoment;
    setViralMoment(null);
    if (!text) return;
    try {
      await shareViralMoment(character.id, text);
      setFeedRefreshKey((k) => k + 1);
    } catch (err) {
      console.error('[share] failed:', err);
    }
  };

  const characterWithAffinity: Character = { ...character, currentAffinity: affinity };

  const openAudioMessage = () => setActiveMessage(DEMO_AUDIO_MESSAGE);

  useEffect(() => {
    if (!autoOpenMessageId) return;
    const item = PRIVATE_MESSAGES.find((m) => m.id === autoOpenMessageId);
    const isLocked = item?.locked && !hasPremiumAccess(userTier);
    if (item && !isLocked) {
      setActiveMessage(DEMO_AUDIO_MESSAGE);
    }
  }, [autoOpenMessageId, userTier]);

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
  }, [messages, isLoading]);

  // 2. Refactored handleSend using the hook
  const handleSend = async (overrideText?: string) => {
    const textToSend = overrideText || input;
    if (!textToSend.trim() || isLoading) return;

    setInput("");
    await sendMessage(textToSend);
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
    fetchChatHistory(character.id)
      .then((r) => {
        if (!cancelled) setHistoryDays(r.days);
      })
      .catch(() => {
        if (!cancelled) setHistoryDays([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showHistoryView, character.id]);

  // Chat backdrop: jail photo while locked up; the location photo (when one
  // is mapped) over its gradient while on a date; otherwise none.
  const sceneLocation =
    storyState?.scene?.mode === "together" ? storyState.scene.location : null;
  const chatBackdropStyle: React.CSSProperties | undefined =
    storyState?.phase === "jailed"
      ? {
          backgroundImage: `linear-gradient(160deg, rgba(10,10,18,0.55), rgba(5,5,12,0.35)), url(${assetUrl(JAIL_IMAGE)})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : sceneLocation && SCENE_BG[sceneLocation]
        ? {
            backgroundImage: `${
              SCENE_IMAGE[sceneLocation] ? `url(${assetUrl(SCENE_IMAGE[sceneLocation])}), ` : ""
            }${SCENE_BG[sceneLocation]}`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }
        : undefined;

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
          
          <DriveMeters drives={storyState?.drives} />
          <SecretCard secret={storyState?.secret} name={character.name} />
          <ActivityLog characterId={character.id} name={character.name} />

          <PrivateMessagesInbox onPlayAudio={openAudioMessage} userTier={userTier} />
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
              {historyLoading && historyDays === null ? (
                <p className="flex items-center justify-center gap-2 py-8 text-sm text-stone-900 dark:text-stone-500">
                  <Loader2 size={16} className="animate-spin" /> Loading conversations…
                </p>
              ) : filteredHistory.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-900 dark:text-stone-500">
                  {historyItems.length === 0 ? "No past conversations yet." : "No conversations match your search."}
                </p>
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
        {/* Status strip removed: the daily-engine activity rarely matched the
            live conversation. The scene header narration owns scene-setting now. */}
        <div
            ref={scrollRef}
            className="no-scrollbar flex-1 space-y-4 overflow-y-auto p-4 md:space-y-5 md:p-8"
            style={chatBackdropStyle}
        >
          {messages.filter((m) => m.id !== "scene-header").length === 1 && (
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
          ) : messages.flatMap((msg) => {
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
                    className="flex w-full justify-center px-2 py-0.5"
                  >
                    <p className="max-w-[82%] text-center text-[13px] italic leading-relaxed text-stone-500 dark:text-stone-400">
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
                            : "border-black/[0.07] bg-stone-200 text-stone-800 dark:border-white/[0.07] dark:bg-stone-800/90 dark:text-stone-100")
                        }
                      >
                        {segs.map((seg, j) => (
                          <span key={j}>
                            {j > 0 ? " " : ""}
                            {seg.type === "narration" ? (
                              <em className="italic text-stone-500 dark:text-stone-400">{seg.text}</em>
                            ) : (
                              seg.text
                            )}
                          </span>
                        ))}
                      </div>
                      <p className="pl-1 text-left text-[10px] font-medium tabular-nums text-stone-900 dark:text-stone-500">Just now</p>
                    </div>
                  </div>
                </motion.div>
              );
            });
          })}
          {isLoading && !greetingLoading && (
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

        {storyState?.phase === "jailed" && !choice ? (
          <div className="px-4 pt-2 md:px-8">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/[0.07] px-4 py-3 sm:flex-row sm:items-center">
              <span className="min-w-0 flex-1 text-sm text-stone-700 dark:text-stone-200">
                🚔 You&apos;re in a holding cell.{" "}
                {storyState.scene?.bailCallUsed ? "Your one call is used — sit tight." : "You get one phone call."}{" "}
                Released in {jailMmss}.
              </span>
              {!storyState.scene?.bailCallUsed ? (
                <button
                  type="button"
                  onClick={handleBail}
                  disabled={bailing}
                  className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
                >
                  {bailing ? "Dialing…" : `📞 Call ${character.name} for bail`}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {storyState?.phase === "planning" && !choice && !viralMoment ? (
          <div className="px-4 pt-2 md:px-8">
            <button
              type="button"
              onClick={handleBeginDate}
              disabled={beginningDate}
              className="mx-auto flex w-full max-w-3xl items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/[0.06] px-4 py-2.5 text-sm font-semibold text-accent transition-all hover:bg-accent/10 disabled:opacity-50"
            >
              {beginningDate
                ? "On your way…"
                : `Show up for your date${storyState?.sceneLabel ? ` at the ${storyState.sceneLabel.toLowerCase()}` : ""} 🚪`}
            </button>
          </div>
        ) : null}
        {storyState?.phase === "on_date" && !choice && !viralMoment ? (
          <div className="px-4 pt-2 md:px-8">
            <button
              type="button"
              onClick={handleEndDate}
              disabled={endingDate}
              className="mx-auto flex w-full max-w-3xl items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/[0.06] px-4 py-2.5 text-sm font-semibold text-accent transition-all hover:bg-accent/10 disabled:opacity-50"
            >
              {endingDate ? "Getting the bill…" : "End date · get the bill 💳"}
            </button>
          </div>
        ) : null}
        {viralMoment ? (
          <div className="px-4 pt-2 md:px-8">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-xl border border-rose-400/40 bg-rose-500/[0.07] px-4 py-3 sm:flex-row sm:items-center">
              <span className="min-w-0 flex-1 text-sm text-stone-700 dark:text-stone-200">
                💢 {character.name} is fuming about the bill.
              </span>
              <button
                type="button"
                onClick={handleShareViral}
                className="shrink-0 rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-600"
              >
                Share to feed 📸
              </button>
            </div>
          </div>
        ) : null}
        {storyState?.pendingEvent && !choice ? (
          <div className="px-4 pt-2 md:px-8">
            <DesireEventCard
              characterName={character.name}
              characterImage={character.image}
              event={storyState.pendingEvent}
              onRespond={handleDesireRespond}
            />
          </div>
        ) : null}
        {choice ? (
          <div className="px-4 pt-2 md:px-8">
            <ChoiceCard choice={choice} characterName={character.name} onResolved={handleChoiceResolved} />
          </div>
        ) : null}
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
        <SocialFeed character={characterWithAffinity} className="h-full w-full" isActive userTier={userTier} refreshKey={feedRefreshKey} />
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
                  <DriveMeters drives={storyState?.drives} />
          <SecretCard secret={storyState?.secret} name={character.name} />
          <ActivityLog characterId={character.id} name={character.name} />
                  <PrivateMessagesInbox
                    userTier={userTier}
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
