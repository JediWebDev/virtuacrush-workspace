/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Routes, Route, useParams, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { Character, CHARACTERS } from "./types/character";
import { FREE_CHARS, isFreeCharacter, type UserTier } from "./types/subscription";
import ChatInterface from "./components/ChatInterface";
import Footer from "./components/Footer";
import Nav from "./components/Nav";
import HomePage from "./pages/HomePage";
import BrowseCharactersPage from "./pages/BrowseCharactersPage";
import AccountPage from "./pages/AccountPage";
import HowItWorksPage from "./pages/HowItWorksPage";

type AppLocationState = {
  openChat?: string;
  openMessage?: string;
};

function ChatDeepLink({ onSelect }: { onSelect: (char: Character) => void }) {
  const { characterId } = useParams();
  const navigate = useNavigate();

  React.useEffect(() => {
    const char = CHARACTERS.find((c) => c.id === characterId);
    if (char) onSelect(char);
    else navigate("/", { replace: true });
  }, [characterId, onSelect, navigate]);

  return null;
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [userTier, setUserTier] = useState<UserTier>("guest");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [activeChat, setActiveChat] = useState<Character | null>(null);
  const [autoOpenMessageId, setAutoOpenMessageId] = useState<string | undefined>();
  const [affinityByCharacter, setAffinityByCharacter] = useState<Record<string, number>>(() =>
    Object.fromEntries(CHARACTERS.map((c) => [c.id, c.currentAffinity]))
  );

  const handleSelect = (char: Character) => {
    if (userTier === "guest") {
      setShowAuthModal(true);
      return;
    }

    if (userTier === "free" && !isFreeCharacter(char.name)) {
      alert("Upgrade to PRO to chat with this character!");
      return;
    }

    setActiveChat({
      ...char,
      currentAffinity: affinityByCharacter[char.id] ?? char.currentAffinity,
    });
  };

  const handleAffinityChange = (characterId: string, affinity: number) => {
    setAffinityByCharacter((prev) => ({ ...prev, [characterId]: affinity }));
    setActiveChat((current) =>
      current?.id === characterId ? { ...current, currentAffinity: affinity } : current
    );
  };

  useEffect(() => {
    const state = location.state as AppLocationState | null;
    if (state?.openChat) {
      const char = CHARACTERS.find((c) => c.id === state.openChat);
      if (char) {
        if (userTier === "guest") {
          setShowAuthModal(true);
        } else if (userTier === "free" && !isFreeCharacter(char.name)) {
          alert("Upgrade to PRO to chat with this character!");
        } else {
          setActiveChat({
            ...char,
            currentAffinity: affinityByCharacter[char.id] ?? char.currentAffinity,
          });
          if (state.openMessage) {
            setAutoOpenMessageId(state.openMessage);
          }
        }
      }
      window.history.replaceState({}, document.title);
      return;
    }

    if (!location.pathname.startsWith("/chat/")) {
      setActiveChat(null);
      setAutoOpenMessageId(undefined);
    }
  }, [location.pathname, location.state, affinityByCharacter, userTier]);

  return (
    <div className="flex min-h-screen flex-col bg-stone-50 dark:bg-surface">
      <Nav onLogoClick={() => setActiveChat(null)} />

      <div className="relative flex flex-1 flex-col">
        {activeChat ? (
          <ChatInterface
            character={activeChat}
            userTier={userTier}
            autoOpenMessageId={autoOpenMessageId}
            onBack={() => {
              setActiveChat(null);
              setAutoOpenMessageId(undefined);
              navigate("/");
            }}
            onAffinityChange={handleAffinityChange}
          />
        ) : (
          <>
            <Routes>
              <Route path="/" element={<HomePage onSelect={handleSelect} userTier={userTier} />} />
              <Route
                path="/characters"
                element={<BrowseCharactersPage onSelect={handleSelect} userTier={userTier} />}
              />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/how-it-works" element={<HowItWorksPage />} />
              <Route path="/chat/:characterId" element={<ChatDeepLink onSelect={handleSelect} />} />
            </Routes>

            <AnimatePresence>
              {showAuthModal ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
                  onClick={() => setShowAuthModal(false)}
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 12 }}
                    className="relative w-full max-w-md rounded-3xl border border-black/10 bg-stone-50 p-8 shadow-2xl dark:border-white/10 dark:bg-surface"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => setShowAuthModal(false)}
                      className="absolute right-4 top-4 rounded-lg p-1.5 text-stone-600 transition-colors hover:bg-black/[0.06] hover:text-stone-900 dark:text-stone-400 dark:hover:bg-white/[0.06] dark:hover:text-stone-100"
                      aria-label="Close"
                    >
                      <X size={20} />
                    </button>

                    <h2 className="mb-2 pr-8 font-serif text-2xl font-bold text-stone-900 dark:text-stone-50">
                      Create your free account
                    </h2>
                    <p className="mb-6 text-sm text-stone-600 dark:text-stone-400">
                      Chat with {FREE_CHARS.slice(0, 3).join(", ")} and more on the free plan.
                    </p>

                    <div className="space-y-4">
                      <input
                        type="email"
                        placeholder="Email address"
                        className="w-full rounded-xl border border-black/10 bg-black/[0.04] px-4 py-3 text-stone-800 outline-none transition-colors placeholder:text-stone-500 focus:border-accent/40 focus:ring-2 focus:ring-accent/15 dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-100"
                      />
                      <input
                        type="password"
                        placeholder="Password"
                        className="w-full rounded-xl border border-black/10 bg-black/[0.04] px-4 py-3 text-stone-800 outline-none transition-colors placeholder:text-stone-500 focus:border-accent/40 focus:ring-2 focus:ring-accent/15 dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-100"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setUserTier("free");
                          setShowAuthModal(false);
                        }}
                        className="w-full rounded-xl bg-accent py-3.5 text-sm font-semibold text-white shadow-md shadow-accent/25 transition-all hover:bg-accent-deep active:scale-[0.98]"
                      >
                        Join VirtuaCrush
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <CTASection />
            <Footer />
          </>
        )}
      </div>

      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-1/4 top-0 h-[800px] w-[800px] rounded-full bg-accent/10 blur-[120px]" />
        <div className="absolute -right-1/4 bottom-0 h-[600px] w-[600px] rounded-full bg-violet-warm/10 blur-[100px]" />
      </div>
    </div>
  );
}

const CTASection = () => (
  <section className="bg-gradient-to-b from-transparent to-accent/5 px-6 py-24 md:px-12">
    <div className="relative mx-auto max-w-4xl overflow-hidden rounded-[3rem] border border-black/10 dark:border-white/10 glass p-12 text-center">
      <div className="absolute left-1/2 top-0 h-40 w-40 -translate-x-1/2 -translate-y-1/2 bg-accent/15 blur-3xl" />
      <h2 className="mb-6 font-serif text-4xl font-bold md:text-5xl">Secure Early Access</h2>
      <p className="mx-auto mb-10 max-w-xl text-stone-600 dark:text-stone-400">
        Sign up to receive immediate priority access for the limited Beta release.
      </p>
      <div className="mx-auto flex max-w-md flex-col gap-4 sm:flex-row">
        <input
          type="email"
          placeholder="Enter your email"
          className="flex-1 rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.04] px-6 py-4 text-stone-800 dark:text-stone-100 outline-none transition-colors placeholder:text-stone-500 focus:border-accent/40 focus:ring-2 focus:ring-accent/15"
        />
        <button
          type="button"
          className="rounded-2xl bg-accent px-8 py-4 font-semibold text-white shadow-lg shadow-accent/25 transition-all hover:bg-accent-deep active:scale-95"
        >
          Subscribe
        </button>
      </div>
    </div>
  </section>
);
