import { useState, useEffect, useMemo } from "react";
import { Routes, Route, Navigate, Link, useMatch, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { X, Lock } from "lucide-react";
import { Character, CHARACTERS } from "./types/character";
import { hasPremiumAccess, isFreeCharacter, type UserTier } from "./types/subscription";
import ChatInterface from "./components/ChatInterface";
import Footer from "./components/Footer";
import Nav from "./components/Nav";
import HomePage from "./pages/HomePage";
import BrowseCharactersPage from "./pages/BrowseCharactersPage";
import AccountPage from "./pages/AccountPage";
import AvatarPage from "./components/AvatarPage";
import StudioPage from "./pages/StudioPage";
import CommunityPage from "./pages/CommunityPage";
import AuthPage from "./pages/AuthPage";
import LegalPage from "./pages/LegalPage";
import termsMd from "./content/legal/terms.md?raw";
import privacyMd from "./content/legal/privacy.md?raw";
import acceptableUseMd from "./content/legal/acceptable-use.md?raw";
import aiDisclaimerMd from "./content/legal/ai-disclaimer.md?raw";
import { fetchUsage, getStudioCharacter } from "./lib/api";
import { studioToCharacter, isCustomCharacterId } from "./lib/customCharacter";
import { useSession } from './lib/auth-client';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: session, isPending } = useSession();

  // Tier comes from the server's subscription state (the Stripe webhook flips
  // it). Re-checked on navigation so returning from checkout updates the UI.
  const [userTier, setUserTier] = useState<UserTier>("free");
  useEffect(() => {
    if (!session?.user) return;
    fetchUsage()
      .then((u) => setUserTier(u.subscribed ? "pro" : "free"))
      .catch(() => {});
  }, [session?.user?.id, location.pathname]);
  
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // The URL is the single source of truth for which chat is open. Deriving
  // this (instead of mirroring it in state) avoids the render race that made
  // the logo / back buttons bounce users straight back into the chat.
  const chatMatch = useMatch("/chat/:characterId");
  const chatId = chatMatch?.params.characterId ?? null;
  const builtInChat = useMemo<Character | null>(
    () => (chatId ? CHARACTERS.find((c) => c.id === chatId) ?? null : null),
    [chatId],
  );
  const isCustomRef = !!chatId && chatId.startsWith("user:") && !builtInChat;

  // Custom characters live in the DB; resolve the persona for the chat route.
  const [customChat, setCustomChat] = useState<Character | null>(null);
  const [customChatState, setCustomChatState] = useState<"idle" | "loading" | "error">("idle");
  useEffect(() => {
    if (!isCustomRef || !chatId) { setCustomChat(null); setCustomChatState("idle"); return; }
    let cancelled = false;
    setCustomChat(null);
    setCustomChatState("loading");
    getStudioCharacter(chatId)
      .then((sc) => { if (!cancelled) { setCustomChat(studioToCharacter(sc)); setCustomChatState("idle"); } })
      .catch(() => { if (!cancelled) setCustomChatState("error"); });
    return () => { cancelled = true; };
  }, [chatId, isCustomRef]);

  const activeChat = builtInChat ?? (customChat && customChat.id === chatId ? customChat : null);
  const needsCustomResolve =
    isCustomRef && customChatState !== "error" && (!customChat || customChat.id !== chatId);

  const handleSelect = (char: Character) => {
    // Free tier: only the starter roster is chattable; custom companions you created are always available.
    if (!isCustomCharacterId(char.id) && !hasPremiumAccess(userTier) && !isFreeCharacter(char.name)) {
      setShowUpgradeModal(true);
      return;
    }
    navigate(`/chat/${char.id}`);
  };

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
    // PUBLIC SITE: the landing page, pricing, and legal docs are crawlable and
    // viewable without an account (this is what Google indexes). Anything
    // interactive falls through to the auth page.
    const PUBLIC_PATHS = ["/", "/terms", "/privacy", "/acceptable-use", "/ai-disclaimer"];
    const isPublicPage = PUBLIC_PATHS.includes(location.pathname);
    return (
      <div className="flex min-h-screen flex-col bg-stone-50 dark:bg-surface">
        {isPublicPage ? <Nav /> : null}
        <div className="relative flex flex-1 flex-col">
          <Routes>
            <Route path="/" element={<HomePage onSelect={() => navigate("/auth")} userTier="guest" />} />
            <Route path="/terms" element={<LegalPage markdown={termsMd} />} />
            <Route path="/privacy" element={<LegalPage markdown={privacyMd} />} />
            <Route path="/acceptable-use" element={<LegalPage markdown={acceptableUseMd} />} />
            <Route path="/ai-disclaimer" element={<LegalPage markdown={aiDisclaimerMd} />} />
            <Route path="*" element={<AuthPage />} />
          </Routes>
          {isPublicPage ? <Footer /> : null}
        </div>
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-1/4 top-0 h-[800px] w-[800px] rounded-full bg-accent/8 blur-[120px]" />
          <div className="absolute -right-1/4 bottom-0 h-[600px] w-[600px] rounded-full bg-brand-sapphire/8 blur-[100px]" />
        </div>
      </div>
    );
  }
  // -------------------------------------------------------------------------

  // Unknown character id in the URL: bail back home — but wait while a custom
  // persona is still loading from the DB.
  if (chatMatch && !activeChat) {
    if (needsCustomResolve) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-stone-50 text-stone-500 dark:bg-surface dark:text-stone-400">
          Loading…
        </div>
      );
    }
    if (isCustomRef && customChatState === "error") {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-stone-50 px-6 text-center dark:bg-surface">
          <p className="text-stone-600 dark:text-stone-400">Couldn&apos;t load that companion.</p>
          <Link to="/studio" className="rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent-deep">
            Back to Studio
          </Link>
        </div>
      );
    }
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
              <Route path="/studio" element={<StudioPage />} />
              <Route path="/community" element={<CommunityPage />} />
              <Route path="/terms" element={<LegalPage markdown={termsMd} />} />
              <Route path="/privacy" element={<LegalPage markdown={privacyMd} />} />
              <Route path="/acceptable-use" element={<LegalPage markdown={acceptableUseMd} />} />
              <Route path="/ai-disclaimer" element={<LegalPage markdown={aiDisclaimerMd} />} />
              <Route path="/auth" element={<Navigate to="/" replace />} />
              <Route path="/billing/success" element={<BillingResult success />} />
              <Route path="/billing/cancel" element={<BillingResult />} />
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
                        navigate("/#pricing");
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

            <Footer />
          </>
        )}
      </div>

      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-1/4 top-0 h-[800px] w-[800px] rounded-full bg-accent/8 blur-[120px]" />
        <div className="absolute -right-1/4 bottom-0 h-[600px] w-[600px] rounded-full bg-brand-sapphire/8 blur-[100px]" />
      </div>
    </div>
  );
}

// Landing pages for the Stripe checkout redirect targets.
const BillingResult = ({ success = false }: { success?: boolean }) => (
  <section className="flex flex-1 items-center justify-center px-6 py-24">
    <div className="card-gradient max-w-md rounded-3xl p-10 text-center">
      <h2 className="mb-3 font-serif text-3xl font-bold text-stone-900 dark:text-stone-50">
        {success ? "Welcome to PRO 💖" : "Checkout canceled"}
      </h2>
      <p className="mb-8 text-stone-600 dark:text-stone-400">
        {success
          ? "Payment received. Your PRO features unlock within a few seconds — unlimited chats, full feeds, every companion."
          : "No charge was made. You can upgrade anytime from the pricing page."}
      </p>
      <Link
        to="/"
        className="rounded-2xl bg-accent px-8 py-4 font-semibold text-white shadow-lg shadow-accent/25 transition-colors hover:bg-accent-deep"
      >
        Back to your companions
      </Link>
    </div>
  </section>
);
