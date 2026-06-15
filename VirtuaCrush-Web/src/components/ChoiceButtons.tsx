import { motion } from "framer-motion";
import type { PackChoice } from "../lib/api";

interface ChoiceButtonsProps {
  choices: PackChoice[];
  onChoice: (choice: PackChoice) => void;
  disabled?: boolean;
}

export default function ChoiceButtons({ choices, onChoice, disabled }: ChoiceButtonsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto mt-3 flex w-full max-w-[520px] flex-col gap-2 px-4"
    >
      <p className="mb-0.5 text-center text-[10px] font-semibold uppercase tracking-widest text-stone-400">
        What do you do?
      </p>
      {choices.map((choice) => (
        <button
          key={choice.id}
          type="button"
          onClick={() => !disabled && onChoice(choice)}
          disabled={disabled}
          className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/[0.05] px-4 py-3 text-left text-sm font-medium text-stone-800 dark:text-stone-100 shadow-sm transition-all hover:border-accent/40 hover:bg-accent/[0.06] hover:shadow-md disabled:opacity-40"
        >
          {choice.label}
        </button>
      ))}
    </motion.div>
  );
}
