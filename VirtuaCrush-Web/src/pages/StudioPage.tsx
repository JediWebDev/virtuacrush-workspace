import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Wand2, Play, Trash2, Loader2, BookPlus } from "lucide-react";
import { CHARACTERS } from "../types/character";
import {
  createStudioStory,
  listStudioStories,
  deleteStudioStory,
  playStudioStory,
  type StudioStory,
  type StudioArcInput,
} from "../lib/api";

type Tone = NonNullable<StudioArcInput["tone"]>;
const TONES: Tone[] = ["light", "serious", "romantic", "dramatic"];

const emptyForm = (characterId: string) => ({
  characterId,
  title: "",
  setting: "",
  situation: "",
  playerSituation: "",
  npcInstruction: "",
  introNarrative: "",
  completionCriteria: "",
  coPresent: true,
  tone: "dramatic" as Tone,
});

const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500";
const inputClass =
  "w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04] px-3 py-2.5 text-sm text-stone-800 dark:text-stone-100 outline-none transition-colors placeholder:text-stone-400 focus:border-accent/40 focus:ring-2 focus:ring-accent/10";

export default function StudioPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm(CHARACTERS[0]?.id ?? ""));
  const [stories, setStories] = useState<StudioStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const charName = (id: string) => CHARACTERS.find((c) => c.id === id)?.name ?? id;

  const refresh = () => {
    setLoading(true);
    listStudioStories()
      .then(setStories)
      .catch(() => setStories([]))
      .finally(() => setLoading(false));
  };
  useEffect(refresh, []);

  const set = <K extends keyof ReturnType<typeof emptyForm>>(k: K, v: ReturnType<typeof emptyForm>[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleCreate = async () => {
    setError(null);
    if (!form.setting.trim() || !form.situation.trim() || !form.npcInstruction.trim() || !form.completionCriteria.trim()) {
      setError("Please fill in setting, situation, character behavior, and how it ends.");
      return;
    }
    setSaving(true);
    try {
      await createStudioStory({
        characterId: form.characterId,
        title: form.title.trim() || "Untitled story",
        setting: form.setting.trim(),
        situation: form.situation.trim(),
        playerSituation: form.playerSituation.trim() || undefined,
        npcInstruction: form.npcInstruction.trim(),
        introNarrative: form.introNarrative.trim() || undefined,
        completionCriteria: form.completionCriteria.trim(),
        coPresent: form.coPresent,
        tone: form.tone,
      });
      setForm(emptyForm(form.characterId));
      refresh();
    } catch {
      setError("Couldn't save the story. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handlePlay = async (s: StudioStory) => {
    setBusyId(s.id);
    try {
      const { characterId, introNarrative } = await playStudioStory(s.id);
      navigate(`/chat/${characterId}`, { state: { studioIntro: introNarrative } });
    } catch {
      setError("Couldn't start that story.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (s: StudioStory) => {
    setBusyId(s.id);
    try {
      await deleteStudioStory(s.id);
      setStories((prev) => prev.filter((x) => x.id !== s.id));
    } catch {
      /* non-fatal */
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-10 md:px-12">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <Wand2 size={22} />
        </div>
        <div>
          <h1 className="font-serif text-3xl font-bold text-stone-900 dark:text-stone-50">Story Studio</h1>
          <p className="text-sm text-stone-500">Write your own adventure with an existing companion. Private to you.</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* Builder form */}
        <div className="rounded-3xl border border-black/10 dark:border-white/10 glass p-6">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-stone-800 dark:text-stone-100">
            <BookPlus size={16} className="text-accent" /> New story arc
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelClass}>Companion</label>
              <select className={inputClass} value={form.characterId} onChange={(e) => set("characterId", e.target.value)}>
                {CHARACTERS.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Title</label>
              <input className={inputClass} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="The Great Taco Hunt" />
            </div>
          </div>

          <div className="mt-4">
            <label className={labelClass}>Setting — where it happens</label>
            <input className={inputClass} value={form.setting} onChange={(e) => set("setting", e.target.value)} placeholder="a sunny boardwalk lined with food trucks" />
          </div>

          <div className="mt-4">
            <label className={labelClass}>Situation — what's going on (the scene's ground truth)</label>
            <textarea className={inputClass} rows={3} value={form.situation} onChange={(e) => set("situation", e.target.value)} placeholder="You're on a mission to track down the legendary taco truck everyone's raving about — but it keeps moving, and a smug rival foodie keeps beating you to the best spots." />
          </div>

          <div className="mt-4">
            <label className={labelClass}>Your role &amp; constraints (keeps the director honest)</label>
            <textarea className={inputClass} rows={2} value={form.playerSituation} onChange={(e) => set("playerSituation", e.target.value)} placeholder="You're free and along for the ride — hungry, competitive, and armed with very strong opinions about hot sauce." />
          </div>

          <div className="mt-4">
            <label className={labelClass}>How should {charName(form.characterId)} behave?</label>
            <textarea className={inputClass} rows={3} value={form.npcInstruction} onChange={(e) => set("npcInstruction", e.target.value)} placeholder={`${charName(form.characterId)} treats this like a serious culinary expedition — hyping every lead and dramatically rating each taco out of ten.`} />
          </div>

          <div className="mt-4">
            <label className={labelClass}>Opening narration (optional)</label>
            <textarea className={inputClass} rows={2} value={form.introNarrative} onChange={(e) => set("introNarrative", e.target.value)} placeholder="The boardwalk smells like grilled onions and possibility. Somewhere out there, the perfect taco is waiting." />
          </div>

          <div className="mt-4">
            <label className={labelClass}>How does it resolve? (completion)</label>
            <textarea className={inputClass} rows={2} value={form.completionCriteria} onChange={(e) => set("completionCriteria", e.target.value)} placeholder="You hunt down the legendary truck together and crown the best taco — or get gloriously full trying." />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelClass}>Tone</label>
              <select className={inputClass} value={form.tone} onChange={(e) => set("tone", e.target.value as Tone)}>
                {TONES.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </div>
            <label className="flex items-end gap-2 pb-2.5 text-sm text-stone-600 dark:text-stone-300">
              <input type="checkbox" checked={form.coPresent} onChange={(e) => set("coPresent", e.target.checked)} className="h-4 w-4 rounded accent-[var(--accent,#c9717d)]" />
              {charName(form.characterId)} is physically with you in the scene
            </label>
          </div>

          {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            className="mt-5 flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-accent/25 transition-all hover:bg-accent-deep active:scale-95 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <BookPlus size={16} />}
            {saving ? "Saving…" : "Save story"}
          </button>
        </div>

        {/* My stories */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-stone-800 dark:text-stone-100">My stories</h2>
          {loading ? (
            <p className="flex items-center gap-2 py-6 text-sm text-stone-500"><Loader2 size={16} className="animate-spin" /> Loading…</p>
          ) : stories.length === 0 ? (
            <p className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] p-4 text-sm text-stone-500">
              No stories yet. Write one on the left and hit Save.
            </p>
          ) : (
            <ul className="space-y-3">
              {stories.map((s) => (
                <motion.li
                  key={s.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] p-4"
                >
                  <p className="text-[11px] font-medium uppercase tracking-wide text-accent">{charName(s.characterId)} · {s.format}</p>
                  <p className="mt-0.5 text-sm font-semibold text-stone-900 dark:text-stone-50">{s.title}</p>
                  {typeof s.spec.setting === "string" && (
                    <p className="mt-1 line-clamp-2 text-xs italic text-stone-500">{s.spec.setting as string}</p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handlePlay(s)}
                      disabled={busyId === s.id}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-deep disabled:opacity-50"
                    >
                      {busyId === s.id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Play
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(s)}
                      disabled={busyId === s.id}
                      className="rounded-xl border border-black/10 dark:border-white/10 px-3 py-2 text-xs font-medium text-stone-500 transition-colors hover:bg-black/[0.05] hover:text-red-500 disabled:opacity-50"
                      aria-label="Delete story"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </motion.li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
