// "The story so far" — a diary of key beats from your chats with this
// character, written by the backend's diary job. Replaced the old world feed,
// which was noise from characters the user never talked to.
import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { fetchDiary, type DiaryEntry } from "../lib/api";

interface ActivityLogProps {
  characterId: string;
  name: string;
}

export default function ActivityLog({ characterId, name }: ActivityLogProps) {
  const [entries, setEntries] = useState<DiaryEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchDiary(characterId)
        .then((e) => { if (alive) { setEntries(e); setFailed(false); } })
        .catch(() => { if (alive) setFailed(true); });
    load();
    const t = setInterval(load, 60_000); // beats appear after sessions go idle
    return () => { alive = false; clearInterval(t); };
  }, [characterId]);

  return (
    <div className="mb-6 w-full rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.03] dark:bg-white/[0.03] p-4 text-left">
      <h4 className="mb-2.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
        <BookOpen size={12} /> Your story so far
      </h4>

      <div className="no-scrollbar max-h-72 overflow-y-auto">
        {!entries || entries.length === 0 ? (
          <p className="text-[12px] italic leading-relaxed text-stone-500">
            {failed
              ? "The diary is unavailable right now."
              : `Your story with ${name} hasn't been written yet — it fills in after your chats.`}
          </p>
        ) : (
          <ol className="relative ml-1.5 space-y-2.5 border-l border-black/[0.08] pl-3.5 dark:border-white/[0.1]">
            {entries.map((e) => (
              <li key={e.id} className="relative text-[12px] leading-snug text-stone-600 dark:text-stone-300">
                <span
                  className="absolute -left-[19px] top-1.5 h-1.5 w-1.5 rounded-full bg-accent/70"
                  aria-hidden
                />
                {e.beat}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
