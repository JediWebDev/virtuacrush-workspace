// Lightweight, dependency-free notice toast (success / info). Mirrors the
// styling of UpgradeToast but is generic: pass a title, optional detail, and an
// icon. Auto-dismisses after durationMs. Stacks above the composer.
import { useEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";

interface NoticeToastProps {
  open: boolean;
  title: string;
  detail?: string;
  icon?: ReactNode;
  onClose: () => void;
  /** Auto-dismiss delay in ms (default 5s). */
  durationMs?: number;
  /** Stack offset from the bottom in rem (so two toasts don't overlap). */
  offsetRem?: number;
}

export default function NoticeToast({
  open,
  title,
  detail,
  icon,
  onClose,
  durationMs = 5000,
  offsetRem = 1.5,
}: NoticeToastProps) {
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
          className="fixed left-1/2 z-[120] w-[min(92vw,24rem)] -translate-x-1/2"
          style={{ bottom: `${offsetRem}rem` }}
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
              {icon ? (
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
                  {icon}
                </div>
              ) : null}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">{title}</p>
                {detail ? (
                  <p className="mt-0.5 text-sm text-stone-600 dark:text-stone-400">{detail}</p>
                ) : null}
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
