import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import * as world from "../lib/world";

const ICON: Record<string, string> = {
  move: "📍", mood: "💭", rumor: "🗣️", interaction: "💬", post: "📱", event: "⚡",
};

export default function ActivityLog() {
  const [feed, setFeed] = useState<world.WorldFeed | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => world.fetchWorld().then((f) => alive && setFeed(f)).catch(() => alive && setFailed(true));
    load();
    const t = setInterval(load, 30000); // pick up changes from per-message ticks
    return () => { alive = false; clearInterval(t); };
  }, []);

  const summary = feed?.summary ?? [];
  const events = feed?.events ?? [];

  return (
    <div className="mb-6 w-full rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.03] dark:bg-white/[0.03] p-4 text-left">
      <h4 className="mb-2.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
        <Activity size={12} /> The world
      </h4>

      {summary.length > 0 && (
        <div className="mb-3 rounded-xl border border-accent/20 bg-accent/[0.06] p-2.5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-accent">While you were away</p>
          <ul className="space-y-1">
            {summary.slice(0, 6).map((e, i) => (
              <li key={i} className="text-[12px] leading-snug text-stone-700 dark:text-stone-300">
                <span className="mr-1" aria-hidden>{ICON[e.kind] ?? "•"}</span>{e.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="no-scrollbar max-h-72 space-y-1.5 overflow-y-auto">
        {events.length === 0 ? (
          <p className="text-[12px] italic leading-relaxed text-stone-500">
            {failed ? "The world feed is unavailable right now." : "The world is quiet for now…"}
          </p>
        ) : (
          events.map((e) => (
            <div key={e.id} className="flex gap-2 text-[12px] leading-snug text-stone-600 dark:text-stone-300">
              <span className="shrink-0" aria-hidden>{ICON[e.kind] ?? "•"}</span>
              <span className="min-w-0">{e.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
