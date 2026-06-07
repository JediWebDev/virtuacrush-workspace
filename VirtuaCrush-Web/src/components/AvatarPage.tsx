import { useEffect, useState } from "react";
import { Shirt, Plus, Trash2, Check } from "lucide-react";
import * as api from "../lib/profile";

const CATEGORIES: api.ItemCategory[] = ["top", "bottom", "outerwear", "dress", "shoes", "accessory", "other"];
const csv = (arr: string[]) => arr.join(", ");
const parseCsv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export default function AvatarPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<api.FullProfile | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [niName, setNiName] = useState("");
  const [niCat, setNiCat] = useState<api.ItemCategory>("top");
  const [niTags, setNiTags] = useState("");
  const [presetName, setPresetName] = useState("");

  const load = () => {
    setLoading(true);
    setErr(null);
    api.fetchProfile().then(setData).catch(() => setErr("Couldn't reach the server — it may still be starting up.")).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  if (loading) return <div className="mx-auto max-w-3xl px-6 py-16 text-stone-500">Loading your profile…</div>;
  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <p className="mb-4 text-stone-500">{err ?? "No profile."}</p>
        <button type="button" onClick={load} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-deep">Retry</button>
      </div>
    );
  }

  const { profile, presentation, inventory, presets } = data;
  const set = (patch: Partial<api.FullProfile>) => setData({ ...data, ...patch });
  const setProfile = (p: Partial<api.FullProfile["profile"]>) => set({ profile: { ...profile, ...p } });
  const setAppearance = (p: Partial<api.Appearance>) => setProfile({ appearance: { ...profile.appearance, ...p } });
  const setBio = (p: Partial<api.Biography>) => setProfile({ biography: { ...profile.biography, ...p } });
  const setGrooming = (p: Partial<api.Grooming>) =>
    set({ presentation: { ...presentation, grooming: { ...presentation.grooming, ...p } } });

  const worn = new Set(presentation.wornItemIds);
  const toggleWorn = (id: string) => {
    const next = new Set(worn);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set({ presentation: { ...presentation, wornItemIds: [...next] } });
  };

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const updated = await api.saveProfile({
        displayName: profile.displayName,
        appearance: profile.appearance,
        biography: profile.biography,
        grooming: presentation.grooming,
        wornItemIds: presentation.wornItemIds,
        presets,
      });
      setData(updated);
    } catch {
      setErr("Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const addItem = async () => {
    if (!niName.trim()) return;
    try {
      const { item } = await api.addItem({ name: niName.trim(), category: niCat, styleTags: parseCsv(niTags) });
      set({ inventory: [...inventory, item] });
      setNiName("");
      setNiTags("");
    } catch {
      setErr("Couldn't add item.");
    }
  };
  const removeItem = async (id: string) => {
    try {
      await api.deleteItem(id);
      set({
        inventory: inventory.filter((i) => i.id !== id),
        presentation: { ...presentation, wornItemIds: presentation.wornItemIds.filter((x) => x !== id) },
      });
    } catch {
      setErr("Couldn't delete item.");
    }
  };

  const savePreset = () => {
    if (!presetName.trim()) return;
    set({ presets: [...presets, { name: presetName.trim(), wornItemIds: [...presentation.wornItemIds] }] });
    setPresetName("");
  };
  const applyPreset = (p: api.OutfitPreset) => set({ presentation: { ...presentation, wornItemIds: [...p.wornItemIds] } });
  const removePreset = (name: string) => set({ presets: presets.filter((p) => p.name !== name) });

  const input = "w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04] px-3 py-2 text-sm text-stone-800 dark:text-stone-100 outline-none focus:border-accent/40";
  const label = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-stone-500";
  const card = "mb-5 rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02] p-5";
  const h = "mb-4 font-serif text-xl font-bold text-stone-900 dark:text-stone-50";

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white"><Shirt size={20} /></div>
        <h1 className="font-serif text-3xl font-bold text-stone-900 dark:text-stone-50">Your Avatar</h1>
      </div>
      <p className="mb-8 text-sm text-stone-500">
        This is how the world sees you. Characters only know what you share or what they see in person — change your
        outfit anytime; they'll notice the next time you meet.
      </p>

      <section className={card}>
        <h2 className={h}>Identity</h2>
        <div className="mb-4"><label className={label}>Display name</label>
          <input className={input} value={profile.displayName} onChange={(e) => setProfile({ displayName: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(["age", "height", "build", "hair", "eyes", "features"] as const).map((k) => (
            <div key={k}><label className={label}>{k}</label>
              <input className={input} value={profile.appearance[k] ?? ""} onChange={(e) => setAppearance({ [k]: e.target.value } as Partial<api.Appearance>)} /></div>
          ))}
        </div>
      </section>

      <section className={card}>
        <h2 className={h}>About you</h2>
        <p className="-mt-2 mb-3 text-xs text-stone-500">Comma-separated. Characters learn these as you share them.</p>
        {(["interests", "hobbies", "goals", "fears", "values"] as const).map((k) => (
          <div key={k} className="mb-3"><label className={label}>{k}</label>
            <input className={input} value={csv(profile.biography[k])} onChange={(e) => setBio({ [k]: parseCsv(e.target.value) } as Partial<api.Biography>)} /></div>
        ))}
      </section>

      <section className={card}>
        <h2 className={h}>Grooming</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(["hairstyle", "makeup", "fragrance"] as const).map((k) => (
            <div key={k}><label className={label}>{k}</label>
              <input className={input} value={presentation.grooming[k] ?? ""} onChange={(e) => setGrooming({ [k]: e.target.value } as Partial<api.Grooming>)} /></div>
          ))}
        </div>
      </section>

      <section className={card}>
        <h2 className={h}>Wardrobe</h2>
        <p className="-mt-2 mb-3 text-xs text-stone-500">Check what you're wearing now. Style tags shape how each character reacts.</p>
        <div className="mb-4 space-y-2">
          {inventory.length === 0 && <p className="text-sm text-stone-500">No items yet — add some below.</p>}
          {inventory.map((it) => (
            <div key={it.id} className="flex items-center gap-3 rounded-xl border border-black/[0.06] dark:border-white/[0.06] px-3 py-2">
              <button type="button" onClick={() => toggleWorn(it.id)} aria-label="Toggle worn"
                className={"flex h-6 w-6 items-center justify-center rounded-md border " + (worn.has(it.id) ? "border-accent bg-accent text-white" : "border-black/20 dark:border-white/20")}>
                {worn.has(it.id) && <Check size={14} />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">{it.name}</div>
                <div className="truncate text-[11px] text-stone-500">{it.category}{it.styleTags.length ? " · " + it.styleTags.join(", ") : ""}</div>
              </div>
              <button type="button" onClick={() => removeItem(it.id)} className="text-stone-400 hover:text-red-500" aria-label="Delete item"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-black/10 dark:border-white/10 p-3">
          <div className="min-w-[140px] flex-1"><label className={label}>Item name</label>
            <input className={input} value={niName} onChange={(e) => setNiName(e.target.value)} placeholder="Black Leather Jacket" /></div>
          <div><label className={label}>Category</label>
            <select className={input} value={niCat} onChange={(e) => setNiCat(e.target.value as api.ItemCategory)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select></div>
          <div className="min-w-[140px] flex-1"><label className={label}>Style tags</label>
            <input className={input} value={niTags} onChange={(e) => setNiTags(e.target.value)} placeholder="alternative, rock, edgy" /></div>
          <button type="button" onClick={addItem} className="flex items-center gap-1 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-deep"><Plus size={16} /> Add</button>
        </div>
      </section>

      <section className={card}>
        <h2 className={h}>Outfit presets</h2>
        <div className="mb-3 space-y-2">
          {presets.length === 0 && <p className="text-sm text-stone-500">Save your current outfit as a preset to switch quickly.</p>}
          {presets.map((p) => (
            <div key={p.name} className="flex items-center gap-3 rounded-xl border border-black/[0.06] dark:border-white/[0.06] px-3 py-2">
              <div className="min-w-0 flex-1 truncate text-sm font-medium text-stone-800 dark:text-stone-100">{p.name}
                <span className="ml-2 text-[11px] text-stone-500">{p.wornItemIds.length} items</span></div>
              <button type="button" onClick={() => applyPreset(p)} className="rounded-lg border border-accent/30 px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent/10">Apply</button>
              <button type="button" onClick={() => removePreset(p.name)} className="text-stone-400 hover:text-red-500" aria-label="Delete preset"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1"><label className={label}>New preset from current outfit</label>
            <input className={input} value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Date Night Outfit" /></div>
          <button type="button" onClick={savePreset} className="rounded-xl border border-black/10 dark:border-white/10 px-4 py-2 text-sm font-semibold text-stone-700 dark:text-stone-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">Save preset</button>
        </div>
      </section>

      <div className="sticky bottom-4 flex items-center justify-end gap-3">
        {err && <span className="text-sm text-red-500">{err}</span>}
        <button type="button" onClick={save} disabled={saving} className="rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/25 hover:bg-accent-deep disabled:opacity-60">{saving ? "Saving…" : "Save profile"}</button>
      </div>
    </div>
  );
}
