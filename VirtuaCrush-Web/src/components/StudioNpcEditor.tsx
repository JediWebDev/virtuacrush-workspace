/** Shared NPC row editor for Story Studio arcs and adventures. */
import { Plus, Trash2, Users } from "lucide-react";
import type { StudioNpcStance, StudioVocabulary } from "../lib/api";
import { emptyStudioNpcDraft, type StudioNpcDraft } from "../lib/studioNpc";
import { StudioFieldHint } from "./StudioGuide";
import { studioInputClass, studioLabelClass, studioSelectClass } from "./studioFormStyles";

const STANCE_STYLE: Record<StudioNpcStance, string> = {
  friend: "border-emerald-400/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  enemy: "border-red-400/40 bg-red-500/10 text-red-700 dark:text-red-300",
  bystander: "border-yellow-400/35 bg-yellow-500/10 text-yellow-800 dark:text-yellow-200",
};

type NpcVocabulary = StudioVocabulary["npcs"];

export default function StudioNpcEditor({
  npcs,
  onChange,
  vocabulary,
  disabled,
  max = 8,
}: {
  npcs: StudioNpcDraft[];
  onChange: (next: StudioNpcDraft[]) => void;
  vocabulary: NpcVocabulary | null | undefined;
  disabled?: boolean;
  max?: number;
}) {
  const archetypes = vocabulary?.archetypes ?? [];
  const roles = vocabulary?.bystanderRoles ?? [];

  const patch = (idx: number, patch: Partial<StudioNpcDraft>) => {
    onChange(npcs.map((n, i) => (i === idx ? { ...n, ...patch } : n)));
  };

  const addNpc = () => {
    if (npcs.length >= max || disabled) return;
    onChange([...npcs, emptyStudioNpcDraft()]);
  };

  const removeNpc = (idx: number) => {
    onChange(npcs.filter((_, i) => i !== idx));
  };

  const applyArchetype = (idx: number, archetypeId: string) => {
    const arch = archetypes.find((a) => a.id === archetypeId);
    if (!arch) {
      patch(idx, { archetypeId: "" });
      return;
    }
    const current = npcs[idx]!;
    patch(idx, {
      archetypeId: arch.id,
      stance: arch.stance,
      roleId: arch.roleId ?? (arch.stance === "bystander" ? current.roleId : ""),
      description: current.description.trim() ? current.description : arch.brief,
      name: current.name.trim() ? current.name : arch.label.split(" ")[0] ?? current.name,
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={`${studioLabelClass} flex items-center gap-1.5`}>
            <Users size={14} className="text-accent" /> Scene NPCs
          </p>
          <StudioFieldHint>
            Optional friends, enemies, or bystanders (waiter, barista, security, etc.) voiced in tagged lines during the story.
          </StudioFieldHint>
        </div>
        <button
          type="button"
          disabled={disabled || npcs.length >= max}
          onClick={addNpc}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/15 disabled:opacity-50"
        >
          <Plus size={13} /> Add NPC
        </button>
      </div>

      {npcs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300/80 bg-white/40 px-3 py-4 text-xs text-stone-500 dark:border-stone-600 dark:bg-stone-900/20">
          No NPCs yet — add a rival, the companion&apos;s friend, or venue staff like a bartender or security guard.
        </p>
      ) : (
        <ul className="space-y-3">
          {npcs.map((n, idx) => {
            const filteredArchetypes = archetypes.filter((a) => a.stance === n.stance);
            return (
              <li
                key={idx}
                className="rounded-2xl border border-black/10 bg-white/50 p-3 dark:border-white/10 dark:bg-stone-900/25"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STANCE_STYLE[n.stance]}`}>
                    {n.stance}
                  </span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => removeNpc(idx)}
                    className="text-stone-400 transition-colors hover:text-red-500"
                    aria-label="Remove NPC"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  <div>
                    <label className={studioLabelClass}>Name</label>
                    <input
                      className={studioInputClass}
                      value={n.name}
                      disabled={disabled}
                      onChange={(e) => patch(idx, { name: e.target.value })}
                      placeholder="Urik, Maya, the bartender…"
                    />
                  </div>
                  <div>
                    <label className={studioLabelClass}>Stance</label>
                    <select
                      className={studioSelectClass}
                      value={n.stance}
                      disabled={disabled}
                      onChange={(e) => {
                        const stance = e.target.value as StudioNpcStance;
                        patch(idx, {
                          stance,
                          archetypeId: "",
                          roleId: stance === "bystander" ? n.roleId : "",
                        });
                      }}
                    >
                      {(vocabulary?.stances ?? [
                        { id: "friend", label: "Friend" },
                        { id: "enemy", label: "Enemy" },
                        { id: "bystander", label: "Bystander" },
                      ]).map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div>
                    <label className={studioLabelClass}>Archetype</label>
                    <select
                      className={studioSelectClass}
                      value={n.archetypeId}
                      disabled={disabled}
                      onChange={(e) => applyArchetype(idx, e.target.value)}
                    >
                      <option value="">Custom / none</option>
                      {filteredArchetypes.map((a) => (
                        <option key={a.id} value={a.id}>{a.label}</option>
                      ))}
                    </select>
                  </div>
                  {n.stance === "bystander" && (
                    <div>
                      <label className={studioLabelClass}>Venue role</label>
                      <select
                        className={studioSelectClass}
                        value={n.roleId}
                        disabled={disabled}
                        onChange={(e) => patch(idx, { roleId: e.target.value })}
                      >
                        <option value="">Any / unspecified</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="mt-2">
                  <label className={studioLabelClass}>Behavior</label>
                  <textarea
                    className={studioInputClass}
                    rows={2}
                    disabled={disabled}
                    value={n.description}
                    onChange={(e) => patch(idx, { description: e.target.value })}
                    placeholder="How they act, what they want, and how the companion should react to them."
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
