import { useState, useEffect } from "react";
import { BookOpen, Clock, Zap, Lock } from "lucide-react";
import { listPacks, startPack, ApiError, type PackMeta, type PackSession } from "../lib/api";
import { BRAND } from "../lib/brand";

const PACK_COVER_GRADIENT = `linear-gradient(135deg, ${BRAND.indigoBloom}, ${BRAND.electricSapphire})`;

const MOOD_LABELS: Record<string, string> = {
  romantic: "Romance",
  dramatic: "Drama",
  comedic: "Comedy",
  thriller: "Thriller",
  mystery: "Mystery",
  playful: "Playful",
  cozy: "Cozy",
  gothic: "Gothic",
  tense: "Tense",
};

interface PackListProps {
  characterId: string;
  /** Story packs stay locked until the roster meet-cute arc is done. */
  meetArcComplete?: boolean;
  activeSession: PackSession | null;
  onSessionStart: (session: PackSession & { introNarrative?: string | null }) => void;
  /** Switch to the already-active story's tab. */
  onResume?: () => void;
  /** Abandon the active story so a new one can begin. */
  onAbandon?: () => void;
}

export default function PackList({ characterId, meetArcComplete = true, activeSession, onSessionStart, onResume, onAbandon }: PackListProps) {
  const [packs, setPacks] = useState<PackMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [abandoning, setAbandoning] = useState(false);

  useEffect(() => {
    setLoading(true);
    listPacks(characterId)
      .then(setPacks)
      .catch(() => setPacks([]))
      .finally(() => setLoading(false));
  }, [characterId]);

  const handleStart = async (pack: PackMeta) => {
    if (starting) return;
    setStarting(pack.id);
    try {
      const session = await startPack(pack.id);
      onSessionStart(session);
    } catch (e) {
      // Guardrail: another story is already in progress. Resume it instead of
      // silently failing.
      if (e instanceof ApiError && e.status === 409 && e.body?.error === 'story_in_progress') {
        const active = e.body.active as (PackSession & { introNarrative?: string | null }) | undefined;
        if (active) onSessionStart(active);
      } else if (e instanceof ApiError && e.status === 403 && e.body?.error === 'meet_arc_required') {
        /* gated until first meeting completes */
      }
    } finally {
      setStarting(null);
    }
  };

  const handleAbandon = async () => {
    if (abandoning) return;
    setAbandoning(true);
    try {
      await onAbandon?.();
    } finally {
      setAbandoning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (packs.length === 0) return null;

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center gap-2">
        <BookOpen size={13} className="text-stone-400" />
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Story Packs</p>
      </div>
      <div className="flex flex-col gap-3">
        {packs.map((pack) => {
          const isActive = activeSession?.packId === pack.id;
          const hasOtherActive = !!activeSession && !isActive;
          const meetLocked = meetArcComplete === false;
          const isStarting = starting === pack.id;

          return (
            <div
              key={pack.id}
              className={`group relative overflow-hidden rounded-2xl transition-all duration-200 ${
                isActive
                  ? "card-gradient ring-1 ring-accent/30"
                  : "card-gradient-subtle hover-glow"
              }`}
            >
              {/* Gradient cover strip */}
              <div
                className="h-16 w-full"
                style={{ background: PACK_COVER_GRADIENT }}
              >
                {/* Overlay text on cover */}
                <div className="flex h-full flex-col justify-end p-3">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                      {MOOD_LABELS[pack.mood] ?? pack.mood}
                    </span>
                    <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm">
                      <Clock size={9} />
                      ~{pack.estimatedMinutes}m
                    </span>
                  </div>
                </div>
              </div>

              {/* Card body */}
              <div className="bg-white/60 dark:bg-white/[0.03] p-3">
                <p className="mb-0.5 text-sm font-semibold text-stone-900 dark:text-stone-50">
                  {pack.title}
                </p>
                <p className="mb-2.5 text-xs leading-relaxed text-stone-500 dark:text-stone-400 line-clamp-2">
                  {pack.blurb}
                </p>

                {/* Tags */}
                <div className="mb-3 flex flex-wrap gap-1">
                  {pack.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-stone-600 dark:text-stone-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Action */}
                {isActive ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-accent">
                      <Zap size={11} className="fill-accent" />
                      In progress
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => onResume?.()}
                        className="flex-1 rounded-xl bg-gradient-to-br from-brand-indigo to-brand-sapphire py-2 text-xs font-semibold text-white transition-opacity"
                      >
                        Resume story
                      </button>
                      <button
                        type="button"
                        onClick={handleAbandon}
                        disabled={abandoning}
                        className="rounded-xl border border-black/10 dark:border-white/10 px-3 py-2 text-xs font-semibold text-stone-600 dark:text-stone-300 transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.04] disabled:opacity-50"
                      >
                        {abandoning ? "…" : "Abandon"}
                      </button>
                    </div>
                  </div>
                ) : hasOtherActive ? (
                  <div className="flex items-center justify-center gap-1.5 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] py-2 text-xs font-medium text-stone-500 dark:text-stone-400">
                    <Lock size={11} />
                    Finish your active story first
                  </div>
                ) : meetLocked ? (
                  <div className="flex items-center justify-center gap-1.5 rounded-xl border border-amber-400/25 bg-amber-50/80 py-2 text-xs font-medium text-amber-800 dark:border-amber-400/20 dark:bg-amber-950/30 dark:text-amber-200">
                    <Lock size={11} />
                    Finish your first meeting first
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleStart(pack)}
                    disabled={!!isStarting}
                    className="w-full rounded-xl bg-gradient-to-br from-brand-indigo to-brand-sapphire py-2 text-xs font-semibold text-white transition-opacity disabled:opacity-50"
                  >
                    {isStarting ? "Starting…" : "Play"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
