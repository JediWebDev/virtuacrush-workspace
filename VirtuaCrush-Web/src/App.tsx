/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Routes, Route, useParams, useNavigate, useLocation } from "react-router-dom";
import { Character, CHARACTERS } from "./types/character";
import ChatInterface from "./components/ChatInterface";
import Footer from "./components/Footer";
import Nav from "./components/Nav";
import HomePage from "./pages/HomePage";
import BrowseCharactersPage from "./pages/BrowseCharactersPage";
import AccountPage from "./pages/AccountPage";
import HowItWorksPage from "./pages/HowItWorksPage";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string }) => Promise<string[]>;
    };
  }
}

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
  const [vCrushTokens] = useState(150);
  const [vLinkTokens] = useState(500);
  const [activeChat, setActiveChat] = useState<Character | null>(null);
  const [autoOpenMessageId, setAutoOpenMessageId] = useState<string | undefined>();
  const [isWalletConnected, setIsWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [affinityByCharacter, setAffinityByCharacter] = useState<Record<string, number>>(() =>
    Object.fromEntries(CHARACTERS.map((c) => [c.id, c.currentAffinity]))
  );

  const connectWallet = async () => {
    if (typeof window.ethereum !== "undefined") {
      try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        if (accounts?.length) {
          setIsWalletConnected(true);
          setWalletAddress(accounts[0]);
        }
      } catch (error: unknown) {
        console.error("MetaMask connection error:", error);
        alert("Failed to connect to MetaMask. Please ensure the extension is unlocked and try again.");
      }
    } else {
      alert("MetaMask not detected. Please install MetaMask to connect your wallet.");
    }
  };

  const handleSelect = (char: Character) => {
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
        setActiveChat({
          ...char,
          currentAffinity: affinityByCharacter[char.id] ?? char.currentAffinity,
        });
        if (state.openMessage) {
          setAutoOpenMessageId(state.openMessage);
        }
      }
      window.history.replaceState({}, document.title);
      return;
    }

    if (!location.pathname.startsWith("/chat/")) {
      setActiveChat(null);
      setAutoOpenMessageId(undefined);
    }
  }, [location.pathname, location.state, affinityByCharacter]);

  return (
    <div className="flex min-h-screen flex-col bg-stone-50 dark:bg-surface">
      <Nav
        isWalletConnected={isWalletConnected}
        walletAddress={walletAddress}
        vCrushTokens={vCrushTokens}
        vLinkTokens={vLinkTokens}
        onConnectWallet={connectWallet}
        onLogoClick={() => setActiveChat(null)}
      />

      <div className="relative flex flex-1 flex-col">
        {activeChat ? (
          <ChatInterface
            character={activeChat}
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
              <Route path="/" element={<HomePage onSelect={handleSelect} />} />
              <Route path="/characters" element={<BrowseCharactersPage onSelect={handleSelect} />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/how-it-works" element={<HowItWorksPage />} />
              <Route path="/chat/:characterId" element={<ChatDeepLink onSelect={handleSelect} />} />
            </Routes>

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
        Sign up to be notified of our $VCRUSH pre-sale token launch and receive immediate priority for the limited Beta release.
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
