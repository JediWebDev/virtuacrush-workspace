// Live world-sim ripples — chaos residues, mischief, and other engine events.
import { useEffect, useState } from "react";
import { Globe2 } from "lucide-react";
import { fetchWorldEvents, type WorldEventEntry } from "../lib/api";

const KIND_LABEL: Record<string, string> = {
  chaos: "Ripple",
  mischief: "Mischief",
  crime: "Incident",
};

function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? "Event";
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = Date.now();
  const diffMs = now - d.getTime();
  if (diffMs < 60_000) return "Just now";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function WorldActivityFeed({ refreshKey = 0 }: { refreshKey?: number }) {
  const [events, setEvents] = useState<WorldEventEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchWorldEvents()
        .then((e) => {
          if (alive) {
            setEvents(e);
            setFailed(false);
          }
        })
        .catch(() => {
          if (alive) setFailed(true);
        });
    load();
    const t = setInterval(load, 45_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [refreshKey]);

  return (
    <div className="mb-6 w-full rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.03] dark:bg-white/[0.03] p-4 text-left">
      <h4 className="mb-2.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
        <Globe2 size={12} /> World activity
      </h4>

      <div className="no-scrollbar max-h-48 overflow-y-auto">
        {!events || events.length === 0 ? (
          <p className="text-[12px] italic leading-relaxed text-stone-500">
            {failed
              ? "World activity is unavailable right now."
              : "Nothing has rippled through the world yet — chaos events from your chats will show up here."}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {events.map((e) => (
              <li
                key={e.id}
                className="rounded-xl border border-black/[0.05] bg-black/[0.02] px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.02]"
              >
                <div className="mb-0.5 flex items-center justify-between gap-2">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-accent/80">
                    {kindLabel(e.kind)}
                  </span>
                  <span className="shrink-0 text-[10px] text-stone-400">{formatWhen(e.createdAt)}</span>
                </div>
                <p className="text-[12px] leading-snug text-stone-600 dark:text-stone-300">{e.text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
