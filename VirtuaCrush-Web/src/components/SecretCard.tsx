// Shows a character's secret on their profile rail: a locked teaser until the
// player uncovers it (high trust + probing, server-decided), then the reveal.
import { motion } from "motion/react";
import { Lock, Sparkles } from "lucide-react";

interface SecretCardProps {
  secret?: { label: string; discovered: boolean; reveal: string | null };
  name: string;
}

export default function SecretCard({ secret, name }: SecretCardProps) {
  if (!secret) return null;

  if (!secret.discovered) {
    return (
      <div className="mb-5 w-full rounded-2xl border border-black/10 bg-black/[0.03] p-4 text-left dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-500/10 text-stone-500">
            <Lock size={15} />
          </span>
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">Secret · locked</span>
        </div>
        <p className="mt-2 text-sm font-medium text-stone-700 dark:text-stone-300">{secret.label}</p>
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
          {name} is hiding something. Earn their trust and ask the right questions to uncover it.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-5 w-full overflow-hidden rounded-2xl border border-accent/30 bg-accent/[0.06] p-4 text-left"
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
