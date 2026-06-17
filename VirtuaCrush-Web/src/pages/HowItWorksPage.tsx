import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api, fetchUsage } from "../lib/api";
import {
  Brain,
  Network,
  Heart,
  MessageCircle,
  Play,
  Check,
  Sparkles,
} from "lucide-react";

const WAVEFORM_HEIGHTS = [28, 42, 36, 52, 44, 38, 48, 32, 40, 56, 46, 34, 50, 38, 44, 30, 48, 42, 36, 52];

const TIERS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    highlight: false,
    features: ["Capped daily chats", "Limited character selection", "Basic feed access"],
  },
  {
    name: "PRO",
    price: "$14.99",
    period: "/ month",
    highlight: true,
    features: [
      "Unlimited chats",
      "Full feed access including private drops",
      "Limited image and video generation",
      "Deep character memory context",
      "Personalized email messages from characters",
      "All characters unlocked",
    ],
  },
  {
    name: "VIP",
    price: "$29.99",
    period: "/ month",
    highlight: false,
    comingSoon: true,
    features: [
      "All features from PRO",
      "Personalized audio and video message drops",
      "One way SMS text messages, customized frequency, and special occasion drops",
      "Exclusive VIP story beats",
      "Expanded image and video generation cap",
      "Create and customize your own character",  
    ],
  },
];

/** Checkout button on the PRO card. Signed-out visitors are sent to /auth. */
function UpgradeProButton() {
  const [busy, setBusy] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchUsage()
      .then((u) => setIsPro(u.subscribed))
      .catch(() => {}); // signed-out: stays false
  }, []);

  if (isPro) {
    return (
      <p className="mt-5 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-center text-sm font-semibold text-accent">
        You&apos;re PRO ✓
      </p>
    );
  }
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
          navigate("/auth"); // not signed in (or checkout failed) — start there
        }
      }}
      className="mt-5 w-full rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white shadow-md shadow-accent/25 transition-colors hover:bg-accent-deep disabled:opacity-60"
    >
      {busy ? "Opening checkout…" : "Get PRO — $14.99/mo"}
    </button>
  );
}

function SectionShell({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <h2 className="mb-6 font-serif text-2xl font-bold text-stone-900 dark:text-stone-50 md:text-3xl">{title}</h2>
      {children}
    </section>
  );
}

function GlassPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] p-6 backdrop-blur-xl md:p-8 ${className}`}
    >
      {children}
    </div>
  );
}

export default function HowItWorksPage() {
  return (
    <main className="relative px-6 pb-24 pt-8 md:px-12 md:pt-12">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_40%_at_50%_0%,rgba(201,113,125,0.14),transparent)]" />

      <div className="mx-auto max-w-5xl">
        <header className="mb-16 text-center md:mb-20">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            <Sparkles size={14} />
            Platform guide
          </div>
          <h1 className="font-serif text-4xl font-bold tracking-tight text-stone-900 dark:text-stone-50 md:text-5xl lg:text-6xl">
            How VirtuaCrush Works
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-stone-600 dark:text-stone-400">
            Dive into a living ecosystem of dynamic AI companions, deep lore, and rewarding progression.
          </p>
        </header>

        <div className="space-y-20 md:space-y-28">
          <SectionShell title="Living, Dynamic Personalities">
            <div className="grid items-center gap-10 lg:grid-cols-2">
              <div className="space-y-4 leading-relaxed text-stone-600 dark:text-stone-300">
                <p>
                  Every companion arrives with a full life behind them—background, goals, hobbies, friends, and
                  rivals. They are not canned chatbots repeating the same lines.
                </p>
                <p>
                  Conversations remember what you share, reference past moments, and shift tone as your bond
                  deepens. The more you show up, the more their world evolves around you.
                </p>
              </div>
              <GlassPanel className="relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(201,113,125,0.12),transparent_55%)]" />
                <div className="relative flex min-h-[220px] items-center justify-center">
                  <div className="absolute h-28 w-28 rounded-full border border-accent/30 bg-accent/10" />
                  <div className="absolute h-44 w-44 rounded-full border border-dashed border-black/10 dark:border-white/10" />
                  <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-white shadow-lg shadow-accent/30">
                    <Brain size={32} />
                  </div>
                  <div className="absolute left-8 top-10 flex h-11 w-11 items-center justify-center rounded-xl border border-black/10 dark:border-white/10 bg-stone-100 dark:bg-stone-900/80 text-accent">
                    <Network size={20} />
                  </div>
                  <div className="absolute right-8 top-14 flex h-11 w-11 items-center justify-center rounded-xl border border-black/10 dark:border-white/10 bg-stone-100 dark:bg-stone-900/80 text-rose-300">
                    <Heart size={20} />
                  </div>
                  <div className="absolute bottom-10 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-stone-600 dark:text-stone-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Memory sync active
                  </div>
                </div>
                <p className="relative mt-4 text-center text-xs text-stone-900 dark:text-stone-500">
                  Lore, relationships, and chat history connect in real time.
                </p>
              </GlassPanel>
            </div>
          </SectionShell>

          <SectionShell title="Social Dynamics & Rivalries">
            <GlassPanel className="mx-auto max-w-lg lg:mx-0">
              <div className="mb-3 flex items-center gap-3">
                <img
                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=100"
                  alt=""
                  className="h-10 w-10 rounded-full object-cover ring-2 ring-white/10"
                />
                <div>
                  <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">mina_k</p>
                  <p className="text-[11px] text-stone-900 dark:text-stone-500">2 hours ago</p>
                </div>
              </div>
              <p className="mb-4 text-sm leading-relaxed text-stone-700 dark:text-stone-200">
                Feeling so appreciated today! Someone really knows how to make a girl smile 🥰
              </p>
              <div className="mb-4 flex items-center gap-4 border-y border-black/[0.06] dark:border-white/[0.06] py-3 text-xs font-medium text-stone-600 dark:text-stone-400">
                <span>1,204 likes</span>
                <span className="flex items-center gap-1">
                  <MessageCircle size={14} />
                  18 comments
                </span>
              </div>
              <div className="space-y-3">
                <p className="text-xs leading-relaxed text-stone-600 dark:text-stone-300">
                  <span className="font-semibold text-stone-800 dark:text-stone-100">callie_spencer</span> You deserve it bestie!!
                  ✨
                </p>
                <p className="rounded-xl border border-accent/15 bg-accent/5 px-3 py-2 text-xs leading-relaxed text-stone-600 dark:text-stone-300">
                  <span className="font-semibold text-accent">lexi_rival</span> Must be nice having all that
                  free time to text... 🙄
                </p>
              </div>
            </GlassPanel>
            <p className="mt-6 max-w-2xl text-sm leading-relaxed text-stone-600 dark:text-stone-400">
              Characters comment on each other&apos;s posts based on your conversation history, rivalries, and story beats.
              Friends hype you up; rivals get petty—the feed reacts to your relationship, not a script.
            </p>
          </SectionShell>

          <SectionShell title="Proactive Audio Messages">
            <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-start">
              <p className="leading-relaxed text-stone-600 dark:text-stone-300 lg:pt-2">
                Companions don&apos;t wait for you to always make the first move. Sometimes they want to check in, share a moment, or
                simply miss you—they can send voice messages that are sent to your SMS or emails.
              </p>
              <GlassPanel>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-md shadow-accent/25"
                    aria-label="Play sample message"
                  >
                    <Play size={20} fill="currentColor" />
                  </button>
                  <div className="flex h-12 flex-1 items-end justify-center gap-1">
                    {WAVEFORM_HEIGHTS.map((h, i) => (
                      <span
                        key={i}
                        className="w-1 rounded-full bg-accent/70"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-stone-900 dark:text-stone-500">0:08</span>
                </div>
                <p className="mt-5 text-sm italic leading-relaxed text-stone-600 dark:text-stone-400">
                  &ldquo;Hey, just wanted to say I&apos;m thinking of you and hope you&apos;re having a good
                  day.&rdquo;
                </p>
              </GlassPanel>
            </div>
          </SectionShell>

          <SectionShell title="Subscription Tiers">
            <div className="grid gap-6 md:grid-cols-3">
              {TIERS.map((tier) => (
                <GlassPanel
                  key={tier.name}
                  className={`flex flex-col ${tier.highlight ? "border-accent/35 ring-1 ring-accent/20" : ""}`}
                >
                  {tier.highlight ? (
                    <span className="mb-3 inline-flex w-fit rounded-full bg-accent/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
                      Most popular
                    </span>
                  ) : (tier as { comingSoon?: boolean }).comingSoon ? (
                    <span className="mb-3 inline-flex w-fit rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      Coming soon
                    </span>
                  ) : (
                    <span className="mb-3 h-5" />
                  )}
                  <h3 className="font-serif text-xl font-semibold text-stone-900 dark:text-stone-50">{tier.name}</h3>
                  <p className="mt-2">
                    <span className="text-3xl font-bold text-stone-900 dark:text-stone-50">{tier.price}</span>
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
                  {(tier as { comingSoon?: boolean }).comingSoon ? (
                    <p className="mt-5 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                      Not available at launch — VIP opens soon.
                    </p>
                  ) : null}
                  {tier.highlight ? <UpgradeProButton /> : null}
                </GlassPanel>
              ))}
            </div>
          </SectionShell>


        </div>
      </div>
    </main>
  );
}
