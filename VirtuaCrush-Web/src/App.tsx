import { useState, useEffect, useMemo, type FormEvent } from "react";
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
import HowItWorksPage from "./pages/HowItWorksPage";
import AvatarPage from "./components/AvatarPage";
import StudioPage from "./pages/StudioPage";
import AuthPage from "./pages/AuthPage";
import LegalPage from "./pages/LegalPage";
import termsMd from "./content/legal/terms.md?raw";
import privacyMd from "./content/legal/privacy.md?raw";
import acceptableUseMd from "./content/legal/acceptable-use.md?raw";
import aiDisclaimerMd from "./content/legal/ai-disclaimer.md?raw";
import { joinInterestList, fetchUsage, getStudioCharacter, type StudioCharacter } from "./lib/api";
import { useSession } from './lib/auth-client';

// A simple gradient initial avatar for custom characters (no uploaded image).
function customAvatar(name: string): string {
  const initial = (name.trim()[0] || "?").toUpperCase();
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="#c9717d"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>` +
    `<rect width="240" height="240" fill="url(#g)"/>` +
    `<text x="120" y="158" font-family="Georgia, serif" font-size="120" fill="white" text-anchor="middle">${initial}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Builds a frontend Character from a stored custom persona. */
function toFrontendCharacter(c: StudioCharacter): Character {
  return {
    id: `user:${c.id}`,
    name: c.displayName,
    role: c.tone ? `Your character · ${c.tone}` : "Your character",
    bio: "",
    tags: [],
    image: customAvatar(c.displayName),
    premiumVideo: "",
    persona: c.core,
    currentAffinity: 0,
    rivalName: "",
    rivalAvatar: "",
    rivalSnarkComment: "",
    feedPosts: [],
  };
}

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
    setCustomChatState("loading");
    getStudioCharacter(chatId)
      .then((sc) => { if (!cancelled) { setCustomChat(toFrontendCharacter(sc)); setCustomChatState("idle"); } })
      .catch(() => { if (!cancelled) setCustomChatState("error"); });
    return () => { cancelled = true; };
  }, [chatId, isCustomRef]);

  const activeChat = builtInChat ?? (customChat && customChat.id === chatId ? customChat : null);
  const handleSelect = (char: Character) => {
    // Free tier: only the starter roster is chattable; others pitch the upgrade.
    if (!hasPremiumAccess(userTier) && !isFreeCharacter(char.name)) {
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
    const PUBLIC_PATHS = ["/", "/how-it-works", "/terms", "/privacy", "/acceptable-use", "/ai-disclaimer"];
    const isPublicPage = PUBLIC_PATHS.includes(location.pathname);
    return (
      <div className="flex min-h-screen flex-col bg-stone-50 dark:bg-surface">
        {isPublicPage ? <Nav /> : null}
        <div className="relative flex flex-1 flex-col">
          <Routes>
            <Route path="/" element={<HomePage onSelect={() => navigate("/auth")} userTier="guest" />} />
            <Route path="/how-it-works" element={<HowItWorksPage />} />
            <Route path="/terms" element={<LegalPage markdown={termsMd} />} />
            <Route path="/privacy" element={<LegalPage markdown={privacyMd} />} />
            <Route path="/acceptable-use" element={<LegalPage markdown={acceptableUseMd} />} />
            <Route path="/ai-disclaimer" element={<LegalPage markdown={aiDisclaimerMd} />} />
            <Route path="*" element={<AuthPage />} />
          </Routes>
          {isPublicPage ? (
            <>
              <CTASection />
              <Footer />
            </>
          ) : null}
        </div>
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-1/4 top-0 h-[800px] w-[800px] rounded-full bg-accent/10 blur-[120px]" />
          <div className="absolute -right-1/4 bottom-0 h-[600px] w-[600px] rounded-full bg-violet-warm/10 blur-[100px]" />
        </div>
      </div>
    );
  }
  // -------------------------------------------------------------------------

  // Unknown character id in the URL: bail back home — but wait while a custom
  // persona is still loading from the DB.
  if (chatMatch && !activeChat) {
    if (isCustomRef && customChatState === "loading") {
      return (
        <div className="flex min-h-screen items-center justify-center bg-stone-50 text-stone-500 dark:bg-surface dark:text-stone-400">
          Loading…
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
              <Route path="/how-it-works" element={<HowItWorksPage />} />
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

// Landing pages for the Stripe checkout redirect targets.
const BillingResult = ({ success = false }: { success?: boolean }) => (
  <section className="flex flex-1 items-center justify-center px-6 py-24">
    <div className="max-w-md rounded-3xl border border-black/10 glass p-10 text-center dark:border-white/10">
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

const CTASection = () => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("sending");
    try {
      await joinInterestList(email.trim());
      setStatus("done");
    } catch {
      setStatus("error");
    }
  };

  return (
    <section className="bg-gradient-to-b from-transparent to-accent/5 px-6 py-24 md:px-12">
      <div className="relative mx-auto max-w-4xl overflow-hidden rounded-[3rem] border border-black/10 dark:border-white/10 glass p-12 text-center">
        <div className="absolute left-1/2 top-0 h-40 w-40 -translate-x-1/2 -translate-y-1/2 bg-accent/15 blur-3xl" />
        <span className="mb-4 inline-flex rounded-full bg-accent/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-accent">
          Coming soon
        </span>
        <h2 className="mb-6 font-serif text-4xl font-bold md:text-5xl">Join the VIP Interest List</h2>
        <p className="mx-auto mb-10 max-w-xl text-stone-600 dark:text-stone-400">
          We&apos;re launching with Free and PRO. VIP — personalized audio &amp; video drops, SMS
          messages, and custom characters — opens soon. Leave your email and you&apos;ll be the
          first to know.
        </p>
        {status === "done" ? (
          <p className="mx-auto max-w-md rounded-2xl border border-accent/30 bg-accent/10 px-6 py-4 font-medium text-accent">
            You&apos;re on the list — we&apos;ll email you when VIP opens. 💌
          </p>
        ) : (
          <form onSubmit={submit} className="mx-auto flex max-w-md flex-col gap-4 sm:flex-row">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="flex-1 rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.04] px-6 py-4 text-stone-800 dark:text-stone-100 outline-none transition-colors placeholder:text-stone-500 focus:border-accent/40 focus:ring-2 focus:ring-accent/15"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="rounded-2xl bg-accent px-8 py-4 font-semibold text-white shadow-lg shadow-accent/25 transition-all hover:bg-accent-deep active:scale-95 disabled:opacity-60"
            >
              {status === "sending" ? "Joining…" : "Notify me"}
            </button>
          </form>
        )}
        {status === "error" ? (
          <p className="mt-4 text-sm text-red-500">Something went wrong — please try again.</p>
        ) : null}
      </div>
    </section>
  );
};

