// The explicit "desire event" card that pops when a drive crosses its event
// threshold. The character proposes; the player chooses how to respond. Consent
// stays in the loop — encourage / redirect / decline.
import { useState } from "react";
import { motion } from "motion/react";
import { Heart } from "lucide-react";

type Choice = "encourage" | "redirect" | "decline";

interface DesireEventCardProps {
  characterName: string;
  characterImage?: string;
  event: { drive: string; prompt: string; options: { id: string; label: string }[] };
  onRespond: (choice: Choice) => Promise<void> | void;
}

export default function DesireEventCard({ characterName, characterImage, event, onRespond }: DesireEventCardProps) {
  const [busy, setBusy] = useState(false);

  const pick = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await onRespond(id as Choice);
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 340, damping: 26 }}
      className="mx-auto w-full max-w-md overflow-hidden rounded-3xl border border-accent/30 bg-accent/[0.06] p-5 shadow-xl shadow-accent/10"
    >
      <div className="mb-3 flex items-center gap-3">
        {characterImage ? (
          <img src={characterImage} alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-accent/30" />
        ) : null}
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent">
          <Heart size={13} /> A moment with {characterName}
        </span>
      </div>

      <p className="mb-4 text-[15px] leading-relaxed text-stone-800 dark:text-stone-100">{event.prompt}</p>

      <div className="flex flex-wrap gap-2">
        {event.options.map((o, i) => (
          <button
            key={o.id}
            type="button"
            disabled={busy}
            onClick={() => pick(o.id)}
            className={
              i === 0
                ? "flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-accent/25 transition-all hover:bg-accent-deep active:scale-[0.98] disabled:opacity-60"
                : "flex-1 rounded-xl border border-black/10 bg-black/[0.04] px-4 py-2.5 text-sm font-semibold text-stone-700 transition-colors hover:bg-black/[0.08] disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.05] dark:text-stone-200 dark:hover:bg-white/[0.1]"
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
