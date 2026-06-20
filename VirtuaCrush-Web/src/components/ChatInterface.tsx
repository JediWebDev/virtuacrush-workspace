import React, { useState, useEffect, useRef } from "react";
import { useChat } from "../hooks/useChat";
import { fetchGreeting, fetchCharacterState, fetchAffinity, fetchDevResetEnabled, devResetCharacter, respondToDesire, fetchChatHistory, fetchChatHistoryDay, assetUrl, type CharacterState, type ChatHistoryDay } from "../lib/api";
import { splitNarration } from "../lib/narration";
import { parseScript } from "../lib/script";
import ActivityLog from "./ActivityLog";
import WorldActivityFeed from "./WorldActivityFeed";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Send, ArrowLeft, Loader2, Sparkles, LayoutGrid, X, History, Search, Info, Heart, BookMarked, RotateCcw } from "lucide-react";
import ChatAvatar from "./ChatAvatar";
import { Character } from "../types/character";
import type { UserTier } from "../types/subscription";
import { fetchProfile } from "../lib/profile";
import { customAvatar, isCustomCharacterId } from "../lib/customCharacter";
import SocialFeed from "./SocialFeed";
import UpgradeToast from "./UpgradeToast";
import SecretCard from "./SecretCard";
import DesireEventCard from "./DesireEventCard";
import PackList from "./PackList";
import ChoiceButtons from "./ChoiceButtons";
import { getActivePackSession, greetPackSession, abandonPackSession, fetchPackStories, fetchPackTranscript, type PackSession, type PackChoice, type PackStory } from "../lib/api";
import NoticeToast from "./NoticeToast";
import AchievementToast, { type AchievementToastData } from "./AchievementToast";

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
  const [userAvatarSrc, setUserAvatarSrc] = useState(() => customAvatar("You"));
  const [quotaToast, setQuotaToast] = useState(false);
  const [quotaLimit, setQuotaLimit] = useState<number | null>(null);
  const { messages, setMessages, send: sendMessage, streaming: isLoading, replyChoices, clearReplyChoices } = useChat({
    characterId: character.id,
    initialMessages: [],
    onAffinityUpdate: (score) => {
      setAffinity(score);
      onAffinityChange?.(character.id, score);
    },
    onQuotaExceeded: (info) => { setQuotaLimit(info?.limit ?? null); setQuotaToast(true); },
    onDone: (info) => {
      if (info.earnedBadge?.title) {
        setAchievementToast({ open: true, badge: info.earnedBadge });
      }
      if (info.affinityAwarded && info.affinityAwarded > 0) {
        if (typeof info.affinityScore === 'number') {
          setAffinity(info.affinityScore);
          onAffinityChange?.(character.id, info.affinityScore);
        }
        setAffinityToast({ open: true, amount: info.affinityAwarded });
      }
      if (info.meetArcComplete) {
        setMeetArcComplete(true);
      }
      fetchCharacterState(character.id)
        .then((st) => {
          setStoryState(st);
          if (typeof st.meetArcComplete === 'boolean') setMeetArcComplete(st.meetArcComplete);
        })
        .catch(() => { /* non-fatal */ });
    },
    onCharacterPosted: () => {
      // The character just posted to their feed — refresh it so it shows live.
      setFeedRefreshKey((k) => k + 1);
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
  const navigate = useNavigate();
  const location = useLocation();
  const studioArcTitleRef = useRef<string | null>(
    ((location.state as { studioArcTitle?: string } | null)?.studioArcTitle) ?? null,
  );
  const [activeStoryArc, setActiveStoryArc] = useState<{ id: string; title: string } | null>(null);
  /** When set, the user is reading an archived day — not the live arc / free-roam thread. */
  const [archiveDay, setArchiveDay] = useState<string | null>(null);

  // Pack mode
  const [activePackSession, setActivePackSession] = useState<PackSession | null>(null);
  const [activeThread, setActiveThread] = useState<'freeRoam' | 'pack' | 'reading'>('freeRoam');
  const [packMessages, setPackMessages] = useState<{ id: string; role: 'user' | 'assistant'; content: string }[]>([]);
  const [packChoices, setPackChoices] = useState<PackChoice[] | null>(null);
  const [packLoading, setPackLoading] = useState(false);
  const [packCompleted, setPackCompleted] = useState(false);
  // Read-only viewer for a COMPLETED story opened from history.
  const [readingStory, setReadingStory] = useState<{ sessionId: number; title: string } | null>(null);
  const [readingMessages, setReadingMessages] = useState<{ id: string; role: 'user' | 'assistant'; content: string }[]>([]);
  const [readingLoading, setReadingLoading] = useState(false);
  // Completion celebration: affinity-earned toast, "saved to history" toast,
  // and a timer that auto-closes the finished story tab.
  const [affinityToast, setAffinityToast] = useState<{ open: boolean; amount: number }>({ open: false, amount: 0 });
  const [historyToast, setHistoryToast] = useState<{ open: boolean; title: string }>({ open: false, title: '' });
  const [achievementToast, setAchievementToast] = useState<{ open: boolean; badge: AchievementToastData | null }>({
    open: false,
    badge: null,
  });
  const [meetArcComplete, setMeetArcComplete] = useState(() => isCustomCharacterId(character.id));
  const [devResetEnabled, setDevResetEnabled] = useState(false);
  const [devResetting, setDevResetting] = useState(false);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchProfile()
      .then((p) => {
        const name = p.profile.displayName?.trim() || "You";
        setUserAvatarSrc(p.avatarKey ? assetUrl(p.avatarKey) : customAvatar(name));
      })
      .catch(() => { /* non-fatal — keep fallback avatar */ });
  }, []);

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
    setActiveStoryArc(null);
    setArchiveDay(null);
    setReadingStory(null);
    setReadingMessages([]);
    setAffinityToast({ open: false, amount: 0 });
    setHistoryToast({ open: false, title: '' });
    setAchievementToast({ open: false, badge: null });
    setMeetArcComplete(isCustomCharacterId(character.id));

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
    setArchiveDay(null);
    clearReplyChoices();

    async function initGreeting() {
      try {
        const result = await fetchGreeting(character.id);

        if (cancelled) return;

        if (result.arcActive && (result.activeStoryArc || studioArcTitleRef.current)) {
          setActiveStoryArc({
            id: result.activeStoryArc?.id ?? 'user:studio',
            title: result.activeStoryArc?.title ?? studioArcTitleRef.current ?? 'Story arc',
          });
          studioArcTitleRef.current = null;
          try { window.history.replaceState({ ...window.history.state, usr: {} }, ''); } catch { /* ignore */ }
        } else {
          setActiveStoryArc(null);
        }
        if (typeof result.meetArcComplete === 'boolean') {
          setMeetArcComplete(result.meetArcComplete);
        }

        // Scene header only when there is no transcript yet (Play seeds intro into history).
        const sceneMsgs =
          !result.hasHistory && result.sceneHeader
            ? [{ id: 'scene-header', role: 'assistant' as const, content: `[NARRATOR] ${result.sceneHeader}` }]
            : [];

        if (result.hasHistory) {
          if (result.history?.length) {
            setMessages(
              result.history.map((m, i) => ({
                id: `history-${i}`,
                role: m.role,
                content: m.content,
              })),
            );
          } else if (sceneMsgs.length) {
            setMessages(sceneMsgs);
          }
          setGreetingLoading(false);
          return;
        }

        if (result.arcActive && sceneMsgs.length) {
          setMessages(sceneMsgs);
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
        } else if (sceneMsgs.length) {
          setMessages(sceneMsgs);
        }
      } catch (err) {
        console.error('[greet] failed:', err);
      } finally {
        if (!cancelled) setGreetingLoading(false);
      }
    }

    initGreeting();
    return () => { cancelled = true; };
  }, [character.id, setMessages, clearReplyChoices]);

  // Fetch the character's current story-engine state for the status strip.
  useEffect(() => {
    let cancelled = false;
    setStoryState(null);
    fetchCharacterState(character.id)
      .then((s) => {
        if (!cancelled) {
          setStoryState(s);
          if (typeof s.meetArcComplete === 'boolean') setMeetArcComplete(s.meetArcComplete);
        }
      })
      .catch((err) => console.error('[state] fetch failed:', err));
    return () => { cancelled = true; };
  }, [character.id]);

  // Load the PERSISTED affinity on open so the bar shows real progress
  // immediately — not 0 until the first reply comes back. Progress is stored
  // server-side; this just hydrates the UI on (re)entry / re-login.
  useEffect(() => {
    let cancelled = false;
    fetchAffinity(character.id)
      .then((score) => {
        if (!cancelled && typeof score === 'number') {
          setAffinity(score);
          onAffinityChange?.(character.id, score);
        }
      })
      .catch((err) => console.error('[affinity] fetch failed:', err));
    return () => { cancelled = true; };
  }, [character.id, onAffinityChange]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      setDevResetEnabled(true);
      return;
    }
    fetchDevResetEnabled().then(setDevResetEnabled).catch(() => setDevResetEnabled(false));
  }, []);

  const handleDevReset = async () => {
    if (devResetting) return;
    const ok = window.confirm(
      `Reset all chat and story progress with ${character.name}? This clears the meet-cute, messages, affinity, and packs. Dev only.`,
    );
    if (!ok) return;
    setDevResetting(true);
    try {
      await devResetCharacter(character.id);
      setAffinity(0);
      onAffinityChange?.(character.id, 0);
      setActiveStoryArc(null);
      setMeetArcComplete(isCustomCharacterId(character.id));
      setActiveThread('freeRoam');
      setArchiveDay(null);
      setActivePackSession(null);
      setPackMessages([]);
      setPackChoices(null);
      setPackCompleted(false);
      clearReplyChoices();
      setGreetingLoading(true);
      const result = await fetchGreeting(character.id);
      const sceneMsgs =
        !result.hasHistory && result.sceneHeader
          ? [{ id: 'scene-header', role: 'assistant' as const, content: `[NARRATOR] ${result.sceneHeader}` }]
          : [];
      if (result.hasHistory && result.history?.length) {
        setMessages(result.history.map((m, i) => ({ id: `history-${i}`, role: m.role, content: m.content })));
      } else if (result.greeting) {
        setMessages([...sceneMsgs, { id: 'greeting', role: 'assistant', content: result.greeting }]);
      } else if (sceneMsgs.length) {
        setMessages(sceneMsgs);
      } else {
        setMessages([]);
      }
      if (typeof result.meetArcComplete === 'boolean') setMeetArcComplete(result.meetArcComplete);
      fetchCharacterState(character.id).then(setStoryState).catch(() => {});
    } catch (err) {
      console.error('[dev] reset failed:', err);
      window.alert('Dev reset failed — is the server running in dev mode?');
    } finally {
      setDevResetting(false);
      setGreetingLoading(false);
    }
  };

  const characterWithAffinity: Character = { ...character, currentAffinity: affinity };

  useEffect(() => {
    setAffinity(character.currentAffinity);
  }, [character.id, character.currentAffinity]);

  useEffect(() => {
    // A saved story opens at the TOP so it reads from the beginning; live
    // threads stick to the bottom.
    if (!scrollRef.current) return;
    if (activeThread === 'reading') {
      scrollRef.current.scrollTo({ top: 0 });
      return;
    }
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages, isLoading, packMessages, packLoading, activeThread, readingMessages]);

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
    // Don't yank the player out if they've since opened a saved story to read.
    setActiveThread((t) => (t === 'reading' ? t : 'freeRoam'));
    setHistoryToast({ open: true, title: storyTitle });
  };

  // Open a COMPLETED story from history as a read-only thread (no composer, no
  // choices) the player can scroll through, then close via the tab's X.
  const handleOpenStory = async (story: { sessionId: number; title: string }) => {
    setShowHistoryView(false);
    setReadingStory(story);
    setReadingMessages([]);
    setReadingLoading(true);
    setActiveThread('reading');
    try {
      const history = await fetchPackTranscript(story.sessionId);
      const msgs = history.map((m, i) => ({
        id: `read-${story.sessionId}-${i}`,
        role: m.role,
        content: m.content,
      }));
      setReadingMessages(msgs);
    } catch {
      setReadingMessages([{ id: `read-err-${story.sessionId}`, role: 'assistant', content: '[NARRATOR] This story could not be loaded.' }]);
    } finally {
      setReadingLoading(false);
    }
  };

  const handleCloseReading = () => {
    setReadingStory(null);
    setReadingMessages([]);
    setReadingLoading(false);
    setActiveThread(activePackSession ? 'pack' : 'freeRoam');
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
    // Show the player's turn immediately; the "typing…" indicator (displayedLoading)
    // covers the single director call, then we reveal the parsed scene.
    setPackMessages((prev) => [...prev, { id: userMsgId, role: 'user', content: text }]);
    setPackChoices(null);
    setPackLoading(true);

    const addNarrator = (note: string) =>
      setPackMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: `[NARRATOR] ${note}` }]);

    try {
      const res = await fetch(`/api/packs/session/${activePackSession.sessionId}/turn`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, advanceNode }),
      });

      if (!res.ok) {
        let errCode = '';
        try { errCode = (await res.json())?.error ?? ''; } catch { /* ignore */ }
        if (errCode === 'session_not_active') {
          addNarrator('This story has already ended.');
          setPackCompleted(true);
        } else if (errCode === 'session_not_found') {
          addNarrator('This story is no longer available.');
          setPackCompleted(true);
        } else {
          addNarrator('Something interrupted the story. Try again in a moment.');
        }
        setPackChoices(null);
        return;
      }

      const data = (await res.json()) as {
        transcript?: string;
        choices?: PackChoice[] | null;
        currentNode?: string;
        sessionCompleted?: boolean;
        affinityAwarded?: number;
        affinity?: number;
      };

      const transcript = (data.transcript ?? '').trim() || '[NARRATOR] *A quiet beat passes.*';
      setPackMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: transcript }]);
      setPackChoices(data.choices ?? null);
      if (data.currentNode) {
        setActivePackSession((prev) => (prev ? { ...prev, currentNode: data.currentNode! } : null));
      }
      if (data.sessionCompleted) {
        finishPackStory({ affinityAwarded: data.affinityAwarded, affinity: data.affinity });
      }
    } catch (e) {
      console.error('[pack] turn error', e);
      addNarrator('Something interrupted the story. Try again in a moment.');
    } finally {
      setPackLoading(false);
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

  const handleOpenHistoryDay = async (day: string) => {
    setShowHistoryView(false);
    setArchiveDay(day);
    setGreetingLoading(true);
    clearReplyChoices();
    try {
      const { messages: dayMsgs } = await fetchChatHistoryDay(character.id, day);
      setMessages(
        dayMsgs.map((m, i) => ({
          id: `archive-${i}`,
          role: m.role,
          content: m.content,
        })),
      );
    } catch {
      setMessages([{ id: 'archive-err', role: 'assistant', content: '[NARRATOR] Could not load that conversation.' }]);
    } finally {
      setGreetingLoading(false);
    }
  };

  const handleBackToLiveChat = async () => {
    setArchiveDay(null);
    setGreetingLoading(true);
    clearReplyChoices();
    try {
      const result = await fetchGreeting(character.id);
      if (result.arcActive && result.activeStoryArc) {
        setActiveStoryArc(result.activeStoryArc);
      } else {
        setActiveStoryArc(null);
      }
      if (typeof result.meetArcComplete === 'boolean') {
        setMeetArcComplete(result.meetArcComplete);
      }
      const sceneMsgs =
        !result.hasHistory && result.sceneHeader
          ? [{ id: 'scene-header', role: 'assistant' as const, content: `[NARRATOR] ${result.sceneHeader}` }]
          : [];
      if (result.hasHistory && result.history?.length) {
        setMessages(
          result.history.map((m, i) => ({
            id: `history-${i}`,
            role: m.role,
            content: m.content,
          })),
        );
      } else if (result.arcActive && sceneMsgs.length) {
        setMessages(sceneMsgs);
      } else if (result.greeting) {
        setMessages([...sceneMsgs, { id: 'greeting', role: 'assistant', content: result.greeting }]);
      } else if (sceneMsgs.length) {
        setMessages(sceneMsgs);
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.error('[greet] reload failed:', err);
    } finally {
      setGreetingLoading(false);
    }
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
    sessionId: s.sessionId,
    title: s.title,
    date: s.completedAt ? formatHistoryDate(s.completedAt.slice(0, 10)) : "Completed",
    preview: s.lastLine ? s.lastLine.replace(/^\[[^\]]+\]\s*/, "").replace(/\*/g, "").slice(0, 140) : (s.blurb ?? ""),
  }));

  const filteredStories = storyItems.filter((item) => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return true;
    return item.title.toLowerCase().includes(q) || item.preview.toLowerCase().includes(q);
  });

  const showArcBanner = activeThread === 'freeRoam' && !archiveDay && !!activeStoryArc;
  const showMeetBanner = activeThread === 'freeRoam' && !archiveDay && !meetArcComplete && !activeStoryArc && !isCustomCharacterId(character.id);

  const displayedMessages =
    activeThread === 'reading' ? readingMessages :
    activeThread === 'pack' ? packMessages :
    messages;
  const displayedLoading =
    activeThread === 'reading' ? readingLoading :
    activeThread === 'pack' ? packLoading :
    isLoading;
  // Reading a saved story is fully read-only; a finished active story also locks
  // the composer until the player switches threads or starts a new story.
  const composerLocked = activeThread === 'reading' || (activeThread === 'pack' && packCompleted) || !!archiveDay;
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
      <AchievementToast
        open={achievementToast.open}
        badge={achievementToast.badge}
        onClose={() => setAchievementToast((t) => ({ ...t, open: false }))}
        offsetRem={14}
      />
      <NoticeToast
        open={affinityToast.open}
        title={`+${affinityToast.amount} affinity with ${character.name}`}
        detail={achievementToast.open ? "You made a real first impression." : "Your bond grew stronger."}
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
      <div className="pointer-events-none absolute inset-0 -z-10 ambient-accent" />

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
            <img src={character.image} alt="" className="h-full w-full rounded-[1.75rem] object-cover object-top" />
            <div className="absolute bottom-3 right-3 h-3.5 w-3.5 rounded-full border-2 border-stone-50 bg-emerald-400 dark:border-surface shadow-[0_0_0_2px_rgba(16,185,129,0.35)]" />
          </motion.div>
          
          <h2 className="mb-1 font-serif text-2xl font-bold text-stone-900 dark:text-stone-50">{character.name}</h2>
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.12em] text-accent">{character.role}</p>
          <span className="mb-5 inline-flex items-center rounded-full border border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-stone-600 dark:text-stone-300">
            Affinity {affinity}%
          </span>

          {devResetEnabled ? (
            <button
              type="button"
              onClick={() => void handleDevReset()}
              disabled={devResetting || isLoading}
              className="mb-5 flex w-full max-w-[220px] items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-500/15 disabled:opacity-50 dark:text-amber-200"
            >
              <RotateCcw size={14} className={devResetting ? 'animate-spin' : ''} />
              {devResetting ? 'Resetting…' : 'Dev: reset character'}
            </button>
          ) : null}
          
          <PackList
            characterId={character.id}
            meetArcComplete={meetArcComplete}
            activeSession={packCompleted ? null : activePackSession}
            onSessionStart={handlePackStart}
            onResume={handlePackResume}
            onAbandon={handlePackAbandon}
          />
          <SecretCard secret={storyState?.secret} name={character.name} />
          <WorldActivityFeed />
          <ActivityLog characterId={character.id} name={character.name} />
        </div>

        <div className="mt-auto border-t border-black/[0.06] dark:border-white/[0.06] pt-6">
            <p className="text-center text-[11px] leading-relaxed text-stone-900 dark:text-stone-500">
              Private chat · Encrypted in transit
            </p>
        </div>
      </motion.div>

      {/* Main chat */}
      <motion.div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-stone-100/80 dark:bg-surface-elevated/55">
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
                    <img src={character.image} alt="" className="h-full w-full object-cover object-top" />
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
              <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                Free-roam chat resets each day — past days are saved here with timestamps.
              </p>
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
                            <button
                              type="button"
                              onClick={() => handleOpenStory({ sessionId: item.sessionId, title: item.title })}
                              className="flex w-full flex-col gap-1 rounded-xl border border-accent/15 bg-accent/[0.04] px-4 py-3 text-left transition-colors hover:border-accent/35 hover:bg-accent/[0.09]"
                            >
                              <span className="text-[11px] font-medium uppercase tracking-wide text-accent/80">
                                Story · {item.date} · tap to read
                              </span>
                              <span className="text-sm font-semibold text-stone-800 dark:text-stone-100">{item.title}</span>
                              {item.preview ? (
                                <span className="line-clamp-2 text-sm italic text-stone-600 dark:text-stone-400">{item.preview}</span>
                              ) : null}
                            </button>
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
                              onClick={() => void handleOpenHistoryDay(item.id)}
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
        {(activePackSession || readingStory) && (
          <div className="flex shrink-0 items-stretch border-b border-black/[0.06] dark:border-white/[0.06]">
            <button type="button" onClick={() => setActiveThread('freeRoam')}
              className={`px-5 py-3 text-xs font-semibold transition-colors ${
                activeThread === 'freeRoam'
                  ? 'border-b-2 border-accent text-accent'
                  : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
              }`}>
              Free Roam
            </button>
            {activePackSession && (
              <button type="button" onClick={() => setActiveThread('pack')}
                className={`px-5 py-3 text-xs font-semibold transition-colors ${
                  activeThread === 'pack'
                    ? 'border-b-2 border-accent text-accent'
                    : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
                }`}>
                {activePackSession.pack?.title ?? 'Story'}
              </button>
            )}
            {readingStory && (
              <div className={`flex items-center gap-1 border-b-2 pl-5 pr-2 transition-colors ${
                activeThread === 'reading' ? 'border-accent' : 'border-transparent'
              }`}>
                <button type="button" onClick={() => setActiveThread('reading')}
                  className={`flex items-center gap-1.5 py-3 text-xs font-semibold transition-colors ${
                    activeThread === 'reading' ? 'text-accent' : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
                  }`}>
                  <BookMarked size={12} />
                  <span className="max-w-[140px] truncate">{readingStory.title}</span>
                  <span className="rounded-full bg-stone-200 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-stone-500 dark:bg-stone-700 dark:text-stone-300">Saved</span>
                </button>
                <button type="button" onClick={handleCloseReading} aria-label="Close story"
                  className="rounded-md p-1 text-stone-400 transition-colors hover:bg-black/[0.06] hover:text-stone-700 dark:hover:bg-white/[0.06] dark:hover:text-stone-200">
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        )}
        {/* Status strip removed: the daily-engine activity rarely matched the
            live conversation. The scene header narration owns scene-setting now. */}
        <div
            ref={scrollRef}
            className="no-scrollbar flex-1 space-y-4 overflow-y-auto p-4 md:space-y-5 md:p-8"
        >
          {activeThread === 'reading' && readingLoading && (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-stone-500">
              <Loader2 size={16} className="animate-spin" /> Loading story…
            </p>
          )}
          {activeThread === 'reading' && !readingLoading && readingMessages.length > 0 && (
            <p className="mx-auto w-fit rounded-full border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-stone-500">
              Saved story · read only
            </p>
          )}
          {archiveDay && (
            <div className="mx-auto flex max-w-lg flex-col items-center gap-2 rounded-2xl border border-stone-300/50 bg-stone-100/80 px-4 py-3 text-center dark:border-stone-600/50 dark:bg-stone-800/40">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500">Archived conversation</p>
              <p className="font-serif text-lg font-semibold text-stone-800 dark:text-stone-100">{formatHistoryDate(archiveDay)}</p>
              <button
                type="button"
                onClick={() => void handleBackToLiveChat()}
                className="mt-1 text-xs font-semibold text-accent transition-opacity hover:opacity-80"
              >
                Back to today&apos;s chat
              </button>
            </div>
          )}
          {showMeetBanner && (
            <div className="mx-auto max-w-lg rounded-2xl border border-amber-400/35 bg-gradient-to-br from-amber-100/80 via-white/60 to-transparent px-4 py-3 text-center shadow-sm dark:from-amber-950/40 dark:via-stone-900/40">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">First meeting</p>
              <p className="mt-1 font-serif text-lg font-semibold text-stone-900 dark:text-stone-50">Get to know {character.name}</p>
              <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">
                Finish this meet-cute before story packs and other arcs unlock.
              </p>
            </div>
          )}
          {showArcBanner && (
            <div className="mx-auto max-w-lg rounded-2xl border border-accent/35 bg-gradient-to-br from-accent/15 via-accent/5 to-transparent px-4 py-3 text-center shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent/80">New scene</p>
              <p className="mt-1 font-serif text-lg font-semibold text-accent">{activeStoryArc!.title}</p>
              <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">
                Earlier free-roam chat is saved in history — this arc starts fresh below.
              </p>
            </div>
          )}
          {activeThread === 'freeRoam' && !showArcBanner && !archiveDay && displayedMessages.filter((m) => m.id !== "scene-header").length === 1 && (
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
                    <ChatAvatar src={userAvatarSrc} alt="You" variant="user" />
                    <div className="flex min-w-0 flex-col items-end space-y-1">
                      <div className="max-w-full rounded-2xl rounded-tr-sm bg-gradient-to-br from-accent to-brand-indigo px-4 py-3 text-[15px] leading-relaxed text-white shadow-sm">
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
                    {isNpc ? (
                      <ChatAvatar alt={bub.name} variant="npc" fallbackInitial={bub.name} />
                    ) : (
                      <ChatAvatar src={character.image} alt={character.name} variant="companion" />
                    )}
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
                            : "border-brand-sapphire/30 bg-gradient-to-br from-brand-indigo to-brand-sapphire text-white shadow-brand-sapphire/20")
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
                      <p className={"pl-1 text-left text-[10px] font-medium tabular-nums " + (isNpc ? "text-stone-900 dark:text-stone-500" : "text-brand-indigo dark:text-stone-400")}>Just now</p>
                    </div>
                  </div>
                </motion.div>
              );
            });
          })}
          {displayedLoading && !greetingLoading && activeThread !== 'reading' && (
            <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start gap-2.5 pl-1"
            >
               <ChatAvatar src={character.image} alt={character.name} variant="companion" />
               <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm border border-brand-sapphire/25 bg-gradient-to-br from-brand-indigo to-brand-sapphire px-4 py-3 shadow-sm backdrop-blur-sm">
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

        {activeThread === 'freeRoam' && !archiveDay && !isLoading && replyChoices.length > 0 && (
          <ChoiceButtons
            title="What do you say or do?"
            choices={replyChoices.map((c, i) => ({ id: `rc_${i}`, label: c.label, userMessage: c.userMessage, next: '' }))}
            onChoice={(c) => { void sendMessage(c.userMessage); }}
            disabled={isLoading}
          />
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
        {activeThread === 'reading' ? (
          <div className="composer-bar md:px-8 md:py-5">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] px-4 py-3">
              <span className="text-xs text-stone-500 dark:text-stone-400">
                You're reading a saved story. It can't be continued.
              </span>
              <button
                type="button"
                onClick={handleCloseReading}
                className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-deep"
              >
                Close story
              </button>
            </div>
          </div>
        ) : (
        <div className="composer-bar">
          <div className="relative mx-auto max-w-3xl">
            <div className="relative flex items-center gap-2">
                <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={composerLocked ? (archiveDay ? "Archived conversation — read only" : "This story has ended — switch to Free Roam to keep chatting") : displayedLoading ? "…" : `Message ${character.name}…`}
                disabled={inputDisabled}
                className="min-h-[52px] flex-1 rounded-[1.75rem] border border-brand-indigo/25 bg-white/95 py-3.5 pl-5 pr-14 text-[15px] text-stone-800 outline-none transition-all placeholder:text-brand-indigo/45 focus:border-brand-sapphire/50 focus:ring-2 focus:ring-brand-sapphire/20 dark:border-brand-sapphire/30 dark:bg-surface-elevated/80 dark:text-stone-50 dark:placeholder:text-stone-400 dark:focus:border-accent/40 dark:focus:ring-accent/20"
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
        )}
          </>
        )}
      </motion.div>
      {/* Desktop right panel — social feed */}
      <div className="hidden min-h-0 flex-col border-l border-black/[0.06] dark:border-white/[0.06] lg:flex overflow-y-auto">
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
                  <img src={character.image} alt="" className="h-full w-full object-cover object-top" />
                </div>
                <h2 className="mb-1 font-serif text-xl font-bold text-stone-900 dark:text-stone-50">{character.name}</h2>
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-accent">{character.role}</p>
                <span className="mb-4 inline-flex items-center rounded-full border border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-stone-600 dark:text-stone-300">
                  Affinity {affinity}%
                </span>
                {devResetEnabled ? (
                  <button
                    type="button"
                    onClick={() => void handleDevReset()}
                    disabled={devResetting || isLoading}
                    className="mb-4 flex w-full max-w-[220px] items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-500/15 disabled:opacity-50 dark:text-amber-200"
                  >
                    <RotateCcw size={14} className={devResetting ? 'animate-spin' : ''} />
                    {devResetting ? 'Resetting…' : 'Dev: reset character'}
                  </button>
                ) : null}
                      <SecretCard secret={storyState?.secret} name={character.name} />
                <WorldActivityFeed />
                <ActivityLog characterId={character.id} name={character.name} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
