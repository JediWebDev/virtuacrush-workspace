import { Link } from "react-router-dom";
import { Sparkles, Instagram, Youtube } from "lucide-react";

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.11v-3.5a6.37 6.37 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.75a8.18 8.18 0 0 0 4.77 1.52V6.82a4.85 4.85 0 0 1-1-.13z" />
    </svg>
  );
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037 12.3 12.3 0 0 0-.608 1.25 18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.334-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.334-.946 2.419-2.157 2.419z" />
    </svg>
  );
}

const SOCIAL_LINKS = [
  { label: "Instagram", href: "#", Icon: Instagram },
  { label: "TikTok", href: "#", Icon: TikTokIcon },
  { label: "Discord", href: "#", Icon: DiscordIcon },
  { label: "YouTube", href: "#", Icon: Youtube },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative mt-24 border-t border-black/10 dark:border-white/10 bg-stone-50 dark:bg-surface px-6 pt-14 pb-10 md:px-12">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
                <Sparkles size={16} className="text-white" />
              </div>
              <span className="font-serif text-lg font-bold">VirtuaCrush</span>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-stone-900 dark:text-stone-500">
              Premium AI companions with social profiles, personalized messages, and meaningful connection.
            </p>
          </div>

          <div className="flex flex-wrap gap-12">
            <div>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-widest text-stone-900 dark:text-stone-500">Links</h4>
              <ul className="space-y-3 text-sm text-stone-600 dark:text-stone-400">
                <li>
                  <Link to="/characters" className="transition-colors hover:text-accent">
                    Characters
                  </Link>
                </li>
                <li>
                  <a href="/#whitepaper" className="transition-colors hover:text-accent">
                    Whitepaper
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-widest text-stone-900 dark:text-stone-500">Legal</h4>
              <ul className="space-y-3 text-sm text-stone-600 dark:text-stone-400">
                <li><a href="#" className="hover:text-accent">Terms of Use</a></li>
                <li><a href="#" className="hover:text-accent">Privacy Statement</a></li>
                <li><a href="#" className="hover:text-accent">Acceptable Use Policy</a></li>
                <li><a href="#" className="hover:text-accent">AI Disclaimer</a></li>
              </ul>
            </div>
          </div>

          <div>
            <h4 className="mb-4 text-xs font-semibold uppercase tracking-widest text-stone-900 dark:text-stone-500">Connect with us</h4>
            <div className="mb-5 flex gap-3">
              {SOCIAL_LINKS.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.04] text-stone-600 dark:text-stone-400 transition-colors hover:border-accent/30 hover:text-accent"
                >
                  <Icon className="h-[18px] w-[18px]" />
                </a>
              ))}
            </div>
            <p className="text-sm text-stone-900 dark:text-stone-500">
              <span className="text-stone-600">Support: </span>
              <a href="mailto:help@virtuacrush.com" className="text-stone-600 dark:text-stone-300 hover:text-accent">
                help@virtuacrush.com
              </a>
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/5 pt-8 text-xs text-stone-900 dark:text-stone-500 md:flex-row">
          <p>© {year} VirtuaCrush. All rights reserved.</p>
          <span>Status: Online</span>
        </div>
      </div>
    </footer>
  );
}
