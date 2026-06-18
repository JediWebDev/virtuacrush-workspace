// Story Studio — CYOA "Adventures" builder (Phase 3).
//
// A structured node-list editor for branching story packs. Each node is a beat
// with intro narration, a character instruction, and either a set of choices
// (each pointing to another node or "end") or a terminal "ending" flag. The
// graph is validated live (reachability + a reachable ending) and saved as a
// user pack that surfaces in the in-chat story list for the chosen companion.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Loader2, Plus, Trash2, MessageCircle, Sparkles, GitBranch, Flag } from "lucide-react";
import { CHARACTERS } from "../types/character";
import PublishControl from "./PublishControl";
import { StudioGuide, StudioField, StudioFieldHint, StudioOptionalSection } from "./StudioGuide";
import {
  studioLabelClass,
  studioInputClass,
  studioSelectClass,
  studioFormWrapperClass,
} from "./studioFormStyles";
import {
  createStudioPack,
  listStudioPacks,
  deleteStudioPack,
  listStudioCharacters,
  publishStudioPack,
  unpublishStudioPack,
  type StudioPack,
  type StudioCharacter,
  type StudioMood,
  type StudioStoryAct,
} from "../lib/api";

const labelClass = studioLabelClass;
const inputClass = studioInputClass;
const selectClass = studioSelectClass;

const MOODS: StudioMood[] = [
  "romantic", "dramatic", "comedic", "thriller", "mystery", "playful", "cozy", "gothic", "tense", "sexy", "kinky",
];

const ACTS: { value: StudioStoryAct | "auto"; label: string }[] = [
  { value: "auto", label: "Auto (infer from graph)" },
  { value: "beginning", label: "Beginning — setup" },
  { value: "middle", label: "Middle — confrontation" },
  { value: "end", label: "End — resolution" },
];

const ACT_BADGE: Record<StudioStoryAct, string> = {
  beginning: "Act I",
  middle: "Act II",
  end: "Act III",
};

const END = "end";
const CONTINUE = "continue";

interface EditChoice {
  label: string;
  userMessage: string;
  next: string; // node id or END
}
interface EditNode {
  id: string;        // 'start' for the first node; auto-generated otherwise
  npcInstruction: string;
  introNarrative: string;
  terminal: boolean; // true => ending beat (choices: null)
  /** Explicit three-act tag, or "auto" to infer at runtime. */
  act: StudioStoryAct | "auto";
  choices: EditChoice[];
}

function freshNode(id: string): EditNode {
  return {
    id,
    npcInstruction: "",
    introNarrative: "",
    terminal: false,
    act: id === "start" ? "beginning" : "auto",
    choices: [],
  };
}

function freshGraph(): EditNode[] {
  return [{ ...freshNode("start"), choices: [{ label: "", userMessage: "", next: END }] }];
}

/** Validate the working graph the same way the server does. Returns errors + soft warnings. */
function validateGraph(nodes: EditNode[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set(nodes.map((n) => n.id));
  if (!ids.has("start")) errors.push('A "start" node is required.');

  for (const n of nodes) {
    if (!n.npcInstruction.trim()) errors.push(`Node "${n.id}" needs a character instruction.`);
    if (!n.terminal) {
      const real = n.choices.filter((c) => c.label.trim());
      if (real.length === 0) errors.push(`Node "${n.id}" has no choices (add one, or mark it an ending).`);
      for (const c of real) {
        if (c.next !== END && c.next !== CONTINUE && !ids.has(c.next)) errors.push(`A choice in "${n.id}" points to a missing node.`);
      }
    }
  }

  // Reachability from start + a reachable ending.
  const reachable = new Set<string>();
  const stack = ["start"];
  let canEnd = false;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  while (stack.length) {
    const cur = stack.pop()!;
    if (reachable.has(cur)) continue;
    reachable.add(cur);
    const node = byId.get(cur);
    if (!node) continue;
    if (node.terminal) { canEnd = true; continue; }
    for (const c of node.choices) {
      if (!c.label.trim()) continue;
      if (c.next === END) { canEnd = true; continue; }
      if (c.next === CONTINUE) continue;
      if (byId.has(c.next) && !reachable.has(c.next)) stack.push(c.next);
    }
  }
  if (!canEnd) errors.push('The story has no reachable ending (add an ending node or a choice that goes to "End the story").');
  for (const n of nodes) {
    if (n.id !== "start" && !reachable.has(n.id)) errors.push(`Node "${n.id}" can't be reached from the start.`);
  }

  const explicitActs = new Set(
    nodes.map((n) => {
      if (n.act !== "auto") return n.act;
      if (n.terminal) return "end" as const;
      if (n.id === "start") return "beginning" as const;
      return null;
    }).filter(Boolean),
  );
  if (nodes.filter((n) => !n.terminal).length > 2 && !explicitActs.has("middle")) {
    warnings.push('Consider tagging at least one beat as "Middle" for a classic three-act structure.');
  }

  return { errors, warnings };
}

export default function AdventureBuilder() {
  const navigate = useNavigate();

  // Companion options: built-ins + the user's custom characters.
  const [customChars, setCustomChars] = useState<StudioCharacter[]>([]);
  useEffect(() => {
    listStudioCharacters().then(setCustomChars).catch(() => setCustomChars([]));
  }, []);
  const companions = useMemo(
    () => [
      ...CHARACTERS.map((c) => ({ value: c.id, label: c.name })),
      ...customChars.map((c) => ({ value: `user:${c.id}`, label: `${c.displayName} (custom)` })),
    ],
    [customChars],
  );

  // Meta fields.
  const [characterId, setCharacterId] = useState(CHARACTERS[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [blurb, setBlurb] = useState("");
  const [mood, setMood] = useState<StudioMood>("dramatic");
  const [setting, setSetting] = useState("");
  const [situation, setSituation] = useState("");
  const [systemInstruction, setSystemInstruction] = useState("");
  const [coPresent, setCoPresent] = useState(true);

  // Node graph.
  const [nodes, setNodes] = useState<EditNode[]>(freshGraph);
  const [seq, setSeq] = useState(1);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // My adventures list.
  const [packs, setPacks] = useState<StudioPack[]>([]);
  const [loadingPacks, setLoadingPacks] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pubBusyId, setPubBusyId] = useState<string | null>(null);
  const refreshPacks = () => {
    setLoadingPacks(true);
    listStudioPacks().then(setPacks).catch(() => setPacks([])).finally(() => setLoadingPacks(false));
  };
  useEffect(refreshPacks, []);

  const handlePublish = async (p: StudioPack) => {
    setPubBusyId(p.id);
    try { await publishStudioPack(p.id); } catch { /* status surfaced on refresh */ } finally { refreshPacks(); setPubBusyId(null); }
  };
  const handleUnpublish = async (p: StudioPack) => {
    setPubBusyId(p.id);
    try { await unpublishStudioPack(p.id); } catch { /* noop */ } finally { refreshPacks(); setPubBusyId(null); }
  };

  const { errors: graphErrors, warnings: graphWarnings } = useMemo(() => validateGraph(nodes), [nodes]);
  const nodeIds = nodes.map((n) => n.id);

  // --- Node mutations -------------------------------------------------------
  const patchNode = (id: string, patch: Partial<EditNode>) =>
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, ...patch } : n)));

  const addNode = () => {
    const id = `node_${seq}`;
    setSeq((s) => s + 1);
    setNodes((ns) => [...ns, { ...freshNode(id), choices: [{ label: "", userMessage: "", next: END }] }]);
  };

  const removeNode = (id: string) => {
    if (id === "start") return;
    setNodes((ns) =>
      ns
        .filter((n) => n.id !== id)
        // Repoint any choices that targeted the removed node to "end".
        .map((n) => ({ ...n, choices: n.choices.map((c) => (c.next === id ? { ...c, next: END } : c)) })),
    );
  };

  const addChoice = (nodeId: string) =>
    setNodes((ns) =>
      ns.map((n) => (n.id === nodeId ? { ...n, choices: [...n.choices, { label: "", userMessage: "", next: END }] } : n)),
    );
  const patchChoice = (nodeId: string, idx: number, patch: Partial<EditChoice>) =>
    setNodes((ns) =>
      ns.map((n) =>
        n.id === nodeId ? { ...n, choices: n.choices.map((c, i) => (i === idx ? { ...c, ...patch } : c)) } : n,
      ),
    );
  const removeChoice = (nodeId: string, idx: number) =>
    setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, choices: n.choices.filter((_, i) => i !== idx) } : n)));

  const resetForm = () => {
    setTitle(""); setBlurb(""); setSetting(""); setSituation(""); setSystemInstruction("");
    setMood("dramatic"); setCoPresent(true); setNodes(freshGraph()); setSeq(1);
  };

  const handleSave = async () => {
    setError(null); setSavedMsg(null);
    if (!title.trim()) return setError("Give your adventure a title.");
    if (!situation.trim()) return setError("Describe the opening situation.");
    if (!systemInstruction.trim()) return setError("Add the overall story framing.");
    if (graphErrors.length) return setError("Fix the story-flow issues listed below before saving.");

    // Build the spec node map.
    const nodeMap: Record<string, { npcInstruction: string; introNarrative?: string; act?: StudioStoryAct; choices: EditChoice[] | null }> = {};
    for (const n of nodes) {
      nodeMap[n.id] = {
        npcInstruction: n.npcInstruction.trim(),
        ...(n.introNarrative.trim() ? { introNarrative: n.introNarrative.trim() } : {}),
        ...(n.act !== "auto" ? { act: n.act } : {}),
        choices: n.terminal
          ? null
          : n.choices
              .filter((c) => c.label.trim())
              .map((c) => ({ label: c.label.trim(), userMessage: c.userMessage.trim() || c.label.trim(), next: c.next })),
      };
    }

    setSaving(true);
    try {
      await createStudioPack({
        characterId,
        title: title.trim(),
        blurb: blurb.trim() || undefined,
        mood,
        setting: setting.trim() || undefined,
        situation: situation.trim(),
        coPresent,
        systemInstruction: systemInstruction.trim(),
        nodes: nodeMap as unknown as Record<string, { npcInstruction: string; choices: EditChoice[] | null }>,
      });
      resetForm();
      setSavedMsg("Saved! It'll appear in the story list when you open this companion's chat.");
      refreshPacks();
    } catch {
      setError("Couldn't save the adventure. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const companionName = (id: string) =>
    companions.find((c) => c.value === id)?.label ?? id;

  return (
    <>
    <StudioGuide title="How adventures work">
      <ol className="list-decimal space-y-1.5 pl-5">
        <li><span className="font-medium text-stone-800 dark:text-stone-100">Set the scene</span> — companion, title, and opening situation.</li>
        <li><span className="font-medium text-stone-800 dark:text-stone-100">Add beats</span> — each beat tells the character what to do; non-ending beats need at least one choice.</li>
        <li><span className="font-medium text-stone-800 dark:text-stone-100">Wire choices</span> to the next beat, &quot;Continue story&quot; (stay on this beat), or &quot;End the story.&quot;</li>
      </ol>
      <p className="text-xs text-stone-500">For a single linear arc without branches, try the Stories tab instead.</p>
    </StudioGuide>
    <div className={`grid gap-8 lg:grid-cols-[1fr_340px] ${studioFormWrapperClass}`}>
      {/* Builder */}
      <div className="space-y-6">
        {/* Story basics */}
        <div className="rounded-3xl border border-black/10 dark:border-white/10 glass p-6">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-stone-800 dark:text-stone-100">
            <Sparkles size={16} className="text-accent" /> Adventure basics
          </h2>
          <p className="mb-4 text-xs text-stone-600 dark:text-stone-400">Companion, title, situation, and story framing are required.</p>

          <div className="grid gap-4 md:grid-cols-2">
            <StudioField label="Companion" hint="Who leads this adventure — built-in or your custom companions.">
              <select className={selectClass} value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
                {companions.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </StudioField>
            <StudioField label="Title" required hint="Shown in the story picker and chat.">
              <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The Midnight Bakery Heist" />
            </StudioField>
          </div>

          <div className="mt-4">
            <label className={labelClass}>Opening situation <span className="text-accent">*</span></label>
            <StudioFieldHint>What&apos;s happening when the player arrives — ground truth for the director.</StudioFieldHint>
            <textarea className={inputClass} rows={3} value={situation} onChange={(e) => setSituation(e.target.value)} placeholder="You and your accomplice have ten minutes to recover a stolen sourdough starter before the owner returns. The alarm is armed and the ovens are still warm." />
          </div>

          <div className="mt-4">
            <label className={labelClass}>Story framing <span className="text-accent">*</span></label>
            <StudioFieldHint>Overall tone and rules for the whole adventure.</StudioFieldHint>
            <textarea className={inputClass} rows={3} value={systemInstruction} onChange={(e) => setSystemInstruction(e.target.value)} placeholder="A playful, fast-paced heist. Keep the tension light but real, lean into baking puns, and let choices genuinely change how the night goes." />
          </div>

          <StudioOptionalSection title="Optional scene details" summary="Blurb, mood, setting, and co-presence">
            <div>
              <label className={labelClass}>Short blurb</label>
              <StudioFieldHint>Shown in the story picker — one teaser line.</StudioFieldHint>
              <input className={inputClass} value={blurb} onChange={(e) => setBlurb(e.target.value)} placeholder="A flour-dusted caper with very high stakes and very fresh croissants." />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <StudioField label="Mood">
                <select className={selectClass} value={mood} onChange={(e) => setMood(e.target.value as StudioMood)}>
                  {MOODS.map((m) => (<option key={m} value={m}>{m}</option>))}
                </select>
              </StudioField>
              <StudioField label="Co-presence" hint="Whether they share the scene with you.">
                <label className="flex min-h-[2.625rem] items-center gap-2 text-sm text-stone-700 dark:text-stone-300">
                  <input type="checkbox" checked={coPresent} onChange={(e) => setCoPresent(e.target.checked)} className="h-4 w-4 shrink-0 rounded accent-[var(--accent,#c9717d)]" />
                  <span>{companionName(characterId)} is physically with you</span>
                </label>
              </StudioField>
            </div>

            <div>
              <label className={labelClass}>Setting</label>
              <StudioFieldHint>Where it opens — optional if situation already sets the place.</StudioFieldHint>
              <input className={inputClass} value={setting} onChange={(e) => setSetting(e.target.value)} placeholder="a darkened artisan bakery after closing time" />
            </div>
          </StudioOptionalSection>
        </div>

        {/* Story flow */}
        <div className="rounded-3xl border border-black/10 dark:border-white/10 glass p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-800 dark:text-stone-100">
                <GitBranch size={16} className="text-accent" /> Story flow
              </h2>
              <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">Each beat needs a character instruction. Add choices unless the beat ends the story.</p>
            </div>
            <button type="button" onClick={addNode} className="flex items-center gap-1.5 rounded-lg border border-black/10 dark:border-white/10 px-2.5 py-1.5 text-xs font-semibold text-stone-600 transition-colors hover:bg-black/[0.05] hover:text-accent dark:text-stone-300">
              <Plus size={13} /> Add beat
            </button>
          </div>

          <div className="space-y-4">
            {nodes.map((n) => (
              <div key={n.id} className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-accent/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent">
                    {n.id === "start" ? "Start" : n.id}
                    {n.terminal && <Flag size={11} />}
                    {n.act !== "auto" && (
                      <span className="ml-1 rounded bg-black/10 px-1 py-px text-[10px] font-semibold text-stone-600 dark:text-stone-300">
                        {ACT_BADGE[n.act]}
                      </span>
                    )}
                  </span>
                  {n.id !== "start" && (
                    <button type="button" onClick={() => removeNode(n.id)} className="text-stone-400 transition-colors hover:text-red-500" aria-label="Remove beat">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                <div className="mb-3 grid gap-3 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className={labelClass}>Character instruction <span className="text-accent">*</span></label>
                    <StudioFieldHint>What {companionName(characterId)} should do or say at this beat.</StudioFieldHint>
                    <textarea className={inputClass} rows={2} value={n.npcInstruction} onChange={(e) => patchNode(n.id, { npcInstruction: e.target.value })} placeholder="React to the player's plan, crack a nervous joke, and keep one ear on the door." />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs font-medium text-stone-700 dark:text-stone-300">
                  <input
                    type="checkbox"
                    checked={n.terminal}
                    onChange={(e) =>
                      patchNode(n.id, {
                        terminal: e.target.checked,
                        act: e.target.checked ? "end" : n.act === "end" ? "auto" : n.act,
                      })
                    }
                    className="h-4 w-4 rounded accent-[var(--accent,#c9717d)]"
                  />
                  This beat ends the story
                </label>

                {!n.terminal && (
                  <div className="mt-3 space-y-2">
                    <span className={labelClass}>Player choices</span>
                    <StudioFieldHint>Button label is required. &quot;Goes to&quot; picks the next beat, continues this beat, or ends the story.</StudioFieldHint>
                    {n.choices.map((c, i) => (
                      <div key={i} className="rounded-xl border border-stone-200/80 bg-white/50 p-2.5 dark:border-stone-600 dark:bg-stone-900/20">
                        <div className="flex items-center gap-2">
                          <input className={inputClass} value={c.label} onChange={(e) => patchChoice(n.id, i, { label: e.target.value })} placeholder="Button text — e.g. “Pick the lock”" />
                          <button type="button" onClick={() => removeChoice(n.id, i)} className="shrink-0 text-stone-400 transition-colors hover:text-red-500" aria-label="Remove choice">
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <input className={inputClass} value={c.userMessage} onChange={(e) => patchChoice(n.id, i, { userMessage: e.target.value })} placeholder="What the player does/says (optional)" />
                          <select className={selectClass} value={c.next} onChange={(e) => patchChoice(n.id, i, { next: e.target.value })}>
                            {nodeIds.filter((id) => id !== n.id).map((id) => (
                              <option key={id} value={id}>→ go to {id === "start" ? "Start" : id}</option>
                            ))}
                            <option value={CONTINUE}>→ Continue story</option>
                            <option value={END}>→ End the story</option>
                          </select>
                        </div>
                      </div>
                    ))}
                    <button type="button" onClick={() => addChoice(n.id)} className="flex items-center gap-1.5 text-xs font-semibold text-accent transition-opacity hover:opacity-80">
                      <Plus size={13} /> Add choice
                    </button>
                  </div>
                )}

                <StudioOptionalSection title="Beat extras" summary="Opening narration and story-act tag">
                  <div>
                    <label className={labelClass}>Story act</label>
                    <StudioFieldHint>Leave on Auto unless you want explicit setup / middle / end pacing.</StudioFieldHint>
                    <select
                      className={selectClass}
                      value={n.act}
                      onChange={(e) => {
                        const act = e.target.value as StudioStoryAct | "auto";
                        patchNode(n.id, {
                          act,
                          ...(act === "end" ? { terminal: true } : {}),
                        });
                      }}
                    >
                      {ACTS.map((a) => (
                        <option key={a.value} value={a.value}>{a.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Opening narration</label>
                    <textarea className={inputClass} rows={2} value={n.introNarrative} onChange={(e) => patchNode(n.id, { introNarrative: e.target.value })} placeholder="The display case glows faintly. Somewhere in the back, a timer ticks." />
                  </div>
                </StudioOptionalSection>
              </div>
            ))}
          </div>
        </div>

        {/* Validation + save */}
        <div className="rounded-3xl border border-black/10 dark:border-white/10 glass p-6">
          {graphErrors.length > 0 ? (
            <div className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">Story flow needs a fix</p>
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-stone-600 dark:text-stone-300">
                {graphErrors.slice(0, 8).map((m, i) => (<li key={i}>{m}</li>))}
              </ul>
            </div>
          ) : (
            <p className="mb-4 text-xs font-medium text-emerald-600 dark:text-emerald-400">✓ Story flow looks good — every path can reach an ending.</p>
          )}
          {graphWarnings.length > 0 && (
            <div className="mb-4 rounded-2xl border border-sky-400/30 bg-sky-400/10 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">Structure tip</p>
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-stone-600 dark:text-stone-300">
                {graphWarnings.map((m, i) => (<li key={i}>{m}</li>))}
              </ul>
            </div>
          )}

          {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
          {savedMsg && <p className="mb-3 text-sm text-emerald-600 dark:text-emerald-400">{savedMsg}</p>}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-accent/25 transition-all hover:bg-accent-deep active:scale-95 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {saving ? "Saving…" : "Save adventure"}
          </button>
        </div>
      </div>

      {/* My adventures */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-stone-800 dark:text-stone-100">My adventures</h2>
        {loadingPacks ? (
          <p className="flex items-center gap-2 py-6 text-sm text-stone-500"><Loader2 size={16} className="animate-spin" /> Loading…</p>
        ) : packs.length === 0 ? (
          <p className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] p-4 text-sm text-stone-500">
            No adventures yet. Build a branching story on the left and save it.
          </p>
        ) : (
          <ul className="space-y-3">
            {packs.map((p) => {
              const nodeCount = p.spec?.nodes ? Object.keys(p.spec.nodes).length : 0;
              return (
                <motion.li
                  key={p.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] p-4"
                >
                  <p className="text-[11px] font-medium uppercase tracking-wide text-accent">{companionName(p.characterId)} · {nodeCount} beats</p>
                  <p className="mt-0.5 text-sm font-semibold text-stone-900 dark:text-stone-50">{p.title}</p>
                  {p.blurb && <p className="mt-1 line-clamp-2 text-xs italic text-stone-500">{p.blurb}</p>}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/chat/${p.characterId}`)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-deep"
                    >
                      <MessageCircle size={13} /> Open chat
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setBusyId(p.id);
                        try { await deleteStudioPack(p.id); setPacks((prev) => prev.filter((x) => x.id !== p.id)); }
                        catch { /* non-fatal */ }
                        finally { setBusyId(null); }
                      }}
                      disabled={busyId === p.id}
                      className="rounded-xl border border-black/10 dark:border-white/10 px-3 py-2 text-xs font-medium text-stone-500 transition-colors hover:bg-black/[0.05] hover:text-red-500 disabled:opacity-50"
                      aria-label="Delete adventure"
                    >
                      {busyId === p.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-stone-400">Find it under “Stories” in this companion's chat.</p>
                  <PublishControl
                    visibility={p.visibility}
                    moderationStatus={p.moderationStatus}
                    moderationReason={p.moderationReason}
                    busy={pubBusyId === p.id}
                    onPublish={() => handlePublish(p)}
                    onUnpublish={() => handleUnpublish(p)}
                  />
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
    </>
  );
}
