import { useState, useEffect, useMemo } from "react";
import { Routes, Route, Navigate, useMatch, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { X, Lock } from "lucide-react";
import { Character, CHARACTERS } from "./types/character";
import { type UserTier } from "./types/subscription";
import ChatInterface from "./components/ChatInterface";
import Footer from "./components/Footer";
import Nav from "./components/Nav";
import HomePage from "./pages/HomePage";
import BrowseCharactersPage from "./pages/BrowseCharactersPage";
import AccountPage from "./pages/AccountPage";
import HowItWorksPage from "./pages/HowItWorksPage";
import AvatarPage from "./components/AvatarPage";
import AuthPage from "./pages/AuthPage";
import LegalPage from "./pages/LegalPage";
import termsMd from "./content/legal/terms.md?raw";
import privacyMd from "./content/legal/privacy.md?raw";
import acceptableUseMd from "./content/legal/acceptable-use.md?raw";
import aiDisclaimerMd from "./content/legal/ai-disclaimer.md?raw";
import { useSession, signOut } from './lib/auth-client';

type AppLocationState = {
  openMessage?: string;
};

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: session, isPending } = useSession();

  // Defaulting to "pro" for testing phase to bypass all locks/modals
  const [userTier, setUserTier] = useState<UserTier>("pro");
  
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // The URL is the single source of truth for which chat is open. Deriving
  // this (instead of mirroring it in state) avoids the render race that made
  // the logo / back buttons bounce users straight back into the chat.
  const chatMatch = useMatch("/chat/:characterId");
  const activeChat = useMemo<Character | null>(
    () => (chatMatch ? CHARACTERS.find((c) => c.id === chatMatch.params.characterId) ?? null : null),
    [chatMatch],
  );
  const autoOpenMessageId = (location.state as AppLocationState | null)?.openMessage;

  const handleSelect = (char: Character) => {
    // Auth and Upgrade checks bypassed for testing
    navigate(`/chat/${char.id}`);
  };

  // Consume one-shot location state (e.g. "open this audio message") so a
  // refresh doesn't replay it.
  useEffect(() => {
    if (!autoOpenMessageId) return;
    navigate(location.pathname, { replace: true, state: null });
  }, [autoOpenMessageId, location.pathname, navigate]);

  // --- Auth gate -----------------------------------------------------------
  // Block the whole app until there's a session. Locally you can still set
  // AUTH_BYPASS=1 on the server; in production a real login is required.
  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 text-stone-500 dark:bg-surface dark:text-stone-400">
        Loading…
      </div>
    );
  }
  if (!session?.user) {
    return <AuthPage />;
  }
  // -------------------------------------------------------------------------

  // Unknown character id in the URL: bail back home.
  if (chatMatch && !activeChat) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-stone-50 dark:bg-surface">
      <Nav />

      <div className="relative flex flex-1 flex-col">
        {activeChat ? (
          <ChatInterface
            character={activeChat}
            userTier={userTier}
            autoOpenMessageId={autoOpenMessageId}
            onBack={() => navigate("/")}
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
              <Route path="/avatar" element={<AvatarPage />} />
              <Route path="/how-it-works" element={<HowItWorksPage />} />
              <Route path="/terms" element={<LegalPage markdown={termsMd} />} />
              <Route path="/privacy" element={<LegalPage markdown={privacyMd} />} />
              <Route path="/acceptable-use" element={<LegalPage markdown={acceptableUseMd} />} />
              <Route path="/ai-disclaimer" element={<LegalPage markdown={aiDisclaimerMd} />} />
            </Routes>

            {/* Upgrade Modal kept structurally just in case it is triggered elsewhere, but shouldn't fire with 'pro' tier */}
            <AnimatePresence>
              {showUpgradeModal ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
                  onClick={() => setShowUpgradeModal(false)}
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 12 }}
                    className="relative w-full max-w-md rounded-3xl border border-white/10 bg-surface p-8 text-center shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => setShowUpgradeModal(false)}
                      className="absolute right-4 top-4 rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-white/[0.06] hover:text-stone-100"
                      aria-label="Close"
                    >
                      <X size={20} />
                    </button>

                    <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent">
                      <Lock size={28} />
                    </div>

                    <h2 className="mb-3 font-serif text-2xl text-stone-50">
                      Unlock Premium Companions
                    </h2>
                    <p className="mb-8 text-sm text-stone-400">
                      Upgrade to PRO or VIP to chat with the entire roster, unlock private media, and
                      access interactive content.
                    </p>

                    <button
                      type="button"
                      onClick={() => {
                        setShowUpgradeModal(false);
                        navigate("/how-it-works");
                      }}
                      className="w-full rounded-xl bg-accent py-3.5 text-sm font-semibold text-white shadow-md shadow-accent/25 transition-all hover:bg-accent-deep active:scale-[0.98]"
                    >
                      View Plans
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowUpgradeModal(false)}
                      className="mt-4 text-sm text-stone-400 transition-colors hover:text-stone-200"
                    >
                      Maybe Later
                    </button>
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

