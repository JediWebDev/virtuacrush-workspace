import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Wand2, Play, Trash2, Loader2, BookPlus, UserPlus, MessageCircle, ImagePlus, Dices, Pencil, X } from "lucide-react";
import { customAvatar } from "../lib/customCharacter";
import VoiceTagPicker from "../components/VoiceTagPicker";
import StudioNpcEditor from "../components/StudioNpcEditor";
import { studioNpcInputsFromDrafts, type StudioNpcDraft } from "../lib/studioNpc";
import { arcFormFromStory } from "../lib/studioLoad";
import { CHARACTERS } from "../types/character";
import AdventureBuilder from "../components/AdventureBuilder";
import PublishControl from "../components/PublishControl";
import AvatarImageStudio from "../components/AvatarImageStudio";
import { StudioGuide, StudioField, StudioFieldHint, StudioOptionalSection } from "../components/StudioGuide";
import {
  studioLabelClass,
  studioInputClass,
  studioSelectClass,
  studioFormWrapperClass,
} from "../components/studioFormStyles";
import {
  createStudioStory,
  updateStudioStory,
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
  fetchStudioVocabulary,
  fetchRandomCharacterDraft,
  fetchRandomArcDraft,
  type StudioVocabulary,
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
  beginningInstruction: "",
  middleInstruction: "",
  endInstruction: "",
  introNarrative: "",
  completionCriteria: "",
  coPresent: true,
  tone: "dramatic" as Tone,
});

const ACT_HINTS = {
  beginning: "Setup — establish stakes, who is present, and the opening dynamic.",
  middle: "Confrontation — escalate complications and let player choices matter.",
  end: "Resolution — pay off the arc and move toward completion.",
} as const;

const TAB_BLURBS: Record<"stories" | "characters" | "adventures", string> = {
  stories:
    "Linear story arcs — one scene with a clear beginning, middle, and end. Best for a focused date or mission with your companion.",
  characters: "Create custom companions you can chat with or star in your stories.",
  adventures:
    "Branching choose-your-own-adventure — multiple beats and player choices. Best when you want different paths and endings.",
};

const emptyCharForm = () => ({
  displayName: "",
  core: "",
  greeting: "",
  secret: "",
  voiceTags: [] as string[],
});

const randomBtnClass =
  "inline-flex items-center gap-1.5 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/15 disabled:opacity-50";

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
  const [vocabulary, setVocabulary] = useState<StudioVocabulary | null>(null);
  const [randomBusy, setRandomBusy] = useState(false);
  const [arcNpcs, setArcNpcs] = useState<StudioNpcDraft[]>([]);
  const [editingStoryId, setEditingStoryId] = useState<string | null>(null);

  const arcStories = useMemo(() => stories.filter((s) => s.format === "arc"), [stories]);

  const charName = (id: string) => CHARACTERS.find((c) => c.id === id)?.name ?? characters.find((c) => customCharacterRef(c.id) === id)?.displayName ?? id;

  useEffect(() => {
    fetchStudioVocabulary().then(setVocabulary).catch(() => setVocabulary(null));
  }, []);

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

  const setChar = <K extends keyof ReturnType<typeof emptyCharForm>>(k: K, v: ReturnType<typeof emptyCharForm>[K]) =>
    setCharForm((f) => ({ ...f, [k]: v }));

  const handleRandomCharacter = async () => {
    setCharError(null);
    setRandomBusy(true);
    try {
      const draft = await fetchRandomCharacterDraft();
      setCharForm({
        displayName: draft.displayName,
        core: draft.core,
        greeting: draft.greeting ?? "",
        secret: draft.secret ?? "",
        voiceTags: draft.meta.voiceTags,
      });
    } catch {
      setCharError("Couldn't generate a random companion. Try again.");
    } finally {
      setRandomBusy(false);
    }
  };

  const cancelArcEdit = () => {
    setEditingStoryId(null);
    setForm(emptyForm(CHARACTERS[0]?.id ?? ""));
    setArcNpcs([]);
    setError(null);
  };

  const loadArcForEdit = (story: StudioStory) => {
    if (story.format !== "arc") return;
    const { form: loaded, npcs } = arcFormFromStory(story);
    setForm(loaded);
    setArcNpcs(npcs);
    setEditingStoryId(story.id);
    setError(null);
    document.getElementById("studio-arc-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleRandomArc = async (randomCompanion = false) => {
    setError(null);
    setEditingStoryId(null);
    setRandomBusy(true);
    try {
      const draft = await fetchRandomArcDraft(randomCompanion ? undefined : form.characterId);
      setForm({
        characterId: draft.characterId,
        title: draft.title,
        setting: draft.setting,
        situation: draft.situation,
        playerSituation: draft.playerSituation ?? "",
        npcInstruction: draft.npcInstruction,
        beginningInstruction: draft.beginningInstruction ?? "",
        middleInstruction: draft.middleInstruction ?? "",
        endInstruction: draft.endInstruction ?? "",
        introNarrative: draft.introNarrative ?? "",
        completionCriteria: draft.completionCriteria,
        coPresent: draft.coPresent,
        tone: (draft.tone as Tone) || "dramatic",
      });
      setArcNpcs([]);
    } catch {
      setError("Couldn't generate a random story. Try again.");
    } finally {
      setRandomBusy(false);
    }
  };

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
        tone: charForm.voiceTags.length ? charForm.voiceTags : undefined,
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
  const [imgError, setImgError] = useState<{ id: string; message: string } | null>(null);
  const [imgPrompt, setImgPrompt] = useState<Record<string, string>>({});
  const handleUploadImage = async (c: StudioCharacter, file: File) => {
    setImgError(null); setImgBusyId(c.id);
    try {
      const dataUrl = await fileToDataUrl(file);
      await uploadStudioCharacterImage(c.id, dataUrl);
      refreshChars();
    } catch {
      setImgError({ id: c.id, message: "Couldn't upload that image. Use a PNG/JPG/WEBP under 6MB." });
    } finally { setImgBusyId(null); }
  };
  const handleGenerateImage = async (c: StudioCharacter) => {
    setImgError(null); setImgBusyId(c.id);
    try {
      await generateStudioCharacterImage(c.id, { appearance: (imgPrompt[c.id] || "").trim() || undefined });
      refreshChars();
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setImgError({ id: c.id, message: "AI avatar generation is a Pro feature." });
      else if (e instanceof ApiError && e.body?.error === "storage_failed") setImgError({ id: c.id, message: "Image storage rejected the upload — the R2 API token likely needs Object Read & Write permission." });
      else if (e instanceof ApiError && e.body?.detail) setImgError({ id: c.id, message: String(e.body.detail).slice(0, 220) });
      else setImgError({ id: c.id, message: "Couldn't generate an image. Please try again." });
    } finally { setImgBusyId(null); }
  };
  const handleRemoveImage = async (c: StudioCharacter) => {
    setImgBusyId(c.id);
    try { await deleteStudioCharacterImage(c.id); refreshChars(); } catch { /* noop */ } finally { setImgBusyId(null); }
  };

  const set = <K extends keyof ReturnType<typeof emptyForm>>(k: K, v: ReturnType<typeof emptyForm>[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSaveStory = async () => {
    setError(null);
    if (!form.setting.trim() || !form.situation.trim() || !form.npcInstruction.trim() || !form.completionCriteria.trim()) {
      setError("Please fill in setting, situation, character behavior, and how it ends.");
      return;
    }
    setSaving(true);
    try {
      const npcInputs = studioNpcInputsFromDrafts(arcNpcs);
      const payload = {
        characterId: form.characterId,
        title: form.title.trim() || "Untitled story",
        setting: form.setting.trim(),
        situation: form.situation.trim(),
        playerSituation: form.playerSituation.trim() || undefined,
        npcInstruction: form.npcInstruction.trim(),
        beginningInstruction: form.beginningInstruction.trim() || undefined,
        middleInstruction: form.middleInstruction.trim() || undefined,
        endInstruction: form.endInstruction.trim() || undefined,
        introNarrative: form.introNarrative.trim() || undefined,
        completionCriteria: form.completionCriteria.trim(),
        coPresent: form.coPresent,
        tone: form.tone,
        ...(npcInputs.length ? { npcs: npcInputs } : {}),
      };
      if (editingStoryId) {
        await updateStudioStory(editingStoryId, payload);
      } else {
        await createStudioStory(payload);
      }
      cancelArcEdit();
      refresh();
    } catch {
      setError(editingStoryId ? "Couldn't update the story. Please try again." : "Couldn't save the story. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handlePlay = async (s: StudioStory) => {
    setBusyId(s.id);
    try {
      const { characterId, storyTitle } = await playStudioStory(s.id);
      navigate(`/chat/${characterId}`, { state: { studioArcTitle: storyTitle ?? s.title } });
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 403) {
        setError("You must finish your first meeting with that character in chat before playing a Studio story.");
      } else {
        setError("Couldn't start that story.");
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (s: StudioStory) => {
    setBusyId(s.id);
    try {
      await deleteStudioStory(s.id);
      setStories((prev) => prev.filter((x) => x.id !== s.id));
      if (editingStoryId === s.id) cancelArcEdit();
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

      <p className="mb-6 text-sm leading-relaxed text-stone-600 dark:text-stone-400">{TAB_BLURBS[tab]}</p>

      {tab === "stories" && (
      <>
      <StudioGuide title="How story arcs work">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li><span className="font-medium text-stone-800 dark:text-stone-100">Pick a companion</span> and describe where you are and what&apos;s happening.</li>
          <li><span className="font-medium text-stone-800 dark:text-stone-100">Tell the character how to act</span> and how the story should end.</li>
          <li><span className="font-medium text-stone-800 dark:text-stone-100">Add scene NPCs</span> (optional) — friends, rivals, or venue staff who can speak in the scene.</li>
          <li><span className="font-medium text-stone-800 dark:text-stone-100">Save, then Play</span> from the list on the right — or edit anytime with the pencil icon.</li>
        </ol>
        <p className="text-xs text-stone-500">Want branching choices instead? Use the <button type="button" onClick={() => setTab("adventures")} className="font-semibold text-accent underline-offset-2 hover:underline">Adventures</button> tab.</p>
      </StudioGuide>
      <div className={`grid gap-8 lg:grid-cols-[1fr_360px] ${studioFormWrapperClass}`}>
        {/* Builder form */}
        <div id="studio-arc-form" className="card-gradient rounded-3xl p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-stone-800 dark:text-stone-100">
                {editingStoryId ? <Pencil size={16} className="text-accent" /> : <BookPlus size={16} className="text-accent" />}
                {editingStoryId ? "Edit story arc" : "New story arc"}
              </h2>
              <p className="text-xs text-stone-600 dark:text-stone-400">
                {editingStoryId ? "Update fields below, then save changes." : "Fields marked below are required to save."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {editingStoryId && (
                <button type="button" onClick={cancelArcEdit} className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 px-3 py-2 text-xs font-semibold text-stone-600 transition-colors hover:bg-black/[0.04] dark:border-white/10 dark:text-stone-300">
                  <X size={14} /> Cancel
                </button>
              )}
              <button type="button" disabled={randomBusy} onClick={() => handleRandomArc(false)} className={randomBtnClass}>
                {randomBusy ? <Loader2 size={14} className="animate-spin" /> : <Dices size={14} />}
                Random story
              </button>
              <button type="button" disabled={randomBusy} onClick={() => handleRandomArc(true)} className={randomBtnClass}>
                <Dices size={14} /> Random + companion
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <StudioField label="Companion" hint="Who stars in this story.">
              <select className={studioSelectClass} value={form.characterId} onChange={(e) => set("characterId", e.target.value)}>
                {CHARACTERS.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </StudioField>
            <StudioField label="Title" hint={<>Optional — defaults to &quot;Untitled story&quot;.</>}>
              <input className={studioInputClass} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="The Great Taco Hunt" />
            </StudioField>
          </div>

          <div className="mt-4">
            <label className={studioLabelClass}>Setting <span className="text-accent">*</span></label>
            <StudioFieldHint>Where the scene takes place — one vivid line is enough.</StudioFieldHint>
            <input className={studioInputClass} value={form.setting} onChange={(e) => set("setting", e.target.value)} placeholder="a sunny boardwalk lined with food trucks" />
          </div>

          <div className="mt-4">
            <label className={studioLabelClass}>Situation <span className="text-accent">*</span></label>
            <StudioFieldHint>What&apos;s going on right now — the scene&apos;s ground truth the AI must respect.</StudioFieldHint>
            <textarea className={studioInputClass} rows={3} value={form.situation} onChange={(e) => set("situation", e.target.value)} placeholder="You're on a mission to track down the legendary taco truck everyone's raving about — but it keeps moving, and a smug rival foodie keeps beating you to the best spots." />
          </div>

          <div className="mt-4">
            <label className={studioLabelClass}>Character behavior <span className="text-accent">*</span></label>
            <StudioFieldHint>How {charName(form.characterId)} should act for the whole arc.</StudioFieldHint>
            <textarea className={studioInputClass} rows={3} value={form.npcInstruction} onChange={(e) => set("npcInstruction", e.target.value)} placeholder={`${charName(form.characterId)} treats this like a serious culinary expedition — hyping every lead and dramatically rating each taco out of ten.`} />
          </div>

          <div className="mt-4">
            <label className={studioLabelClass}>How it ends <span className="text-accent">*</span></label>
            <StudioFieldHint>What counts as finishing the story — the director uses this to wrap up.</StudioFieldHint>
            <textarea className={studioInputClass} rows={2} value={form.completionCriteria} onChange={(e) => set("completionCriteria", e.target.value)} placeholder="You hunt down the legendary truck together and crown the best taco — or get gloriously full trying." />
          </div>

          <StudioOptionalSection
            title="Optional details"
            summary="Your role, opening line, tone, and per-act pacing notes"
          >
            <div>
              <label className={studioLabelClass}>Your role &amp; constraints</label>
              <StudioFieldHint>Who you are in the scene — keeps the director from putting words in your mouth.</StudioFieldHint>
              <textarea className={studioInputClass} rows={2} value={form.playerSituation} onChange={(e) => set("playerSituation", e.target.value)} placeholder="You're free and along for the ride — hungry, competitive, and armed with very strong opinions about hot sauce." />
            </div>

            <div>
              <label className={studioLabelClass}>Opening narration</label>
              <StudioFieldHint>Shown once when the story starts — sets the mood before chat begins.</StudioFieldHint>
              <textarea className={studioInputClass} rows={2} value={form.introNarrative} onChange={(e) => set("introNarrative", e.target.value)} placeholder="The boardwalk smells like grilled onions and possibility. Somewhere out there, the perfect taco is waiting." />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <StudioField label="Tone">
                <select className={studioSelectClass} value={form.tone} onChange={(e) => set("tone", e.target.value as Tone)}>
                  {TONES.map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
              </StudioField>
              <StudioField label="Co-presence" hint="Whether they share the scene with you.">
                <label className="flex min-h-[2.625rem] items-center gap-2 text-sm text-stone-700 dark:text-stone-300">
                  <input type="checkbox" checked={form.coPresent} onChange={(e) => set("coPresent", e.target.checked)} className="h-4 w-4 shrink-0 rounded accent-accent" />
                  <span>{charName(form.characterId)} is physically with you</span>
                </label>
              </StudioField>
            </div>

            <div className="rounded-xl border border-stone-200/80 bg-white/60 p-3 dark:border-stone-600 dark:bg-stone-900/30">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-accent">Three-act pacing</p>
              <StudioFieldHint>Steer how they behave in setup, confrontation, and resolution. Leave blank to use only the overall behavior above.</StudioFieldHint>
              <div className="mt-3 space-y-4">
                {(["beginning", "middle", "end"] as const).map((act) => (
                  <div key={act}>
                    <label className={studioLabelClass}>
                      Act {act === "beginning" ? "I" : act === "middle" ? "II" : "III"} — {act}
                    </label>
                    <p className="mb-1.5 text-[11px] text-stone-600 dark:text-stone-400">{ACT_HINTS[act]}</p>
                    <textarea
                      className={studioInputClass}
                      rows={2}
                      value={form[`${act}Instruction`]}
                      onChange={(e) => set(`${act}Instruction`, e.target.value)}
                      placeholder={
                        act === "beginning"
                          ? "Ground the scene — what's the immediate tension or hook?"
                          : act === "middle"
                            ? "Deepen the conflict — what complications or choices should land here?"
                            : "Bring it home — how should they behave as the arc resolves?"
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          </StudioOptionalSection>

          <StudioOptionalSection title="Scene NPCs" summary="Friends, enemies, and bystanders in this arc">
            <StudioNpcEditor
              npcs={arcNpcs}
              onChange={setArcNpcs}
              vocabulary={vocabulary?.npcs}
              disabled={saving}
            />
          </StudioOptionalSection>

          {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

          <button
            type="button"
            onClick={handleSaveStory}
            disabled={saving}
            className="mt-5 flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-accent/25 transition-all hover:bg-accent-deep active:scale-95 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : editingStoryId ? <Pencil size={16} /> : <BookPlus size={16} />}
            {saving ? "Saving…" : editingStoryId ? "Save changes" : "Save story"}
          </button>
        </div>

        {/* My stories */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-stone-800 dark:text-stone-100">My stories</h2>
          {loading ? (
            <p className="flex items-center gap-2 py-6 text-sm text-stone-500"><Loader2 size={16} className="animate-spin" /> Loading…</p>
          ) : arcStories.length === 0 ? (
            <p className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] p-4 text-sm text-stone-500">
              No stories yet. Write one on the left and hit Save.
            </p>
          ) : (
            <ul className="space-y-3">
              {arcStories.map((s) => {
                const npcCount = Array.isArray(s.spec?.npcs) ? s.spec.npcs.length : 0;
                const isEditing = editingStoryId === s.id;
                return (
                <motion.li
                  key={s.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`rounded-2xl border p-4 ${
                    isEditing
                      ? "border-accent/50 bg-accent/5 dark:bg-accent/10"
                      : "border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03]"
                  }`}
                >
                  <p className="text-[11px] font-medium uppercase tracking-wide text-accent">
                    {charName(s.characterId)} · {s.format}{npcCount ? ` · ${npcCount} NPC${npcCount === 1 ? "" : "s"}` : ""}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-stone-900 dark:text-stone-50">{s.title}</p>
                  {typeof s.spec.setting === "string" && (
                    <p className="mt-1 line-clamp-2 text-xs italic text-stone-500">{s.spec.setting as string}</p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => loadArcForEdit(s)}
                      disabled={busyId === s.id}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-black/10 px-3 py-2 text-xs font-semibold text-stone-600 transition-colors hover:bg-black/[0.05] dark:border-white/10 dark:text-stone-300 disabled:opacity-50"
                      aria-label="Edit story"
                    >
                      <Pencil size={13} />
                    </button>
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
                );
              })}
            </ul>
          )}
        </div>
      </div>
      </>
      )}

      {tab === "characters" && (
      <>
      <StudioGuide title="How companions work">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li><span className="font-medium text-stone-800 dark:text-stone-100">Name and personality</span> are required — everything else is optional.</li>
          <li><span className="font-medium text-stone-800 dark:text-stone-100">Save</span>, then add an avatar on the card to the right (upload or AI-generate — <span className="text-stone-500">AI is Pro</span>).</li>
          <li><span className="font-medium text-stone-800 dark:text-stone-100">Chat</span> freely, or pick them as the star in Stories or Adventures.</li>
        </ol>
      </StudioGuide>
      <div className={`grid gap-8 lg:grid-cols-[1fr_min(520px,42%)] ${studioFormWrapperClass}`}>
        {/* Character builder */}
        <div className="card-gradient rounded-3xl p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-800 dark:text-stone-100">
              <UserPlus size={16} className="text-accent" /> New companion
            </h2>
            <button type="button" disabled={randomBusy} onClick={handleRandomCharacter} className={randomBtnClass}>
              {randomBusy ? <Loader2 size={14} className="animate-spin" /> : <Dices size={14} />}
              Random companion
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <StudioField label="Name" required hint="Display name in chat and story lists.">
              <input className={studioInputClass} value={charForm.displayName} onChange={(e) => setChar("displayName", e.target.value)} placeholder="Captain Pancake" />
            </StudioField>
            <StudioField label="Voice tags" hint="Pick up to 3 — shapes how they talk.">
              {vocabulary ? (
                <VoiceTagPicker
                  tags={vocabulary.voiceTags}
                  selected={charForm.voiceTags}
                  limit={vocabulary.voiceTagLimit}
                  onChange={(voiceTags) => setChar("voiceTags", voiceTags)}
                  disabled={charSaving}
                />
              ) : (
                <p className="text-xs text-stone-500">Loading tags…</p>
              )}
            </StudioField>
          </div>

          <div className="mt-4">
            <label className={studioLabelClass}>Personality <span className="text-accent">*</span></label>
            <StudioFieldHint>Who they are — at least a sentence or two. This drives how they talk.</StudioFieldHint>
            <textarea className={studioInputClass} rows={4} value={charForm.core} onChange={(e) => setChar("core", e.target.value)} placeholder="A retired pirate turned brunch-cafe owner who flirts in nautical puns, takes their syrup very seriously, and secretly writes terrible sea-shanty poetry." />
          </div>

          <StudioOptionalSection title="Optional extras" summary="Custom greeting and a secret revealed as you grow closer">
            <div>
              <label className={studioLabelClass}>Greeting</label>
              <StudioFieldHint>Their first message when you start a new chat.</StudioFieldHint>
              <textarea className={studioInputClass} rows={2} value={charForm.greeting} onChange={(e) => setChar("greeting", e.target.value)} placeholder="Ahoy! Pull up a stool — the pancakes are hot and the coffee's stronger than a kraken's grip." />
            </div>
            <div>
              <label className={studioLabelClass}>Secret</label>
              <StudioFieldHint>Something they reveal only after you&apos;ve built rapport.</StudioFieldHint>
              <textarea className={studioInputClass} rows={2} value={charForm.secret} onChange={(e) => setChar("secret", e.target.value)} placeholder="They never actually sailed the high seas — the whole pirate thing started as a costume-party bit that got gloriously out of hand." />
            </div>
          </StudioOptionalSection>

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
            <ImagePlus size={13} className="text-accent" /> After saving, set an avatar on your companion&apos;s card — upload a photo or describe one for AI to generate (<span className="text-stone-400">AI is Pro</span>).
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
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">{c.displayName}</p>
                  <p className="mt-1 line-clamp-3 text-xs italic text-stone-500">{c.core}</p>

                  <div className="mt-4">
                    <AvatarImageStudio
                      imageSrc={c.imageKey ? assetUrl(c.imageKey) : customAvatar(c.displayName)}
                      alt={c.displayName}
                      prompt={imgPrompt[c.id] ?? ""}
                      onPromptChange={(value) => setImgPrompt((p) => ({ ...p, [c.id]: value }))}
                      onUpload={(f) => void handleUploadImage(c, f)}
                      onGenerate={() => void handleGenerateImage(c)}
                      onRemove={() => void handleRemoveImage(c)}
                      busy={imgBusyId === c.id}
                      error={imgError?.id === c.id ? imgError.message : null}
                      hasCustomImage={Boolean(c.imageKey)}
                      promptLabel="Describe this companion's avatar"
                      promptPlaceholder="Weathered sea captain, silver beard, navy coat, warm grin, soft harbor light, painterly portrait…"
                      promptHint="Describe their look, outfit, mood, and art style. Leave blank to infer from their personality."
                      generateLabel="Generate avatar"
                    />
                  </div>

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

      {tab === "adventures" && <AdventureBuilder npcVocabulary={vocabulary?.npcs} />}
    </section>
  );
}
