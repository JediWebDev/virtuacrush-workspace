import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { motion } from "motion/react";
import { Sparkles, Check, MessageCircleHeart } from "lucide-react";
import { CHARACTERS, Character } from "../types/character";
import { matchesCharacterName, SPOTLIGHT_CHARS, type UserTier } from "../types/subscription";
import CompanionCard from "../components/CompanionCard";
import HeroShowcase from "../components/HeroShowcase";
import { api } from "../lib/api";

/** Checkout button used on the PRO pricing card. */
function UpgradeProButton() {
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { url } = await api<{ url: string }>("/api/stripe/checkout", { method: "POST" });
          window.location.href = url;
        } catch {
          setBusy(false);
          navigate("/auth");
        }
      }}
      className="mt-8 w-full rounded-xl bg-accent py-3 text-sm font-semibold text-white transition-all hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? "Opening checkout…" : "Choose plan"}
    </button>
  );
}

interface HomePageProps {
  onSelect: (c: Character) => void;
  userTier: UserTier;
}

const PRICING_TIERS = [
  {
    name: "FREE",
    price: "$0",
    period: "forever",
    highlight: false,
    features: [
      "Limited chats",
      "Social feed previews",
      "Limited character selections",
    ],
  },
  {
    name: "PRO",
    price: "$14.99",
    period: "/ month",
    highlight: true,
    features: [
      "Unlimited chats",
      "Full social feed access",
      "Image generation",
      "All characters unlocked",
      "Custom characters and story arcs",
    ],
  },
];

export default function HomePage({ onSelect, userTier }: HomePageProps) {
  return (
    <main className="relative px-6 py-12 md:px-12 md:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-32 flex flex-col items-center gap-16 lg:flex-row">
          <div className="space-y-8 text-center lg:w-5/12 lg:text-left">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="font-hero text-5xl font-medium leading-[1.12] tracking-tight text-stone-900 dark:text-stone-50 md:text-7xl lg:text-8xl"
            >
              The more you chat,{" "}
              <span className="text-gradient italic font-normal">the deeper it gets.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mx-auto max-w-xl text-lg leading-relaxed text-stone-600 dark:text-white lg:mx-0"
            >
              Every AI has their own story, their own circle, their own personalities. The closer you get, the more they reveal.
            </motion.p>

            <div className="flex flex-wrap justify-center gap-4 lg:justify-start">
              <Link
                to="/characters"
                className="flex items-center gap-2 rounded-2xl bg-accent px-8 py-4 font-semibold text-white shadow-lg shadow-accent/25 transition-all hover:bg-accent-deep active:scale-95"
              >
                <MessageCircleHeart size={18} />
                Try Now
              </Link>
              <a
                href="#pricing"
                className="glass flex items-center gap-2 rounded-2xl border-stone-500/15 px-8 py-4 font-semibold text-stone-900 transition-all hover:bg-black/[0.06] active:scale-95 dark:text-stone-100 dark:hover:bg-white/[0.07]"
              >
                View Plans
              </a>
            </div>
          </div>

          <div className="w-full max-w-[500px] lg:w-7/12 lg:max-w-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <HeroShowcase />
            </motion.div>
          </div>
        </div>

        <section className="mb-24">
          <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-serif text-3xl font-bold text-stone-900 dark:text-stone-50 md:text-4xl">Character Spotlight</h2>
              <p className="mt-2 max-w-lg text-stone-600 dark:text-stone-400">
                Meet a few of the companions waiting to connect with you.
              </p>
            </div>
            <Link
              to="/characters"
              className="text-sm font-semibold text-accent transition-colors hover:text-brand-aqua"
            >
              View all characters
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:gap-12">
            {CHARACTERS.filter((char) => matchesCharacterName(char.name, SPOTLIGHT_CHARS)).map((char) => (
              <CompanionCard
                key={char.id}
                character={char}
                onSelect={onSelect}
                userTier={userTier}
              />
            ))}
          </div>
        </section>

        <section id="pricing" className="mb-24 scroll-mt-24">
          <div className="mb-10 text-center">
            <h2 className="font-serif text-3xl font-bold text-stone-900 dark:text-stone-50 md:text-4xl">Pricing</h2>
            <p className="mx-auto mt-3 max-w-xl text-stone-600 dark:text-stone-400">
              Start free, then unlock all characters, deeper connections and exclusive content with a paid subscription.
            </p>
          </div>
          <div className="mx-auto grid max-w-3xl grid-cols-1 gap-6 md:grid-cols-2">
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`flex flex-col rounded-2xl p-6 ${
                  tier.highlight
                    ? "card-gradient shadow-lg shadow-accent/15 ring-1 ring-accent/25"
                    : "card-gradient-subtle glass"
                }`}
              >
                <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-50">{tier.name}</h3>
                <p className="mt-2">
                  <span className="font-serif text-3xl font-bold text-stone-900 dark:text-stone-50">{tier.price}</span>
                  <span className="text-sm text-stone-900 dark:text-stone-500">{tier.period}</span>
                </p>
                <ul className="mt-6 flex-1 space-y-3">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-stone-600 dark:text-stone-300">
                      <Check size={16} className="mt-0.5 shrink-0 text-accent" />
                      {feature}
                    </li>
                  ))}
                </ul>
                {tier.highlight ? (
                  <UpgradeProButton />
                ) : (
                  <button
                    type="button"
                    className="mt-8 w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.04] py-3 text-sm font-semibold text-stone-700 dark:text-stone-200 transition-all hover:bg-black/[0.08] dark:hover:bg-white/[0.08]"
                  >
                    {tier.name === "FREE" ? "Get started" : "Join waitlist"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

      </div>
    </main>
  );
}
