import type { PlayerProgressDetail } from '../types/playerActions';
import { BookMarked, Award } from 'lucide-react';

interface Props {
  progress: PlayerProgressDetail | null;
}

export default function QuestJournal({ progress }: Props) {
  if (!progress) {
    return (
      <p className="py-4 text-center text-sm text-stone-500">Loading journal…</p>
    );
  }

  const { quest, badges, affinity, secretTrustPercent } = progress;

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="rounded-xl border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.04]">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">Closeness</p>
        <p className="mt-1 text-lg font-semibold text-stone-900 dark:text-stone-50">{affinity}/100</p>
        {!progress.canRevealSecret && (
          <p className="mt-1 text-xs text-stone-500">Secret trust: {secretTrustPercent}%</p>
        )}
      </div>

      {quest ? (
        <div className="rounded-xl border border-accent/20 bg-accent/[0.06] p-3">
          <div className="mb-2 flex items-center gap-2 text-accent">
            <BookMarked size={16} />
            <p className="text-[10px] font-semibold uppercase tracking-widest">Active story</p>
          </div>
          <p className="font-semibold text-stone-900 dark:text-stone-50">{quest.title}</p>
          <p className="mt-2 text-xs leading-relaxed text-stone-600 dark:text-stone-400">{quest.completionCriteria}</p>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-black/10 px-3 py-4 text-center text-xs text-stone-500 dark:border-white/10">
          No active story arc — free roam with {progress.meetArcComplete ? 'this companion' : 'your meet-cute'}.
        </p>
      )}

      <div>
        <div className="mb-2 flex items-center gap-2 text-stone-500">
          <Award size={16} />
          <p className="text-[10px] font-semibold uppercase tracking-widest">Badges</p>
        </div>
        {badges.length === 0 ? (
          <p className="text-xs text-stone-500">Complete story arcs to earn badges.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {badges.map((b) => (
              <li
                key={b.arcId}
                className="rounded-lg border border-black/10 bg-white/50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]"
              >
                <p className="font-medium text-stone-800 dark:text-stone-100">{b.title}</p>
                <p className="text-xs text-stone-500">{b.description}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
