import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { Sparkles, Shield, Check, Coins } from "lucide-react";
import { CHARACTERS, Character } from "../types/character";
import CompanionCard from "../components/CompanionCard";
import { InteractionDemo } from "../components/InteractionDemo";

interface HomePageProps {
  onSelect: (c: Character) => void;
}

const PRICING_TIERS = [
  {
    name: "FREE",
    price: "$0",
    period: "forever",
    highlight: false,
    features: [
      "Limited chats",
      "Feed browsing",
      "Basic interaction",
    ],
  },
  {
    name: "PRO",
    price: "$14.99",
    period: "/ month",
    highlight: true,
    features: [
      "Enhanced memory",
      "Voice messages",
      "Premium feed access",
      "Relationship progression",
      "Higher message cap",
    ],
  },
  {
    name: "VIP",
    price: "$29.99",
    period: "/ month",
    highlight: false,
    features: [
      '"Personalized messages"',
      "Special character arcs",
      "Seasonal story drops",
      "Exclusive voice & video drops",
      '"Late night private mode"',
    ],
  },
];

export default function HomePage({ onSelect }: HomePageProps) {
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
              Real connections.{" "}
              <span className="text-gradient italic font-normal">Virtual sparks.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mx-auto max-w-xl text-lg leading-relaxed text-stone-600 dark:text-stone-400 lg:mx-0"
            >
              Experience true companionship with lifelike avatars who remember you, share their daily moments, and send personalized messages.
            </motion.p>

            <div className="flex flex-wrap justify-center gap-4 lg:justify-start">
              <button
                type="button"
                className="flex items-center gap-2 rounded-2xl bg-accent px-8 py-4 font-semibold text-white shadow-lg shadow-accent/25 transition-all hover:bg-accent-deep active:scale-95"
              >
                <Sparkles size={18} />
                Join Beta Waitlist
              </button>
              <Link
                to="/how-it-works"
                className="glass flex items-center gap-2 rounded-2xl border-stone-500/15 px-8 py-4 font-semibold text-stone-900 transition-all hover:bg-black/[0.06] active:scale-95 dark:text-stone-100 dark:hover:bg-white/[0.07]"
              >
                <Shield size={18} />
                How it Works
              </Link>
            </div>
          </div>

          <div className="w-full max-w-[500px] lg:w-7/12 lg:max-w-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <InteractionDemo />
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
              className="text-sm font-semibold text-accent transition-colors hover:text-rose-200"
            >
              View all characters →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:gap-12">
            {CHARACTERS.map((char) => (
              <CompanionCard
                key={char.id}
                character={char}
                onSelect={onSelect}
              />
            ))}
          </div>
        </section>

        <section className="mb-24">
          <div className="mb-10 text-center">
            <h2 className="font-serif text-3xl font-bold text-stone-900 dark:text-stone-50 md:text-4xl">Pricing</h2>
            <p className="mx-auto mt-3 max-w-xl text-stone-600 dark:text-stone-400">
              Start free, then unlock deeper connection and exclusive content as your relationship grows.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`flex flex-col rounded-2xl border p-6 ${
                  tier.highlight
                    ? "border-accent/40 bg-accent/10 shadow-lg shadow-accent/10"
                    : "border-black/[0.08] dark:border-white/[0.08] glass"
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
                <button
                  type="button"
                  className={`mt-8 w-full rounded-xl py-3 text-sm font-semibold transition-all ${
                    tier.highlight
                      ? "bg-accent text-white hover:bg-accent-deep"
                      : "border border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.04] text-stone-700 dark:text-stone-200 hover:bg-black/[0.08] dark:hover:bg-white/[0.08]"
                  }`}
                >
                  {tier.name === "Free" ? "Get started" : "Choose plan"}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section id="whitepaper" className="mb-24 scroll-mt-24">
          <div className="mb-10 text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
              <Coins size={14} />
              Web3 Tokenomics
            </div>
            <h2 className="font-serif text-3xl font-bold text-stone-900 dark:text-stone-50 md:text-4xl">Two layers, one experience</h2>
            <p className="mx-auto mt-3 max-w-2xl text-stone-600 dark:text-stone-400">
              VirtuaCrush separates in-app spending from the open market so companionship stays stable while $VCRUSH powers the broader ecosystem.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <article className="rounded-2xl border border-black/[0.08] dark:border-white/[0.08] glass p-8">
              <h3 className="mb-1 text-xl font-semibold text-stone-900 dark:text-stone-50">1. $VLINK (IN-APP ONLY)</h3>
              <p className="mb-4 text-sm font-medium text-accent">Non-tradable · Stable · Closed-loop economy</p>
              <p className="mb-4 text-sm text-stone-600 dark:text-stone-400">Used for:</p>
              <ul className="mb-6 space-y-2 text-sm text-stone-600 dark:text-stone-300">
                <li>· Subscriptions</li>
                <li>· Profile customization</li>
                <li>· Gifting</li>
              </ul>
              <p className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm font-medium text-rose-950 dark:text-rose-100/90">
                Key rule: Price of experiences is ALWAYS in $VLINK.
              </p>
            </article>
            <article className="rounded-2xl border border-violet-warm/25 glass p-8">
              <h3 className="mb-1 text-xl font-semibold text-stone-900 dark:text-stone-50">2. $VCRUSH (EXTERNAL TOKEN)</h3>
              <p className="mb-4 text-sm font-medium text-violet-warm">
                100% Optional. Market-driven. Open economy.
              </p>
              <p className="mb-4 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                 Holding and using our optional $VCRUSH token unlocks premium ecosystem advantages.
              </p>
              <p className="mb-2 text-sm text-stone-600 dark:text-stone-400">Used for:</p>
              <ul className="mb-6 space-y-2 text-sm text-stone-600 dark:text-stone-300">
                <li>· Buying $VLINK at a discount</li>
                <li>· Staking for perks</li>
                <li>· VIP status</li>
              </ul>
              <p className="rounded-xl border border-violet-warm/25 bg-violet-warm/10 px-4 py-3 text-sm font-medium leading-relaxed text-stone-700 dark:text-stone-200">
                Key rule: $VCRUSH is an optional upgrade path that rewards our most dedicated community members, but never directly prices in-app
                experiences.
              </p>
            </article>
          </div>
        </section>

      </div>
    </main>
  );
}
