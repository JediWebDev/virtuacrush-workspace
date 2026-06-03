import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Hourglass } from "lucide-react";
import {
  selectChoice,
  timeoutChoice,
  type DialogueChoice,
  type ChoiceResolution,
} from "../lib/api";

interface Props {
  choice: DialogueChoice;
  characterName: string;
  /** Called once the choice is resolved (by selection or timeout). */
  onResolved: (result: ChoiceResolution, chosenLabel?: string) => void;
}

export default function ChoiceCard({ choice, characterName, onResolved }: Props) {
  const ttlMs = choice.ttlSeconds * 1000;
  const expiresAt = new Date(choice.expiresAt).getTime();
  const [remaining, setRemaining] = useState(() => Math.max(0, expiresAt - Date.now()));
  const [busy, setBusy] = useState(false);
  const resolvedRef = useRef(false);

  // Drain the hourglass; resolve as a timeout when it empties.
  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, expiresAt - Date.now());
      setRemaining(left);
      if (left <= 0 && !resolvedRef.current) {
        resolvedRef.current = true;
        clearInterval(id);
        timeoutChoice(choice.id)
          .then((r) => onResolved(r))
          .catch(() => onResolved({ ok: true, timedOut: true, reaction: "*turns away*" }));
      }
    };
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice.id]);

  const handlePick = async (index: number, label: string) => {
    if (busy || resolvedRef.current) return;
    setBusy(true);
    resolvedRef.current = true;
    try {
      const result = await selectChoice(choice.id, index);
      onResolved(result, label);
    } catch {
      onResolved({ ok: false }, label);
    }
  };

  const seconds = Math.ceil(remaining / 1000);
  const pct = Math.max(0, Math.min(100, (remaining / ttlMs) * 100));
  const urgent = seconds <= 10;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12 }}
      className="mx-auto mb-3 w-full max-w-3xl overflow-hidden rounded-2xl border border-accent/30 bg-accent/[0.06] shadow-lg shadow-accent/10 backdrop-blur-sm"
    >
      <div className="flex items-center gap-2 px-4 pt-3">
        <motion.span
          animate={{ rotate: [0, 0, 180, 180] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className={urgent ? "text-rose-500" : "text-accent"}
        >
          <Hourglass size={16} />
        </motion.span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
          {choice.kind === "bill"
            ? "The bill arrives"
            : choice.kind === "date"
              ? `${characterName} wants to go out`
              : `${characterName} needs an answer`}
        </span>
        <span
          className={`ml-auto text-xs font-bold tabular-nums ${urgent ? "text-rose-500" : "text-stone-500 dark:text-stone-400"}`}
        >
          {seconds}s
        </span>
      </div>

      {/* draining bar */}
      <div className="mx-4 mt-2 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div
          className={`h-full rounded-full transition-[width] duration-200 ease-linear ${urgent ? "bg-rose-500" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="px-4 py-3 text-[15px] leading-relaxed text-stone-800 dark:text-stone-100">
        {choice.prompt}
      </p>

      {choice.bill ? (
        <div className="mx-4 mb-3 rounded-xl border border-black/10 bg-white/70 p-3 text-sm dark:border-white/10 dark:bg-white/[0.04]">
          <ul className="space-y-1">
            {choice.bill.items.map((it, i) => (
              <li key={i} className="flex justify-between gap-3 text-stone-700 dark:text-stone-200">
                <span className="min-w-0 truncate">{it.label}</span>
                <span className="tabular-nums">${it.amount.toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between border-t border-black/10 pt-2 font-semibold text-stone-900 dark:border-white/10 dark:text-stone-50">
            <span>Total</span>
            <span className="tabular-nums">${choice.bill.total.toFixed(2)}</span>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 px-4 pb-4 sm:flex-row">
        {choice.options.map((opt, i) => (
          <button
            key={i}
            type="button"
            disabled={busy}
            onClick={() => handlePick(i, opt.label)}
            className="flex-1 rounded-xl border border-accent/30 bg-white/60 px-4 py-3 text-left text-sm font-medium text-stone-800 transition-all hover:border-accent/60 hover:bg-accent/10 active:scale-[0.99] disabled:opacity-50 dark:bg-white/[0.06] dark:text-stone-100"
          >
            {opt.label}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
