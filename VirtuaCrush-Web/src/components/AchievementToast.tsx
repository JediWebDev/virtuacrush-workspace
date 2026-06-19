// Achievement-style toast for story / meet-cute completion badges.
import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Trophy, X } from "lucide-react";

export interface AchievementToastData {
  title: string;
  description: string;
}

interface AchievementToastProps {
  open: boolean;
  badge: AchievementToastData | null;
  onClose: () => void;
  durationMs?: number;
  offsetRem?: number;
}

export default function AchievementToast({
  open,
  badge,
  onClose,
  durationMs = 6500,
  offsetRem = 10,
}: AchievementToastProps) {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(onClose, durationMs);
    return () => clearTimeout(t);
  }, [open, durationMs, onClose]);

  return (
    <AnimatePresence>
      {open && badge ? (
        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 28, scale: 0.94 }}
          transition={{ type: "spring", stiffness: 340, damping: 26 }}
          className="fixed left-1/2 z-[125] w-[min(92vw,26rem)] -translate-x-1/2"
          style={{ bottom: `${offsetRem}rem` }}
          role="status"
          aria-live="polite"
        >
          <div className="relative overflow-hidden rounded-2xl border border-amber-400/35 bg-gradient-to-br from-amber-50 via-white to-amber-100/80 p-4 pr-10 shadow-2xl dark:border-amber-300/25 dark:from-amber-950/90 dark:via-stone-900 dark:to-amber-900/40">
            <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-400/20 blur-2xl" />
            <button
              type="button"
              onClick={onClose}
              aria-label="Dismiss"
              className="absolute right-2.5 top-2.5 rounded-lg p-1 text-stone-400 transition-colors hover:bg-black/[0.06] hover:text-stone-700 dark:hover:text-stone-200"
            >
              <X size={16} />
            </button>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">
              Moment unlocked
            </p>
            <div className="mt-2 flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-400/25 text-amber-700 shadow-inner dark:bg-amber-400/15 dark:text-amber-200">
                <Trophy size={22} className="fill-amber-500/30" />
              </div>
              <div className="min-w-0">
                <p className="font-serif text-lg font-semibold leading-tight text-stone-900 dark:text-stone-50">
                  {badge.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                  {badge.description}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
