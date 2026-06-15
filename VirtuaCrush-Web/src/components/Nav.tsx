import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { User, Menu, X, Sun, Moon, Shirt } from "lucide-react";
import { useSession } from "../lib/auth-client";
import VirtuaCrushLogo from "./VirtuaCrushLogo";

const navLinkClass = (active: boolean) =>
  `text-sm font-medium transition-all duration-200 hover:scale-105 active:scale-95 ${
    active ? "text-accent" : "text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
  }`;

const iconButtonClass =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/10 bg-black/[0.04] text-stone-600 transition-all duration-200 hover:scale-105 hover:border-accent/30 hover:bg-black/[0.08] hover:text-stone-900 active:scale-95 dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-300 dark:hover:bg-white/[0.08] dark:hover:text-stone-50";

export default function Nav() {
  const { pathname } = useLocation();
  const { data: session } = useSession();
  const authed = Boolean(session?.user);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const browseActive = pathname === "/characters";
  const howItWorksActive = pathname === "/how-it-works";
  const avatarActive = pathname === "/avatar";

  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMobileMenuOpen]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <header ref={mobileMenuRef} className="relative z-10 px-6 py-8 md:px-12">
      <div className="flex items-center justify-between">
        <Link
          to="/"
          onClick={() => setIsMobileMenuOpen(false)}
          className="flex items-center gap-3 transition-all duration-200 hover:scale-[1.02] hover:opacity-90 active:scale-[0.98]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white shadow-lg shadow-accent/25">
            <VirtuaCrushLogo className="h-6 w-6" />
          </div>
          <span className="font-serif text-2xl font-bold tracking-tight text-stone-900 dark:text-white">
            Virtua Crush
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3 md:gap-5">
          <nav className="hidden items-center gap-5 md:flex">
            <Link to="/characters" className={navLinkClass(browseActive)}>
              Browse Characters
            </Link>
            <Link to="/how-it-works" className={navLinkClass(howItWorksActive)}>
              How It Works
            </Link>
            <Link to="/avatar" className={navLinkClass(avatarActive)}>
              Avatar
            </Link>
          </nav>

          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            {!authed ? (
              <Link
                to="/auth"
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-md shadow-accent/25 transition-all hover:bg-accent-deep active:scale-95"
              >
                Sign in
              </Link>
            ) : null}

            <button
              type="button"
              onClick={() => setIsDarkMode((dark) => !dark)}
              className={iconButtonClass}
              aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            {authed ? (
              <Link to="/account" className={iconButtonClass} aria-label="Account and profile">
                <User size={20} />
              </Link>
            ) : null}

            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((open) => !open)}
              className={`${iconButtonClass} md:hidden`}
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {isMobileMenuOpen ? (
        <nav className="absolute left-6 right-6 top-full z-50 mt-2 flex flex-col gap-1 rounded-2xl border border-black/10 dark:border-white/10 bg-stone-50 dark:bg-surface p-3 shadow-2xl backdrop-blur-xl md:hidden">
          <Link
            to="/characters"
            onClick={closeMobileMenu}
            className={`rounded-xl px-4 py-3 transition-all duration-200 hover:scale-[1.01] hover:bg-black/[0.04] dark:bg-white/[0.04] active:scale-[0.99] ${navLinkClass(browseActive)}`}
          >
            Browse Characters
          </Link>
          <Link
            to="/how-it-works"
            onClick={closeMobileMenu}
            className={`rounded-xl px-4 py-3 transition-all duration-200 hover:scale-[1.01] hover:bg-black/[0.04] dark:bg-white/[0.04] active:scale-[0.99] ${navLinkClass(howItWorksActive)}`}
          >
            How It Works
          </Link>
          <Link
            to="/avatar"
            onClick={closeMobileMenu}
            className={`flex items-center gap-2 rounded-xl px-4 py-3 transition-all duration-200 hover:scale-[1.01] hover:bg-black/[0.04] dark:bg-white/[0.04] active:scale-[0.99] ${navLinkClass(avatarActive)}`}
          >
            <Shirt size={16} /> Avatar
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
