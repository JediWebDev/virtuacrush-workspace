// Community browse (Phase 4) — discover public custom characters, adventures,
// and arcs made by other users, and copy them into your own Story Studio
// library. Copying clones the item (attributed to the original creator); you
// then chat/play your own copy.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Users, Loader2, Download, MessageCircle, Check, Sparkles, GitBranch, BookOpen } from "lucide-react";
import {
  listCommunityCharacters,
  listCommunityAdventures,
  listCommunityArcs,
  copyCommunityCharacter,
  copyCommunityAdventure,
  copyCommunityArc,
  type CommunityCharacter,
  type CommunityAdventure,
  type CommunityArc,
} from "../lib/api";

type Tab = "characters" | "adventures" | "arcs";

const cardClass =
  "rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] p-4 flex flex-col";

function Attribution({ name, copies }: { name: string | null; copies: number }) {
  return (
    <p className="mt-2 text-[11px] text-stone-400">
      by {name || "a creator"}{copies > 0 ? ` · ${copies} ${copies === 1 ? "save" : "saves"}` : ""}
    </p>
  );
}

export default function CommunityPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("characters");

  const [chars, setChars] = useState<CommunityCharacter[]>([]);
  const [advs, setAdvs] = useState<CommunityAdventure[]>([]);
  const [arcs, setArcs] = useState<CommunityArc[]>([]);
  const [loading, setLoading] = useState(true);

  // Tracks which item ids are being copied / have been copied.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [doneIds, setDoneIds] = useState<Record<string, string>>({}); // id -> chat ref/characterId (if any)

  useEffect(() => {
    setLoading(true);
    Promise.all([
      listCommunityCharacters().then(setChars).catch(() => setChars([])),
      listCommunityAdventures().then(setAdvs).catch(() => setAdvs([])),
      listCommunityArcs().then(setArcs).catch(() => setArcs([])),
    ]).finally(() => setLoading(false));
  }, []);

  const markDone = (key: string, ref: string) => setDoneIds((d) => ({ ...d, [key]: ref }));

  const copyChar = async (c: CommunityCharacter) => {
    setBusyId(`c${c.id}`);
    try { const r = await copyCommunityCharacter(c.id); markDone(`c${c.id}`, `/chat/${r.ref}`); }
    catch { /* noop */ } finally { setBusyId(null); }
  };
  const copyAdv = async (a: CommunityAdventure) => {
    setBusyId(`a${a.id}`);
    try { const r = await copyCommunityAdventure(a.id); markDone(`a${a.id}`, `/chat/${r.characterId}`); }
    catch { /* noop */ } finally { setBusyId(null); }
  };
  const copyArc = async (a: CommunityArc) => {
    setBusyId(`r${a.id}`);
    try { await copyCommunityArc(a.id); markDone(`r${a.id}`, "/studio"); }
    catch { /* noop */ } finally { setBusyId(null); }
  };

  const tabs: [Tab, string, typeof Sparkles][] = [
    ["characters", "Characters", Sparkles],
    ["adventures", "Adventures", GitBranch],
    ["arcs", "Arcs", BookOpen],
  ];

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-10 md:px-12">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <Users size={22} />
        </div>
        <div>
          <h1 className="font-serif text-3xl font-bold text-stone-900 dark:text-stone-50">Community</h1>
          <p className="text-sm text-stone-500">Discover companions and adventures made by others. Add them to your library to chat or play.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 inline-flex rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04] p-1">
        {tabs.map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-sm font-semibold transition-colors ${
              tab === key ? "bg-accent text-white shadow-sm shadow-accent/25" : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-100"
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="flex items-center gap-2 py-10 text-sm text-stone-500"><Loader2 size={16} className="animate-spin" /> Loading the community…</p>
      ) : (
        <>
          {/* Characters */}
          {tab === "characters" && (
            chars.length === 0 ? (
              <EmptyState label="No public companions yet. Be the first — publish one from your Studio." />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {chars.map((c) => {
                  const done = doneIds[`c${c.id}`];
                  return (
                    <motion.div key={c.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cardClass}>
                      <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">{c.displayName}</p>
                      {c.tone && <p className="text-[11px] uppercase tracking-wide text-accent">{c.tone}</p>}
                      <p className="mt-1 line-clamp-4 flex-1 text-xs italic text-stone-500">{c.blurb}</p>
                      <Attribution name={c.creatorName} copies={c.copyCount} />
                      {done ? (
                        <button type="button" onClick={() => navigate(done)} className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500/90 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500">
                          <MessageCircle size={13} /> Added — open chat
                        </button>
                      ) : (
                        <button type="button" onClick={() => copyChar(c)} disabled={busyId === `c${c.id}`} className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-accent py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-deep disabled:opacity-50">
                          {busyId === `c${c.id}` ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Add to my library
                        </button>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )
          )}

          {/* Adventures */}
          {tab === "adventures" && (
            advs.length === 0 ? (
              <EmptyState label="No public adventures yet. Publish a CYOA adventure from your Studio to share it." />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {advs.map((a) => {
                  const done = doneIds[`a${a.id}`];
                  return (
                    <motion.div key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cardClass}>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-accent">{a.companion} · {a.beats} beats{a.mood ? ` · ${a.mood}` : ""}</p>
                      <p className="mt-0.5 text-sm font-semibold text-stone-900 dark:text-stone-50">{a.title}</p>
                      {a.blurb && <p className="mt-1 line-clamp-3 flex-1 text-xs italic text-stone-500">{a.blurb}</p>}
                      <Attribution name={a.creatorName} copies={a.copyCount} />
                      {done ? (
                        <button type="button" onClick={() => navigate(done)} className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500/90 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500">
                          <MessageCircle size={13} /> Added — open chat
                        </button>
                      ) : (
                        <button type="button" onClick={() => copyAdv(a)} disabled={busyId === `a${a.id}`} className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-accent py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-deep disabled:opacity-50">
                          {busyId === `a${a.id}` ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Add to my library
                        </button>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )
          )}

          {/* Arcs */}
          {tab === "arcs" && (
            arcs.length === 0 ? (
              <EmptyState label="No public arcs yet. Publish an arc from your Studio to share it." />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {arcs.map((a) => {
                  const done = doneIds[`r${a.id}`];
                  return (
                    <motion.div key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cardClass}>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-accent">{a.companion}</p>
                      <p className="mt-0.5 text-sm font-semibold text-stone-900 dark:text-stone-50">{a.title}</p>
                      {a.setting && <p className="mt-1 text-xs text-stone-500">{a.setting}</p>}
                      {a.blurb && <p className="mt-1 line-clamp-3 flex-1 text-xs italic text-stone-500">{a.blurb}</p>}
                      <Attribution name={a.creatorName} copies={a.copyCount} />
                      {done ? (
                        <button type="button" onClick={() => navigate(done)} className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500/90 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500">
                          <Check size={13} /> Added — open Studio
                        </button>
                      ) : (
                        <button type="button" onClick={() => copyArc(a)} disabled={busyId === `r${a.id}`} className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-accent py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-deep disabled:opacity-50">
                          {busyId === `r${a.id}` ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Add to my library
                        </button>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )
          )}
        </>
      )}
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <p className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] p-6 text-sm text-stone-500">
      {label}
    </p>
  );
}
