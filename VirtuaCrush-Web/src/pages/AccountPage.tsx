import { useState } from "react";
import {
  User,
  KeyRound,
  CreditCard,
  Receipt,
  Bell,
  type LucideIcon,
} from "lucide-react";

type Section = {
  id: string;
  title: string;
  icon: LucideIcon;
  description: string;
  fields?: { label: string; type: string; placeholder: string }[];
  toggles?: { label: string; description: string; checked: boolean }[];
  action?: string;
  emptyText?: string;
};

const sections: Section[] = [
  {
    id: "personal",
    title: "Personal Info",
    icon: User,
    description: "Update your name and email used across VirtuaCrush.",
    fields: [
      { label: "Full name", type: "text", placeholder: "Your name" },
      { label: "Email", type: "email", placeholder: "you@email.com" },
    ],
  },
  {
    id: "notifications",
    title: "Notifications",
    icon: Bell,
    description: "Manage how characters can contact you when you're away.",
    fields: [
      { label: "Phone number for SMS", type: "tel", placeholder: "+1 (555) 000-0000" },
    ],
    toggles: [
      {
        label: "Email Notifications",
        description: "Receive unread messages and media via email.",
        checked: true,
      },
      {
        label: "SMS Notifications",
        description: "Receive text messages when a character misses you.",
        checked: false,
      },
    ],
  },
  {
    id: "login",
    title: "Login Help",
    icon: KeyRound,
    description: "Reset your password or recover account access.",
    fields: [{ label: "Email for reset link", type: "email", placeholder: "you@email.com" }],
    action: "Send reset link",
  },
  {
    id: "payment",
    title: "Payment Methods",
    icon: CreditCard,
    description: "Manage cards and billing details for subscriptions.",
    emptyText: "No payment methods on file. Add a card when you subscribe.",
  },
  {
    id: "subscription",
    title: "Subscription & Billing",
    icon: Receipt,
    description: "View your plan, renewal date, and invoices.",
    emptyText: "You are on the Free plan. Upgrade anytime from our pricing page.",
  },
];

function SectionCard({ section }: { section: Section }) {
  const Icon = section.icon;
  const [toggleOn, setToggleOn] = useState<boolean[]>(() => section.toggles?.map((t) => t.checked) ?? []);

  const hasFields = Boolean(section.fields?.length);
  const hasToggles = Boolean(section.toggles?.length);
  const hasBody = hasFields || hasToggles;

  return (
    <section
      id={section.id}
      className="rounded-2xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.03] p-6 backdrop-blur-xl"
    >
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Icon size={20} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-50">{section.title}</h2>
          <p className="mt-0.5 text-sm text-stone-600 dark:text-stone-400">{section.description}</p>
        </div>
      </div>
      {hasBody ? (
        <div className="space-y-4">
          {hasFields ? (
            <div className="space-y-4">
              {section.fields!.map((field) => (
                <label key={field.label} className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-900 dark:text-stone-500">
                    {field.label}
                  </span>
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.04] px-4 py-3 text-stone-800 dark:text-stone-100 outline-none transition-colors placeholder:text-stone-600 focus:border-accent/35 focus:ring-2 focus:ring-accent/10"
                  />
                </label>
              ))}
            </div>
          ) : null}

          {hasToggles ? (
            <ul className="space-y-3 pt-1">
              {section.toggles!.map((toggle, index) => {
                const isOn = toggleOn[index] ?? false;
                return (
                  <li
                    key={toggle.label}
                    className="flex items-center justify-between gap-4 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-stone-800 dark:text-stone-100">{toggle.label}</p>
                      <p className="mt-0.5 text-xs text-stone-900 dark:text-stone-500">{toggle.description}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isOn}
                      aria-label={toggle.label}
                      onClick={() =>
                        setToggleOn((prev) => {
                          const next = [...prev];
                          next[index] = !next[index];
                          return next;
                        })
                      }
                      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                        isOn ? "bg-accent" : "bg-stone-600/45"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-200 ease-out ${
                          isOn ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {section.action ? (
            <button
              type="button"
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-deep"
            >
              {section.action}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-stone-900 dark:text-stone-500">{section.emptyText}</p>
      )}
    </section>
  );
}

export default function AccountPage() {
  return (
    <main className="relative px-6 pb-24 pt-4 md:px-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-10 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <User size={28} />
          </div>
          <div>
            <h1 className="font-serif text-3xl font-bold text-stone-900 dark:text-stone-50 md:text-4xl">Account</h1>
            <p className="mt-1 text-stone-600 dark:text-stone-400">Manage your profile, security, and billing.</p>
          </div>
        </div>
        <div className="space-y-6">
          {sections.map((s) => (
            <SectionCard key={s.id} section={s} />
          ))}
        </div>
        <p className="mt-8 text-center text-xs text-stone-900 dark:text-stone-500">
          Need help?{" "}
          <a href="mailto:help@virtuacrush.com" className="text-accent hover:underline">
            help@virtuacrush.com
          </a>
        </p>
      </div>
    </main>
  );
}
