import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Home,
  Users,
  Globe,
  Wand2,
  Shirt,
  Backpack,
  Trophy,
  BookMarked,
  Activity,
  Sun,
  Moon,
  User,
  X,
  Menu,
  Lock,
  Sparkles,
  MapPin,
} from "lucide-react";
import { Character, CHARACTERS } from "../types/character";
import type { ProgressPayload, PlayerAction } from "../types/playerActions";
import { fetchProgress } from "../lib/api";
import QuestJournal from "./QuestJournal";

/** A tool that opens a flyout panel anchored to the rail. */
type ToolId = "companions" | "inventory" | "achievements" | "journal" | "statuses";

interface SidebarProps {
  activeCharacterId: string | null;
  activeCharacter: Character | null;
  onSelectCharacter: (char: Character) => void;
  authed: boolean;
}

const RAIL_WIDTH = 72;

export default function Sidebar({
  activeCharacterId,
  activeCharacter,
  onSelectCharacter,
  authed,
}: SidebarProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [openTool, setOpenTool] = useState<ToolId | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Progress payload for the active companion, lazily loaded when a
  // progress-backed tool flyout is opened.
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) root.classList.add("dark");
    else root.classList.remove("dark");
  }, [isDarkMode]);

  // Close flyouts when navigating to a new page.
  useEffect(() => {
    setOpenTool(null);
    setMobileOpen(false);
  }, [pathname]);

  // Reset cached progress when the active companion changes.
  useEffect(() => {
    if (loadedFor.current && loadedFor.current !== activeCharacterId) {
      setProgress(null);
      loadedFor.current = null;
    }
  }, [activeCharacterId]);

  const needsProgress =
    openTool === "inventory" ||
    openTool === "achievements" ||
    openTool === "journal" ||
    openTool === "statuses";

  useEffect(() => {
    if (!needsProgress || !activeCharacterId) return;
    if (loadedFor.current === activeCharacterId && progress) return;
    let cancelled = false;
    setProgressLoading(true);
    fetchProgress(activeCharacterId)
      .then((p) => {
        if (cancelled) return;
        setProgress(p);
        loadedFor.current = activeCharacterId;
      })
      .catch(() => {
        if (!cancelled) setProgress(null);
      })
      .finally(() => {
        if (!cancelled) setProgressLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [needsProgress, activeCharacterId, progress]);

  const toggleTool = (id: ToolId) => setOpenTool((cur) => (cur === id ? null : id));

  const go = (path: string) => {
    setOpenTool(null);
    setMobileOpen(false);
    navigate(path);
  };

  const homeActive = pathname === "/" || pathname.startsWith("/chat");
  const communityActive = pathname === "/community";
  const studioActive = pathname === "/studio";
  const avatarActive = pathname === "/avatar";
  const accountActive = pathname === "/account";

  const rail = (
    <div
      className="flex h-full flex-col items-center gap-1 border-r border-black/10 bg-stone-100/95 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-[#0d0f17]/95"
      style={{ width: RAIL_WIDTH }}
    >
      <button
        type="button"
        onClick={() => go("/")}
        className="mb-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent shadow-lg shadow-accent/30 transition-transform hover:scale-105 active:scale-95"
        aria-label="VirtuaCrush home"
        title="Home"
      >
        <Sparkles size={22} className="text-white" />
      </button>

      <RailDivider />

      <RailButton icon={Home} label="Home" active={homeActive && !openTool} onClick={() => go("/")} />
      <RailButton
        icon={Users}
        label="Companions"
        active={openTool === "companions"}
        onClick={() => toggleTool("companions")}
        avatarSrc={activeCharacter?.image}
      />
      <RailButton icon={Globe} label="Community" active={communityActive && !openTool} onClick={() => go("/community")} />
      {authed ? (
        <RailButton icon={Wand2} label="Studio" active={studioActive && !openTool} onClick={() => go("/studio")} />
      ) : null}
      <RailButton icon={Shirt} label="Avatar" active={avatarActive && !openTool} onClick={() => go("/avatar")} />

      <RailDivider />

      <RailButton icon={Backpack} label="Inventory" active={openTool === "inventory"} onClick={() => toggleTool("inventory")} />
      <RailButton icon={Trophy} label="Achievements" active={openTool === "achievements"} onClick={() => toggleTool("achievements")} />
      <RailButton icon={BookMarked} label="Quest Journal" active={openTool === "journal"} onClick={() => toggleTool("journal")} />
      <RailButton icon={Activity} label="Statuses" active={openTool === "statuses"} onClick={() => toggleTool("statuses")} />

      <div className="mt-auto flex flex-col items-center gap-1">
        <RailDivider />
        <RailButton
          icon={isDarkMode ? Sun : Moon}
          label={isDarkMode ? "Light mode" : "Dark mode"}
          active={false}
          onClick={() => setIsDarkMode((d) => !d)}
        />
        <RailButton icon={User} label="Account" active={accountActive && !openTool} onClick={() => go("/account")} />
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-[70] flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 bg-stone-100/90 text-stone-700 shadow-lg backdrop-blur md:hidden dark:border-white/10 dark:bg-surface/90 dark:text-stone-200"
        aria-label="Open navigation"
      >
        <Menu size={20} />
      </button>

      {/* Desktop persistent rail + flyout */}
      <div className="relative z-50 hidden md:flex">
        {rail}
        <ToolFlyout
          openTool={openTool}
          onClose={() => setOpenTool(null)}
          activeCharacter={activeCharacter}
          onSelectCharacter={(c) => {
            onSelectCharacter(c);
            setOpenTool(null);
          }}
          progress={progress}
          progressLoading={progressLoading}
          onTravel={() => go(activeCharacterId ? `/chat/${activeCharacterId}` : "/characters")}
        />
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[75] bg-black/50 backdrop-blur-sm md:hidden"
              onClick={() => setMobileOpen(false)}
              aria-hidden
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed inset-y-0 left-0 z-[80] flex md:hidden"
            >
              {rail}
              <ToolFlyout
                openTool={openTool}
                onClose={() => setOpenTool(null)}
                activeCharacter={activeCharacter}
                onSelectCharacter={(c) => {
                  onSelectCharacter(c);
                  setMobileOpen(false);
                }}
                progress={progress}
                progressLoading={progressLoading}
                onTravel={() => go(activeCharacterId ? `/chat/${activeCharacterId}` : "/characters")}
                mobile
              />
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function RailDivider() {
  return <div className="my-1 h-px w-8 rounded-full bg-black/10 dark:bg-white/10" />;
}

function RailButton({
  icon: Icon,
  label,
  active,
  onClick,
  avatarSrc,
}: {
  icon: typeof Home;
  label: string;
  active: boolean;
  onClick: () => void;
  avatarSrc?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="group relative flex h-11 w-11 items-center justify-center"
    >
      {/* Active pill indicator (Discord-style) */}
      <span
        className={`absolute -left-3 w-1 rounded-r-full bg-accent transition-all ${
          active ? "h-7 opacity-100" : "h-2 opacity-0 group-hover:opacity-60"
        }`}
      />
      <span
        className={`flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl transition-all duration-150 group-hover:rounded-xl ${
          active
            ? "bg-accent text-white shadow-md shadow-accent/30"
            : "bg-black/[0.05] text-stone-600 group-hover:bg-accent/15 group-hover:text-accent dark:bg-white/[0.06] dark:text-stone-300"
        }`}
      >
        {avatarSrc ? (
          <img src={avatarSrc} alt="" className="h-full w-full object-cover object-top" />
        ) : (
          <Icon size={20} />
        )}
      </span>
      {/* Hover tooltip */}
      <span className="pointer-events-none absolute left-full ml-3 z-50 hidden whitespace-nowrap rounded-lg bg-stone-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-xl group-hover:block dark:bg-black">
        {label}
      </span>
    </button>
  );
}

function ToolFlyout({
  openTool,
  onClose,
  activeCharacter,
  onSelectCharacter,
  progress,
  progressLoading,
  onTravel,
  mobile,
}: {
  openTool: ToolId | null;
  onClose: () => void;
  activeCharacter: Character | null;
  onSelectCharacter: (c: Character) => void;
  progress: ProgressPayload | null;
  progressLoading: boolean;
  onTravel: () => void;
  mobile?: boolean;
}) {
  if (!openTool) return null;

  const titles: Record<ToolId, string> = {
    companions: "Companions",
    inventory: "Inventory",
    achievements: "Achievements",
    journal: "Quest Journal",
    statuses: "Statuses",
  };

  return (
    <motion.div
      initial={mobile ? false : { opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex h-full w-[300px] flex-col border-r border-black/10 bg-stone-50/98 backdrop-blur-xl dark:border-white/10 dark:bg-[#11131d]/98"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-black/[0.06] px-4 py-3.5 dark:border-white/[0.06]">
        <h2 className="font-serif text-lg font-bold text-stone-900 dark:text-stone-50">{titles[openTool]}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-black/[0.06] hover:text-stone-800 dark:hover:bg-white/[0.06] dark:hover:text-stone-100"
          aria-label="Close panel"
        >
          <X size={18} />
        </button>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
        {openTool === "companions" ? (
          <CompanionsPanel activeId={activeCharacter?.id ?? null} onSelect={onSelectCharacter} />
        ) : !activeCharacter ? (
          <EmptyTool message="Open a companion to view this." />
        ) : progressLoading && !progress ? (
          <p className="py-6 text-center text-sm text-stone-500">Loading…</p>
        ) : openTool === "journal" ? (
          <QuestJournal progress={progress?.progress ?? null} />
        ) : openTool === "achievements" ? (
          <AchievementsPanel progress={progress} />
        ) : openTool === "inventory" ? (
          <InventoryPanel actions={progress?.actions ?? []} />
        ) : openTool === "statuses" ? (
          <StatusesPanel progress={progress} character={activeCharacter} onTravel={onTravel} />
        ) : null}
      </div>
    </motion.div>
  );
}

function EmptyTool({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-black/10 px-4 py-10 text-center dark:border-white/10">
      <Lock size={22} className="text-stone-400" />
      <p className="text-sm text-stone-500">{message}</p>
    </div>
  );
}

function CompanionsPanel({
  activeId,
  onSelect,
}: {
  activeId: string | null;
  onSelect: (c: Character) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {CHARACTERS.map((c) => {
        const active = c.id === activeId;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c)}
            className={`flex items-center gap-3 rounded-xl border p-2 text-left transition-all ${
              active
                ? "border-accent/40 bg-accent/[0.08]"
                : "border-black/10 bg-white/60 hover:border-accent/30 hover:bg-accent/[0.05] dark:border-white/10 dark:bg-white/[0.03]"
            }`}
          >
            <img
              src={c.image}
              alt=""
              className="h-11 w-11 shrink-0 rounded-lg object-cover object-top"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-stone-900 dark:text-stone-50">{c.name}</span>
              <span className="block truncate text-xs text-stone-500">{c.role}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function AchievementsPanel({ progress }: { progress: ProgressPayload | null }) {
  const badges = progress?.progress.badges ?? [];
  if (!badges.length) {
    return <EmptyTool message="Complete story arcs to earn achievements." />;
  }
  return (
    <ul className="flex flex-col gap-2.5">
      {badges.map((b) => (
        <li
          key={b.arcId}
          className="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.08] p-3"
        >
          <Trophy size={18} className="mt-0.5 shrink-0 text-amber-500" />
          <div className="min-w-0">
            <p className="font-semibold text-stone-900 dark:text-stone-50">{b.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-stone-600 dark:text-stone-400">{b.description}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function InventoryPanel({ actions }: { actions: PlayerAction[] }) {
  const items = actions.filter((a) => a.category === "inventory");
  if (!items.length) {
    return <EmptyTool message="No items yet. Items you pick up in scenes appear here." />;
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((a) => (
        <li
          key={a.id}
          className="flex items-center gap-3 rounded-xl border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.03]"
        >
          <Backpack size={16} className="shrink-0 text-stone-400" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">{a.label}</p>
            {a.hint ? <p className="truncate text-xs text-stone-500">{a.hint}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function StatusesPanel({
  progress,
  character,
  onTravel,
}: {
  progress: ProgressPayload | null;
  character: Character;
  onTravel: () => void;
}) {
  const p = progress?.progress;
  const here = progress?.mapLocations.find((m) => m.current);
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-3 rounded-xl border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <img src={character.image} alt="" className="h-12 w-12 rounded-lg object-cover object-top" />
        <div>
          <p className="font-semibold text-stone-900 dark:text-stone-50">{character.name}</p>
          <p className="text-xs text-stone-500">{character.role}</p>
        </div>
      </div>

      <StatRow label="Affinity" value={`${p?.affinity ?? 0}/100`} />
      {p && !p.canRevealSecret ? <StatRow label="Secret trust" value={`${p.secretTrustPercent}%`} /> : null}
      <StatRow label="Met" value={p?.meetArcComplete ? "Yes" : "Not yet"} />
      <StatRow label="Places unlocked" value={String(p?.unlockedVenueSlugs.length ?? 0)} />

      <button
        type="button"
        onClick={onTravel}
        className="mt-1 flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white/60 px-3 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:border-accent/30 hover:bg-accent/[0.06] dark:border-white/10 dark:bg-white/[0.03] dark:text-stone-200"
      >
        <MapPin size={15} />
        {here ? `Currently: ${here.shortName}` : "Open scene"}
      </button>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-black/10 bg-white/60 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
      <span className="text-xs font-semibold uppercase tracking-wider text-stone-400">{label}</span>
      <span className="text-sm font-semibold text-stone-900 dark:text-stone-50">{value}</span>
    </div>
  );
}
