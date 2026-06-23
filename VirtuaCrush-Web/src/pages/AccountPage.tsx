import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  User,
  KeyRound,
  Receipt,
  Bell,
  LogOut,
  Loader2,
} from "lucide-react";
import { useSession, signOut } from "../lib/auth-client";
import {
  ApiError,
  api,
  assetUrl,
  cancelSubscription,
  fetchSubscription,
  pauseSubscription,
  resumeSubscription,
  type SubscriptionInfo,
} from "../lib/api";
import * as profileApi from "../lib/profile";
import { customAvatar } from "../lib/customCharacter";

function formatRenewalDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function SectionCard({
  title,
  icon: Icon,
  description,
  children,
}: {
  title: string;
  icon: typeof User;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="card-gradient-subtle rounded-2xl p-6 backdrop-blur-xl">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Icon size={20} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-50">{title}</h2>
          <p className="mt-0.5 text-sm text-stone-600 dark:text-white">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function AccountPage() {
  const { data: session } = useSession();
  const [avatarKey, setAvatarKey] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");

  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [subLoading, setSubLoading] = useState(true);
  const [subBusy, setSubBusy] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);

  const [emailNotifs, setEmailNotifs] = useState(true);
  const [smsNotifs, setSmsNotifs] = useState(false);

  useEffect(() => {
    profileApi
      .fetchProfile()
      .then((p) => {
        setAvatarKey(p.avatarKey ?? null);
        setDisplayName(p.profile.displayName || session?.user?.name || "");
      })
      .catch(() => {});
  }, [session?.user?.name]);

  useEffect(() => {
    setSubLoading(true);
    fetchSubscription()
      .then(setSubscription)
      .catch(() => setSubscription(null))
      .finally(() => setSubLoading(false));
  }, []);

  const handleCheckout = async () => {
    setSubError(null);
    setSubBusy(true);
    try {
      const { url } = await api<{ url: string }>("/api/stripe/checkout", { method: "POST" });
      window.location.href = url;
    } catch {
      setSubError("Couldn't open checkout. Please try again.");
      setSubBusy(false);
    }
  };

  const runSubAction = async (action: () => Promise<SubscriptionInfo>) => {
    setSubError(null);
    setSubBusy(true);
    try {
      setSubscription(await action());
    } catch (e) {
      if (e instanceof ApiError && e.body?.error === "no_stripe_subscription") {
        setSubError("This plan was granted manually and can't be changed here.");
      } else {
        setSubError("That billing action failed. Please try again.");
      }
    } finally {
      setSubBusy(false);
    }
  };

  const handleRemoveAvatar = async () => {
    try {
      await profileApi.deleteProfileAvatar();
      setAvatarKey(null);
    } catch {
      /* noop */
    }
  };

  const avatarSrc = avatarKey ? assetUrl(avatarKey) : customAvatar(displayName || session?.user?.email || "?");
  const renewalLabel = formatRenewalDate(subscription?.currentPeriodEnd ?? null);

  return (
    <main className="relative px-6 pb-24 pt-4 md:px-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-10 flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-3xl font-bold text-stone-900 dark:text-stone-50 md:text-4xl">Account</h1>
            <p className="mt-1 text-stone-600 dark:text-white">
              {session?.user?.email
                ? `Signed in as ${session.user.email}`
                : "Manage your profile, notifications, and billing."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => signOut()}
            className="flex items-center gap-2 rounded-xl border border-black/10 bg-black/[0.04] px-4 py-2.5 text-sm font-semibold text-stone-700 transition-colors hover:border-brand-aqua/40 hover:text-brand-aqua dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:hover:text-brand-aqua"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>

        <div className="space-y-6">
          <SectionCard
            title="Profile photo"
            icon={User}
            description="Your in-game avatar is chosen from preset character art."
          >
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-black/10 shadow-sm dark:border-white/10">
                <img src={avatarSrc} alt={displayName || "Your profile photo"} className="h-full w-full object-cover object-top" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-stone-600 dark:text-stone-300">
                  Pick your playable character and look from the preset library (coming soon).
                </p>
                {avatarKey ? (
                  <button
                    type="button"
                    onClick={() => void handleRemoveAvatar()}
                    className="mt-2 text-xs font-semibold text-stone-500 transition-colors hover:text-red-500 dark:text-stone-400 dark:hover:text-red-400"
                  >
                    Reset to default
                  </button>
                ) : null}
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Notifications"
            icon={Bell}
            description="Manage your notifications from Virtua Crush and your character companions who may wish to message you."
          >
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-900 dark:text-stone-400">
                  Phone number for SMS
                </span>
                <input
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  className="w-full rounded-xl border border-black/10 bg-black/[0.04] px-4 py-3 text-stone-800 outline-none transition-colors placeholder:text-stone-500 focus:border-accent/35 focus:ring-2 focus:ring-accent/10 dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-100"
                />
              </label>
              <ul className="space-y-3">
                {[
                  {
                    label: "Email Notifications",
                    description: "Receive unread messages and media via email.",
                    on: emailNotifs,
                    set: setEmailNotifs,
                  },
                  {
                    label: "SMS Notifications",
                    description: "Receive text messages when a character misses you.",
                    on: smsNotifs,
                    set: setSmsNotifs,
                  },
                ].map((toggle) => (
                  <li
                    key={toggle.label}
                    className="flex items-center justify-between gap-4 rounded-xl border border-black/[0.06] bg-black/[0.02] px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.02]"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-stone-800 dark:text-stone-100">{toggle.label}</p>
                      <p className="mt-0.5 text-xs text-stone-600 dark:text-stone-400">{toggle.description}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={toggle.on}
                      aria-label={toggle.label}
                      onClick={() => toggle.set(!toggle.on)}
                      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                        toggle.on ? "bg-accent" : "bg-stone-600/45"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-200 ease-out ${
                          toggle.on ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </SectionCard>

          <SectionCard
            title="Login Help"
            icon={KeyRound}
            description="Reset your password or recover account access."
          >
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-900 dark:text-stone-400">
                  Email for reset link
                </span>
                <input
                  type="email"
                  placeholder="you@email.com"
                  defaultValue={session?.user?.email ?? ""}
                  className="w-full rounded-xl border border-black/10 bg-black/[0.04] px-4 py-3 text-stone-800 outline-none transition-colors placeholder:text-stone-500 focus:border-accent/35 focus:ring-2 focus:ring-accent/10 dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-100"
                />
              </label>
              <button
                type="button"
                className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-deep"
              >
                Send reset link
              </button>
            </div>
          </SectionCard>

          <SectionCard
            title="Subscription & Billing"
            icon={Receipt}
            description="View your plan, renewal date, and manage billing."
          >
            {subLoading ? (
              <p className="flex items-center gap-2 text-sm text-stone-600 dark:text-white">
                <Loader2 size={16} className="animate-spin" /> Loading subscription…
              </p>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-black/[0.06] bg-black/[0.02] px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">
                    Current plan:{" "}
                    <span className="text-accent">{subscription?.plan === "pro" ? "Pro" : "Free"}</span>
                  </p>
                  {subscription?.status ? (
                    <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
                      Status: {subscription.status.replace(/_/g, " ")}
                      {subscription.paused ? " · Paused" : ""}
                      {subscription.cancelAtPeriodEnd ? " · Cancels at period end" : ""}
                    </p>
                  ) : null}
                  {subscription?.subscribed && renewalLabel ? (
                    <p className="mt-2 text-sm text-stone-700 dark:text-white">
                      {subscription.cancelAtPeriodEnd
                        ? `Your subscription ends on ${renewalLabel}.`
                        : subscription.paused
                          ? `Billing is paused. Access continues until ${renewalLabel}.`
                          : `Your subscription renews on ${renewalLabel}.`}
                    </p>
                  ) : !subscription?.subscribed ? (
                    <p className="mt-2 text-sm text-stone-700 dark:text-white">
                      You are on the Free plan. Upgrade for unlimited chats, enhanced memory, and all characters.
                    </p>
                  ) : null}
                </div>

                {subError ? <p className="text-sm text-red-500">{subError}</p> : null}

                <div className="flex flex-wrap gap-2">
                  {!subscription?.subscribed ? (
                    <button
                      type="button"
                      onClick={() => void handleCheckout()}
                      disabled={subBusy}
                      className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-deep disabled:opacity-50"
                    >
                      Upgrade to Pro
                    </button>
                  ) : null}

                  {subscription?.subscribed && subscription.stripeManaged ? (
                    <>
                      {subscription.paused || subscription.cancelAtPeriodEnd ? (
                        <button
                          type="button"
                          disabled={subBusy}
                          onClick={() => void runSubAction(resumeSubscription)}
                          className="rounded-xl border border-black/10 px-5 py-2.5 text-sm font-semibold text-stone-800 transition-colors hover:border-brand-aqua/40 hover:text-brand-aqua dark:border-white/10 dark:text-white dark:hover:text-brand-aqua disabled:opacity-50"
                        >
                          Resume subscription
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={subBusy}
                            onClick={() => void runSubAction(pauseSubscription)}
                            className="rounded-xl border border-black/10 px-5 py-2.5 text-sm font-semibold text-stone-800 transition-colors hover:border-brand-aqua/40 hover:text-brand-aqua dark:border-white/10 dark:text-white dark:hover:text-brand-aqua disabled:opacity-50"
                          >
                            Pause subscription
                          </button>
                          <button
                            type="button"
                            disabled={subBusy}
                            onClick={() => void runSubAction(cancelSubscription)}
                            className="rounded-xl border border-red-500/30 px-5 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400 disabled:opacity-50"
                          >
                            Cancel subscription
                          </button>
                        </>
                      )}
                    </>
                  ) : subscription?.subscribed && !subscription.stripeManaged ? (
                    <p className="text-xs text-stone-600 dark:text-stone-400">
                      Your Pro access was granted outside Stripe billing. Contact support to change your plan.
                    </p>
                  ) : null}

                </div>
              </div>
            )}
          </SectionCard>
        </div>

        <p className="mt-8 text-center text-xs text-stone-600 dark:text-stone-400">
          Need help?{" "}
          <a href="mailto:help@virtuacrush.com" className="text-accent hover:underline">
            help@virtuacrush.com
          </a>
        </p>
      </div>
    </main>
  );
}
