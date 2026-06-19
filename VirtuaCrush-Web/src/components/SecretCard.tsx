// Shows a character's secret on their profile rail: a locked teaser with a
// trust-progress bar until the player uncovers it (high trust + probing,
// server-decided), then the reveal.
import { motion } from "motion/react";
import { Lock, Sparkles } from "lucide-react";

interface SecretCardProps {
  secret?: { label: string; discovered: boolean; reveal: string | null; progress?: number };
  name: string;
}

export default function SecretCard({ secret, name }: SecretCardProps) {
  if (!secret) return null;

  if (!secret.discovered) {
    const progress = Math.max(0, Math.min(99, Math.round(secret.progress ?? 0)));
    return (
      <div className="card-gradient-subtle mb-5 w-full rounded-2xl p-4 text-left">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-500/10 text-stone-500">
            <Lock size={15} />
          </span>
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">Secret · locked</span>
        </div>
        <p className="mt-2 text-sm font-medium text-stone-700 dark:text-stone-300">{secret.label}</p>
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wide text-stone-500">Trust earned</span>
            <span className="text-[10px] tabular-nums text-stone-400">{progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-indigo to-accent transition-[width] duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
          {progress >= 99
            ? `${name} trusts you — ask the right question and the truth might come out.`
            : `${name} is hiding something. Earn their trust and ask the right questions to uncover it.`}
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-gradient mb-5 w-full overflow-hidden rounded-2xl p-4 text-left"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent">
          <Sparkles size={15} />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-accent">Secret · uncovered</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-stone-900 dark:text-stone-50">{secret.label}</p>
      <p className="mt-1 text-sm leading-relaxed text-stone-700 dark:text-stone-300">{secret.reveal}</p>
    </motion.div>
  );
}
