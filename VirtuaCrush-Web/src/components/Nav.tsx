import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Wallet, Sparkles, User, Mail, Menu, X, Sun, Moon } from "lucide-react";

interface NavProps {
  isWalletConnected: boolean;
  walletAddress: string;
  vCrushTokens: number;
  vLinkTokens: number;
  onConnectWallet: () => void;
  onLogoClick: () => void;
}

const navLinkClass = (active: boolean) =>
  `text-sm font-medium transition-all duration-200 hover:scale-105 active:scale-95 ${
    active ? "text-accent" : "text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
  }`;

const iconButtonClass =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/10 bg-black/[0.04] text-stone-600 transition-all duration-200 hover:scale-105 hover:border-accent/30 hover:bg-black/[0.08] hover:text-stone-900 active:scale-95 dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-300 dark:hover:bg-white/[0.08] dark:hover:text-stone-50";

export default function Nav({
  isWalletConnected,
  walletAddress,
  vCrushTokens,
  vLinkTokens,
  onConnectWallet,
  onLogoClick,
}: NavProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const browseActive = pathname === "/characters";
  const howItWorksActive = pathname === "/how-it-works";

  const toggleNotifications = () => {
    setIsNotificationsOpen((open) => {
      const next = !open;
      if (next) setHasUnread(false);
      return next;
    });
  };

  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (!isNotificationsOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isNotificationsOpen]);

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

  const openCallieChat = () => {
    setHasUnread(false);
    setIsNotificationsOpen(false);
    navigate("/", { state: { openChat: "callie", openMessage: "audio-1" } });
  };

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <header ref={mobileMenuRef} className="relative z-10 px-6 py-8 md:px-12">
      <div className="flex items-center justify-between">
        <Link
          to="/"
          onClick={() => {
            onLogoClick();
            setIsMobileMenuOpen(false);
          }}
          className="flex items-center gap-3 transition-all duration-200 hover:scale-[1.02] hover:opacity-90 active:scale-[0.98]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent shadow-lg shadow-accent/25">
            <Sparkles className="text-white" size={20} />
          </div>
          <span className="font-serif text-2xl font-bold tracking-tight text-stone-900 dark:text-white">
            VirtuaCrush
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
          </nav>

          <button
            type="button"
            onClick={isWalletConnected ? undefined : onConnectWallet}
            className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 hover:scale-105 active:scale-95 md:px-5 ${
              isWalletConnected
                ? "border border-accent/25 bg-accent/10 text-rose-100"
                : "bg-stone-100 text-surface hover:bg-accent hover:text-white"
            }`}
            aria-label={isWalletConnected ? "Wallet connected" : "Connect wallet"}
          >
            <Wallet size={18} className="shrink-0" />
            {isWalletConnected ? (
              <>
                <span className="hidden max-w-[88px] truncate text-xs md:inline lg:max-w-none">
                  {walletAddress
                    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
                    : "Connected"}
                </span>
                <span className="hidden md:inline">
                  <span className="opacity-40">|</span>{" "}
                  {vLinkTokens} $VLINK <span className="opacity-40">|</span> {vCrushTokens} $VCRUSH
                </span>
              </>
            ) : (
              <span className="hidden sm:inline">Connect Wallet</span>
            )}
          </button>

          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <div ref={notificationsRef} className="relative">
              <button
                type="button"
                onClick={toggleNotifications}
                className={`relative ${iconButtonClass}`}
                aria-label="Messages and notifications"
                aria-expanded={isNotificationsOpen}
              >
                <Mail size={20} />
                {hasUnread ? (
                  <span
                    className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-stone-50 dark:ring-surface"
                    aria-hidden
                  >
                    1
                  </span>
                ) : null}
              </button>

              {isNotificationsOpen ? (
                <div
                  className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-black/10 dark:border-white/10 bg-stone-50 dark:bg-surface shadow-2xl"
                  role="menu"
                >
                  <div className="border-b border-black/[0.06] dark:border-white/[0.06] px-4 py-3">
                    <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-100">Notifications</h3>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={openCallieChat}
                    className="flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-black/[0.04] dark:bg-white/[0.04]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-stone-800 dark:text-stone-100">Callie Spencer</span>
                      <span className="shrink-0 text-[11px] text-stone-900 dark:text-stone-500">Just now</span>
                    </div>
                    <span className="text-sm text-stone-600 dark:text-stone-400">Are you awake? 🥺</span>
                  </button>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setIsDarkMode((dark) => !dark)}
              className={iconButtonClass}
              aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            <Link to="/account" className={iconButtonClass} aria-label="Account and profile">
              <User size={20} />
            </Link>

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
        </nav>
      ) : null}
    </header>
  );
}
