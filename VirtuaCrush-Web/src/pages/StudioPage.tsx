import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Wand2, Play, Trash2, Loader2, BookPlus, UserPlus, MessageCircle, ImagePlus, Sparkles, Upload } from "lucide-react";
import { CHARACTERS } from "../types/character";
import AdventureBuilder from "../components/AdventureBuilder";
import PublishControl from "../components/PublishControl";
import {
  createStudioStory,
  listStudioStories,
  deleteStudioStory,
  playStudioStory,
  createStudioCharacter,
  listStudioCharacters,
  deleteStudioCharacter,
  customCharacterRef,
  publishStudioStory,
  unpublishStudioStory,
  publishStudioCharacter,
  unpublishStudioCharacter,
  uploadStudioCharacterImage,
  generateStudioCharacterImage,
  deleteStudioCharacterImage,
  assetUrl,
  ApiError,
  type StudioStory,
  type StudioArcInput,
  type StudioCharacter,
} from "../lib/api";

/** Reads a File into a base64 data URL. */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

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

const emptyCharForm = () => ({ displayName: "", core: "", greeting: "", secret: "", tone: "" });

export default function StudioPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"stories" | "characters" | "adventures">("stories");
  const [form, setForm] = useState(emptyForm(CHARACTERS[0]?.id ?? ""));
  const [stories, setStories] = useState<StudioStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Custom characters (Phase 2)
  const [charForm, setCharForm] = useState(emptyCharForm());
  const [characters, setCharacters] = useState<StudioCharacter[]>([]);
  const [charLoading, setCharLoading] = useState(true);
  const [charSaving, setCharSaving] = useState(false);
  const [charError, setCharError] = useState<string | null>(null);
  const [charBusyId, setCharBusyId] = useState<string | null>(null);

  const charName = (id: string) => CHARACTERS.find((c) => c.id === id)?.name ?? id;

  const refresh = () => {
    setLoading(true);
    listStudioStories()
      .then(setStories)
      .catch(() => setStories([]))
      .finally(() => setLoading(false));
  };
  useEffect(refresh, []);

  const refreshChars = () => {
    setCharLoading(true);
    listStudioCharacters()
      .then(setCharacters)
      .catch(() => setCharacters([]))
      .finally(() => setCharLoading(false));
  };
  useEffect(refreshChars, []);

  const setChar = <K extends keyof ReturnType<typeof emptyCharForm>>(k: K, v: string) =>
    setCharForm((f) => ({ ...f, [k]: v }));

  const handleCreateChar = async () => {
    setCharError(null);
    if (!charForm.displayName.trim()) {
      setCharError("Give your character a name.");
      return;
    }
    if (charForm.core.trim().length < 20) {
      setCharError("Describe their personality a little more (at least a sentence or two).");
      return;
    }
    setCharSaving(true);
    try {
      await createStudioCharacter({
        displayName: charForm.displayName.trim(),
        core: charForm.core.trim(),
        greeting: charForm.greeting.trim() || undefined,
        secret: charForm.secret.trim() || undefined,
        tone: charForm.tone.trim() || undefined,
      });
      setCharForm(emptyCharForm());
      refreshChars();
    } catch {
      setCharError("Couldn't save the character. Please try again.");
    } finally {
      setCharSaving(false);
    }
  };

  const handleDeleteChar = async (c: StudioCharacter) => {
    setCharBusyId(c.id);
    try {
      await deleteStudioCharacter(c.id);
      setCharacters((prev) => prev.filter((x) => x.id !== c.id));
    } catch {
      /* non-fatal */
    } finally {
      setCharBusyId(null);
    }
  };

  const handleChatChar = (c: StudioCharacter) => navigate(`/chat/${customCharacterRef(c.id)}`);

  // Publish / unpublish (Phase 4)
  const [pubBusyId, setPubBusyId] = useState<string | null>(null);
  const handlePublishStory = async (s: StudioStory) => {
    setPubBusyId(s.id);
    try { await publishStudioStory(s.id); } catch { /* surfaced via refreshed status */ } finally { refresh(); setPubBusyId(null); }
  };
  const handleUnpublishStory = async (s: StudioStory) => {
    setPubBusyId(s.id);
    try { await unpublishStudioStory(s.id); } catch { /* noop */ } finally { refresh(); setPubBusyId(null); }
  };
  const handlePublishChar = async (c: StudioCharacter) => {
    setPubBusyId(c.id);
    try { await publishStudioCharacter(c.id); } catch { /* surfaced via refreshed status */ } finally { refreshChars(); setPubBusyId(null); }
  };
  const handleUnpublishChar = async (c: StudioCharacter) => {
    setPubBusyId(c.id);
    try { await unpublishStudioCharacter(c.id); } catch { /* noop */ } finally { refreshChars(); setPubBusyId(null); }
  };

  // Avatar images (upload / generate / remove)
  const [imgBusyId, setImgBusyId] = useState<string | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);
  const [imgPrompt, setImgPrompt] = useState<Record<string, string>>({});
  const handleUploadImage = async (c: StudioCharacter, file: File) => {
    setImgError(null); setImgBusyId(c.id);
    try {
      const dataUrl = await fileToDataUrl(file);
      await uploadStudioCharacterImage(c.id, dataUrl);
      refreshChars();
    } catch {
      setImgError("Couldn't upload that image. Use a PNG/JPG/WEBP under 6MB.");
    } finally { setImgBusyId(null); }
  };
  const handleGenerateImage = async (c: StudioCharacter) => {
    setImgError(null); setImgBusyId(c.id);
    try {
      await generateStudioCharacterImage(c.id, { appearance: (imgPrompt[c.id] || "").trim() || undefined });
      refreshChars();
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setImgError("AI avatar generation is a Pro feature.");
      else if (e instanceof ApiError && e.body?.error === "storage_not_configured") setImgError("Image storage (R2) isn't configured on the server.");
      else if (e instanceof ApiError && e.body?.detail) setImgError(String(e.body.detail).slice(0, 220));
      else setImgError("Couldn't generate an image. Please try again.");
    } finally { setImgBusyId(null); }
  };
  const handleRemoveImage = async (c: StudioCharacter) => {
    setImgBusyId(c.id);
    try { await deleteStudioCharacterImage(c.id); refreshChars(); } catch { /* noop */ } finally { setImgBusyId(null); }
  };

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
          <p className="text-sm text-stone-500">Create your own companions and adventures. Private to you.</p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="mb-6 inline-flex rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04] p-1">
        {([
          ["stories", "Stories"],
          ["characters", "Characters"],
          ["adventures", "Adventures"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-xl px-4 py-1.5 text-sm font-semibold transition-colors ${
              tab === key
                ? "bg-accent text-white shadow-sm shadow-accent/25"
                : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "stories" && (
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
                  <PublishControl
                    visibility={s.visibility}
                    moderationStatus={s.moderationStatus}
                    moderationReason={s.moderationReason}
                    busy={pubBusyId === s.id}
                    onPublish={() => handlePublishStory(s)}
                    onUnpublish={() => handleUnpublishStory(s)}
                  />
                </motion.li>
              ))}
            </ul>
          )}
        </div>
      </div>
      )}

      {tab === "characters" && (
      <>
      <div className="mb-6 rounded-2xl border border-accent/20 bg-accent/[0.06] p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent">How character avatars work</p>
        <ol className="space-y-1 text-sm text-stone-600 dark:text-stone-300">
          <li><span className="font-semibold text-stone-800 dark:text-stone-100">1.</span> Create and save your companion below.</li>
          <li><span className="font-semibold text-stone-800 dark:text-stone-100">2.</span> On its card under “My companions,” upload an image or AI-generate an avatar — <span className="text-stone-500">AI generation is a Pro feature.</span></li>
        </ol>
      </div>
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* Character builder */}
        <div className="rounded-3xl border border-black/10 dark:border-white/10 glass p-6">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-stone-800 dark:text-stone-100">
            <UserPlus size={16} className="text-accent" /> New companion
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelClass}>Name</label>
              <input className={inputClass} value={charForm.displayName} onChange={(e) => setChar("displayName", e.target.value)} placeholder="Captain Pancake" />
            </div>
            <div>
              <label className={labelClass}>Tone (optional)</label>
              <input className={inputClass} value={charForm.tone} onChange={(e) => setChar("tone", e.target.value)} placeholder="warm, playful, a little dramatic" />
            </div>
          </div>

          <div className="mt-4">
            <label className={labelClass}>Personality — who are they?</label>
            <textarea className={inputClass} rows={4} value={charForm.core} onChange={(e) => setChar("core", e.target.value)} placeholder="A retired pirate turned brunch-cafe owner who flirts in nautical puns, takes their syrup very seriously, and secretly writes terrible sea-shanty poetry." />
          </div>

          <div className="mt-4">
            <label className={labelClass}>Greeting (optional) — their first message to you</label>
            <textarea className={inputClass} rows={2} value={charForm.greeting} onChange={(e) => setChar("greeting", e.target.value)} placeholder="Ahoy! Pull up a stool — the pancakes are hot and the coffee's stronger than a kraken's grip." />
          </div>

          <div className="mt-4">
            <label className={labelClass}>Secret (optional) — revealed as you grow closer</label>
            <textarea className={inputClass} rows={2} value={charForm.secret} onChange={(e) => setChar("secret", e.target.value)} placeholder="They never actually sailed the high seas — the whole pirate thing started as a costume-party bit that got gloriously out of hand." />
          </div>

          {charError && <p className="mt-4 text-sm text-red-500">{charError}</p>}

          <button
            type="button"
            onClick={handleCreateChar}
            disabled={charSaving}
            className="mt-5 flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-accent/25 transition-all hover:bg-accent-deep active:scale-95 disabled:opacity-50"
          >
            {charSaving ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
            {charSaving ? "Saving…" : "Save companion"}
          </button>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-stone-500">
            <ImagePlus size={13} className="text-accent" /> After saving, upload or AI-generate an avatar from the companion's card on the right.
          </p>
        </div>

        {/* My characters */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-stone-800 dark:text-stone-100">My companions</h2>
          {charLoading ? (
            <p className="flex items-center gap-2 py-6 text-sm text-stone-500"><Loader2 size={16} className="animate-spin" /> Loading…</p>
          ) : characters.length === 0 ? (
            <p className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] p-4 text-sm text-stone-500">
              No companions yet. Dream one up on the left and hit Save — then add an avatar (upload or AI-generate) right here on its card.
            </p>
          ) : (
            <ul className="space-y-3">
              {characters.map((c) => (
                <motion.li
                  key={c.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] p-4"
                >
                  <div className="flex items-start gap-3">
                    {c.imageKey ? (
                      <img src={assetUrl(c.imageKey)} alt={c.displayName} className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-violet-warm text-xl font-bold text-white">
                        {(c.displayName.trim()[0] || "?").toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">{c.displayName}</p>
                      <p className="mt-1 line-clamp-2 text-xs italic text-stone-500">{c.core}</p>
                    </div>
                  </div>

                  {/* Avatar controls */}
                  <textarea
                    className="mt-2 w-full rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04] px-2.5 py-1.5 text-xs text-stone-800 dark:text-stone-100 outline-none placeholder:text-stone-400 focus:border-accent/40"
                    rows={2}
                    value={imgPrompt[c.id] ?? ""}
                    onChange={(e) => setImgPrompt((p) => ({ ...p, [c.id]: e.target.value }))}
                    placeholder="Describe the avatar for AI generation — e.g. weathered sea captain, silver beard, navy coat, warm grin, soft harbor light, painterly"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-black/10 dark:border-white/10 px-2 py-1 text-[11px] font-medium text-stone-600 transition-colors hover:bg-black/[0.05] dark:text-stone-300">
                      {imgBusyId === c.id ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />} Upload
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        disabled={imgBusyId === c.id}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadImage(c, f); e.target.value = ""; }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => handleGenerateImage(c)}
                      disabled={imgBusyId === c.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-black/10 dark:border-white/10 px-2 py-1 text-[11px] font-medium text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
                    >
                      {imgBusyId === c.id ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} Generate
                    </button>
                    {c.imageKey && (
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(c)}
                        disabled={imgBusyId === c.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-black/10 dark:border-white/10 px-2 py-1 text-[11px] font-medium text-stone-400 transition-colors hover:text-red-500 disabled:opacity-50"
                      >
                        <ImagePlus size={11} /> Remove
                      </button>
                    )}
                  </div>
                  {imgError && imgBusyId === null && <p className="mt-1 text-[11px] text-red-500">{imgError}</p>}

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleChatChar(c)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-deep"
                    >
                      <MessageCircle size={13} /> Chat
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteChar(c)}
                      disabled={charBusyId === c.id}
                      className="rounded-xl border border-black/10 dark:border-white/10 px-3 py-2 text-xs font-medium text-stone-500 transition-colors hover:bg-black/[0.05] hover:text-red-500 disabled:opacity-50"
                      aria-label="Delete companion"
                    >
                      {charBusyId === c.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                  <PublishControl
                    visibility={c.visibility}
                    moderationStatus={c.moderationStatus}
                    moderationReason={c.moderationReason}
                    busy={pubBusyId === c.id}
                    onPublish={() => handlePublishChar(c)}
                    onUnpublish={() => handleUnpublishChar(c)}
                  />
                </motion.li>
              ))}
            </ul>
          )}
        </div>
      </div>
      </>
      )}

      {tab === "adventures" && <AdventureBuilder />}
    </section>
  );
}
