// DM-style skill check card. Shows what the player is attempting and the target
// number, then a Roll button that animates a d20 tumbling before settling on a
// face. On settle it reports the result up so the narrator can play it out.
import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Dices } from "lucide-react";
import {
  rollD20,
  resolveClientRoll,
  DIFFICULTY_LABEL,
  type SkillCheck,
  type RollResult,
} from "../lib/dice";

interface DiceRollProps {
  check: SkillCheck;
  /** Fired once the die settles. Parent sends the roll to the server. */
  onResolved: (result: RollResult) => void;
  disabled?: boolean;
}

type Phase = "idle" | "rolling" | "settled";

const ROLL_MS = 1100;

export default function DiceRoll({ check, onResolved, disabled }: DiceRollProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [face, setFace] = useState<number>(20);
  const [result, setResult] = useState<RollResult | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRoll = useCallback(() => {
    if (phase !== "idle" || disabled) return;
    setPhase("rolling");

    // Flicker random faces while "tumbling" for tactile feedback.
    tickRef.current = setInterval(() => setFace(rollD20()), 70);

    window.setTimeout(() => {
      if (tickRef.current) clearInterval(tickRef.current);
      const value = rollD20();
      const res = resolveClientRoll(value, check.dc);
      setFace(value);
      setResult(res);
      setPhase("settled");
      onResolved(res);
    }, ROLL_MS);
  }, [phase, disabled, check.dc, onResolved]);

  const outcomeColor = result
    ? result.success
      ? "text-emerald-500"
      : "text-rose-500"
    : "text-stone-400";

  const verdict = result
    ? result.crit
      ? "Critical success!"
      : result.fumble
        ? "Critical fail!"
        : result.success
          ? "Success"
          : "Failure"
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto mt-3 flex w-full max-w-[520px] flex-col items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-50/70 px-4 py-4 text-center shadow-sm dark:border-amber-300/20 dark:bg-amber-500/[0.06]"
    >
      <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-400">
        Skill Check
      </p>
      <p className="text-sm font-medium text-stone-800 dark:text-stone-100">
        {check.action}
      </p>
      <p className="text-xs text-stone-500 dark:text-stone-400">
        Difficulty: {DIFFICULTY_LABEL[check.difficulty]} · beat{" "}
        <span className="font-semibold">{check.dc}</span> on a d20
      </p>

      {/* The die */}
      <motion.button
        type="button"
        onClick={startRoll}
        disabled={phase !== "idle" || disabled}
        aria-label={phase === "idle" ? "Roll the dice" : `Rolled ${face}`}
        animate={
          phase === "rolling"
            ? { rotate: [0, 120, 240, 360], scale: [1, 1.12, 1] }
            : { rotate: 0, scale: 1 }
        }
        transition={
          phase === "rolling"
            ? { duration: 0.5, repeat: Infinity, ease: "linear" }
            : { type: "spring", stiffness: 300, damping: 18 }
        }
        className={`relative flex h-20 w-20 items-center justify-center rounded-2xl border-2 bg-white text-3xl font-bold shadow-md transition-colors dark:bg-stone-900 ${
          phase === "settled"
            ? result?.success
              ? "border-emerald-400 text-emerald-500"
              : "border-rose-400 text-rose-500"
            : "border-amber-400 text-amber-600 hover:bg-amber-50 dark:hover:bg-stone-800"
        } disabled:cursor-default`}
      >
        {phase === "idle" ? <Dices className="h-8 w-8" /> : face}
      </motion.button>

      <AnimatePresence mode="wait">
        {phase === "idle" && (
          <motion.span
            key="hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-xs font-medium text-amber-700 dark:text-amber-300"
          >
            Tap the die to roll
          </motion.span>
        )}
        {phase === "rolling" && (
          <motion.span
            key="rolling"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-xs font-medium text-stone-500 dark:text-stone-400"
          >
            Rolling…
          </motion.span>
        )}
        {phase === "settled" && verdict && (
          <motion.span
            key="verdict"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`text-sm font-semibold ${outcomeColor}`}
          >
            Rolled {face} — {verdict}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
