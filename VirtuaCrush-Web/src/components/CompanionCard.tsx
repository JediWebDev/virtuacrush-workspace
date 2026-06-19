import React from "react";
import { motion } from "motion/react";
import { Lock, MessageSquare } from "lucide-react";
import { isCustomCharacterId } from "../lib/customCharacter";
import { Character } from "../types/character";
import { isFreeCharacter, type UserTier } from "../types/subscription";

interface Props {
  character: Character;
  onSelect: (c: Character) => void;
  userTier: UserTier;
  key?: React.Key;
}

export default function CompanionCard({ character, onSelect, userTier }: Props) {
  const isLocked =
    !isCustomCharacterId(character.id) &&
    (userTier === "guest" || userTier === "free") &&
    !isFreeCharacter(character.name);

  return (
    <motion.div
      layoutId={character.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -6 }}
      className="group relative mx-auto w-full max-w-[360px]"
    >
      <div className="card-gradient overflow-hidden rounded-[1.75rem] shadow-xl shadow-black/20 backdrop-blur-xl transition-all duration-300 hover-glow">
        <div className="relative aspect-[4/5] w-full overflow-hidden">
          <img
            src={character.image}
            alt={character.name}
            className={`h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03] ${
              isLocked ? "opacity-75 grayscale-[0.35]" : ""
            }`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/30 to-transparent" />

          {isLocked ? (
            <div className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-stone-300 ring-1 ring-white/20 backdrop-blur-md">
              <Lock size={16} />
            </div>
          ) : null}

          <div className="absolute inset-x-0 bottom-0 p-5">
            <div className="card-gradient-subtle rounded-2xl p-4 shadow-lg backdrop-blur-xl">
              <h3 className="font-serif text-xl font-bold tracking-tight text-stone-900 dark:text-stone-50">
                {character.name}
              </h3>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent/95">
                {character.role}
              </p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {character.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-black/[0.08] dark:border-white/[0.08] bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-stone-700 dark:text-stone-200"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => onSelect(character)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-semibold text-white shadow-md shadow-accent/20 transition-all hover:bg-accent-deep active:scale-[0.98]"
                >
                  <MessageSquare size={17} />
                  Message
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="pointer-events-none absolute inset-0 -z-10 rounded-[1.85rem] opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: "linear-gradient(135deg, rgba(247,37,133,0.28), rgba(67,97,238,0.22))",
        }}
      />
    </motion.div>
  );
}
