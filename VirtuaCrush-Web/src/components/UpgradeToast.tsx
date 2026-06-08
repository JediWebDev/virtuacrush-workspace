// Lightweight toast shown when the free daily message cap is hit. Prompts an
// upgrade. Auto-dismisses after a few seconds; no external toast library.
import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, X } from "lucide-react";

interface UpgradeToastProps {
  open: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  /** Optional: the daily limit, shown in the copy if provided. */
  limit?: number | null;
  /** Auto-dismiss delay in ms (default 9s). */
  durationMs?: number;
}

export default function UpgradeToast({
  open,
  onClose,
  onUpgrade,
  limit,
  durationMs = 9000,
}: UpgradeToastProps) {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(onClose, durationMs);
    return () => clearTimeout(t);
  }, [open, durationMs, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 360, damping: 28 }}
          className="fixed bottom-6 left-1/2 z-[120] w-[min(92vw,26rem)] -translate-x-1/2"
          role="status"
          aria-live="polite"
        >
          <div className="relative overflow-hidden rounded-2xl border border-black/10 dark:border-white/10 glass p-4 pr-10 shadow-2xl">
            <button
              type="button"
              onClick={onClose}
              aria-label="Dismiss"
              className="absolute right-2.5 top-2.5 rounded-lg p-1 text-stone-400 transition-colors hover:bg-black/[0.06] hover:text-stone-200"
            >
              <X size={16} />
            </button>

            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <Sparkles size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">
                  You've reached today's free message limit
                </p>
                <p className="mt-0.5 text-sm text-stone-600 dark:text-stone-400">
                  {limit ? `That's ${limit} messages for today. ` : ""}Upgrade for unlimited chat, or
                  come back tomorrow when it resets.
                </p>
                <button
                  type="button"
                  onClick={onUpgrade}
                  className="mt-3 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-md shadow-accent/25 transition-all hover:bg-accent-deep active:scale-[0.98]"
                >
                  Upgrade for unlimited chat
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
