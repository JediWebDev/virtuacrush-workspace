// Player achievements, grouped by companion, with a generated share-image card.
import { useEffect, useMemo, useState } from "react";
import { Trophy, Heart, KeyRound, Sparkles, Star, Share2, Loader2 } from "lucide-react";
import { fetchAchievements, type Achievement, type AchievementKind } from "../lib/api";
import { CHARACTERS } from "../types/character";

const KIND_META: Record<AchievementKind, { label: string; Icon: typeof Trophy }> = {
  arc: { label: "Story", Icon: Sparkles },
  affinity: { label: "Milestone", Icon: Heart },
  secret: { label: "Secret", Icon: KeyRound },
  beat: { label: "Moment", Icon: Star },
};

// Share-card gradient by tone.
const TONE_COLORS: Record<string, [string, string]> = {
  romantic: ["#f72585", "#7209b7"],
  dramatic: ["#3a0ca3", "#111827"],
  serious: ["#1f2937", "#374151"],
  light: ["#4361ee", "#4cc9f0"],
  default: ["#4361ee", "#7209b7"],
};

function companionName(characterId: string): string {
  return CHARACTERS.find((c) => c.id === characterId)?.name ?? characterId;
}
function companionImage(characterId: string): string | null {
  return CHARACTERS.find((c) => c.id === characterId)?.image ?? null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Word-wrap helper for canvas text. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Renders the achievement to a 1080×1080 PNG and shares (native) or downloads it. */
async function shareAchievement(ach: Achievement): Promise<void> {
  const W = 1080;
  const H = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const [c0, c1] = TONE_COLORS[ach.tone ?? "default"] ?? TONE_COLORS.default;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Inner translucent panel.
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(80, 80, W - 160, H - 160);

  ctx.textAlign = "center";

  // Trophy mark.
  ctx.font = "150px serif";
  ctx.fillText("🏆", W / 2, 320);

  // Eyebrow.
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "bold 34px system-ui, sans-serif";
  ctx.fillText("MOMENT UNLOCKED", W / 2, 410);

  // Title (wrapped).
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 76px Georgia, serif";
  const titleLines = wrapText(ctx, ach.title, W - 280);
  let y = 520;
  for (const line of titleLines) {
    ctx.fillText(line, W / 2, y);
    y += 90;
  }

  // Description (wrapped).
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "40px system-ui, sans-serif";
  y += 20;
  for (const line of wrapText(ctx, ach.description, W - 320)) {
    ctx.fillText(line, W / 2, y);
    y += 56;
  }

  // Companion + brand footer.
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "bold 44px system-ui, sans-serif";
  ctx.fillText(`with ${companionName(ach.characterId)}`, W / 2, H - 180);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "32px system-ui, sans-serif";
  ctx.fillText("VirtuaCrush", W / 2, H - 120);

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return;

  const file = new File([blob], `virtuacrush-${ach.key.replace(/[^a-z0-9]+/gi, "_")}.png`, { type: "image/png" });
  const shareText = `${ach.title} — with ${companionName(ach.characterId)} · VirtuaCrush`;

  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: ach.title, text: shareText });
      return;
    } catch {
      /* user cancelled or share failed — fall through to download */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AchievementsPanel() {
  const [achievements, setAchievements] = useState<Achievement[] | null>(null);
  const [error, setError] = useState(false);
  const [sharingKey, setSharingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAchievements()
      .then((r) => { if (!cancelled) setAchievements(r.achievements); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);

  const groups = useMemo(() => {
    const m = new Map<string, Achievement[]>();
    for (const a of achievements ?? []) {
      const arr = m.get(a.characterId) ?? [];
      arr.push(a);
      m.set(a.characterId, arr);
    }
    return Array.from(m.entries());
  }, [achievements]);

  const handleShare = async (ach: Achievement) => {
    setSharingKey(`${ach.characterId}:${ach.key}`);
    try { await shareAchievement(ach); } finally { setSharingKey(null); }
  };

  if (error) {
    return <p className="text-sm text-stone-500 dark:text-stone-400">Couldn't load achievements right now.</p>;
  }
  if (achievements === null) {
    return (
      <p className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
        <Loader2 size={16} className="animate-spin" /> Loading achievements…
      </p>
    );
  }
  if (achievements.length === 0) {
    return (
      <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] px-5 py-8 text-center">
        <Trophy size={24} className="mx-auto mb-2 text-stone-400" />
        <p className="text-sm font-medium text-stone-700 dark:text-stone-200">No achievements yet</p>
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
          Chat with your companions, complete story arcs, and grow closer to start earning moments.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {groups.map(([characterId, items]) => {
        const img = companionImage(characterId);
        return (
          <div key={characterId}>
            <div className="mb-3 flex items-center gap-2.5">
              {img ? (
                <img src={img} alt="" className="h-8 w-8 rounded-full object-cover object-top ring-1 ring-black/10 dark:ring-white/10" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">
                  {companionName(characterId).trim()[0]?.toUpperCase() ?? "?"}
                </div>
              )}
              <h4 className="font-serif text-lg font-semibold text-stone-900 dark:text-stone-50">
                {companionName(characterId)}
              </h4>
              <span className="rounded-full bg-black/[0.05] dark:bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-stone-500 dark:text-stone-400">
                {items.length}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {items.map((ach) => {
                const meta = KIND_META[ach.kind] ?? KIND_META.beat;
                const { Icon } = meta;
                const busy = sharingKey === `${ach.characterId}:${ach.key}`;
                return (
                  <div
                    key={`${ach.characterId}:${ach.key}`}
                    className="group relative flex gap-3 rounded-2xl border border-black/[0.07] dark:border-white/[0.08] bg-white/60 dark:bg-white/[0.03] p-3.5 shadow-sm"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/20 text-amber-700 dark:text-amber-300">
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent/90">{meta.label}</span>
                        <span className="text-[10px] text-stone-400">{formatDate(ach.earnedAt)}</span>
                      </div>
                      <p className="mt-0.5 truncate font-semibold text-stone-900 dark:text-stone-50">{ach.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-stone-600 dark:text-stone-400">{ach.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleShare(ach)}
                      disabled={busy}
                      aria-label="Share achievement"
                      title="Share as image"
                      className="absolute right-2.5 top-2.5 rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-black/[0.06] hover:text-accent disabled:opacity-50 dark:hover:bg-white/[0.06]"
                    >
                      {busy ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
