import { useState, useEffect } from "react";
import { MapPin } from "lucide-react";

// ── Location data mirrored from server/inworld/locations.ts ──────────────────
// Kept in sync manually; the travel API validates slugs server-side.

export interface MapLocation {
  slug: string;
  name: string;
  shortName: string;
  type: "player_home" | "public" | "character_home";
  characterId?: string;
  affinityRequired?: number;
  mapX: number; // 0–1 fraction of SVG viewBox width
  mapY: number; // 0–1 fraction of SVG viewBox height
  zone: "player" | "arts" | "downtown" | "residential_n" | "residential_s";
}

const LOCATIONS: MapLocation[] = [
  { slug: "player_home",       name: "Your Place",            shortName: "Home",      type: "player_home", mapX: 0.12, mapY: 0.78, zone: "player" },
  { slug: "the_grind",         name: "The Grind Coffee Co.",  shortName: "Café",      type: "public",      mapX: 0.18, mapY: 0.42, zone: "arts" },
  { slug: "palette_paper",     name: "Palette & Paper",       shortName: "Art Store", type: "public",      mapX: 0.26, mapY: 0.54, zone: "arts" },
  { slug: "westside_commons",  name: "Westside Commons",      shortName: "Mall",      type: "public",      mapX: 0.50, mapY: 0.35, zone: "downtown" },
  { slug: "ember_theater",     name: "Ember Theater",         shortName: "Theater",   type: "public",      mapX: 0.60, mapY: 0.52, zone: "downtown" },
  // Character homes
  { slug: "mina_apt",      name: "Mina's Apartment",  shortName: "Mina",    type: "character_home", characterId: "mina",    affinityRequired: 25, mapX: 0.76, mapY: 0.18, zone: "residential_n" },
  { slug: "lin_studio",    name: "Lin's Studio",       shortName: "Lin",     type: "character_home", characterId: "lin",     affinityRequired: 25, mapX: 0.84, mapY: 0.28, zone: "residential_n" },
  { slug: "jordan_apt",    name: "Jordan's Apartment", shortName: "Jordan",  type: "character_home", characterId: "jordan",  affinityRequired: 25, mapX: 0.76, mapY: 0.38, zone: "residential_n" },
  { slug: "riot_place",    name: "Riot's Place",       shortName: "Riot",    type: "character_home", characterId: "riot",    affinityRequired: 25, mapX: 0.84, mapY: 0.48, zone: "residential_n" },
  { slug: "becca_place",   name: "Becca's Place",      shortName: "Becca",   type: "character_home", characterId: "becca",   affinityRequired: 25, mapX: 0.72, mapY: 0.58, zone: "residential_s" },
  { slug: "madison_condo", name: "Madison's Condo",    shortName: "Madison", type: "character_home", characterId: "madison", affinityRequired: 25, mapX: 0.80, mapY: 0.62, zone: "residential_s" },
  { slug: "serena_studio", name: "Serena's Studio",    shortName: "Serena",  type: "character_home", characterId: "serena",  affinityRequired: 25, mapX: 0.74, mapY: 0.74, zone: "residential_s" },
  { slug: "lexi_apt",      name: "Lexi's Apartment",   shortName: "Lexi",    type: "character_home", characterId: "lexi",    affinityRequired: 25, mapX: 0.84, mapY: 0.72, zone: "residential_s" },
  { slug: "iris_home",     name: "Iris's Home",        shortName: "Iris",    type: "character_home", characterId: "iris",    affinityRequired: 25, mapX: 0.72, mapY: 0.86, zone: "residential_s" },
  { slug: "ash_residence", name: "Ash's Residence",    shortName: "Ash",     type: "character_home", characterId: "ash",     affinityRequired: 25, mapX: 0.84, mapY: 0.88, zone: "residential_s" },
];

// ── Visual constants ──────────────────────────────────────────────────────────
const W = 440;
const H = 240;

const BLOCKS: [number, number, number, number][] = [
  [18, 60, 88, 120],
  [150, 30, 140, 70], [160, 115, 120, 65],
  [310, 10, 120, 220],
  [10, 160, 80, 68],
  [120, 80, 30, 80], [280, 60, 30, 130],
];

const ZONES: [number, number, number, number, string, string][] = [
  [8,   52,  112, 138, "arts",       "rgba(139,92,246,0.06)"],
  [142, 22,  164,  168, "downtown",  "rgba(59,130,246,0.05)"],
  [302, 6,   132, 228, "residential","rgba(236,72,153,0.05)"],
  [6,   152,  90,  84, "player",    "rgba(245,158,11,0.08)"],
];

const ZONE_LABELS: [number, number, string][] = [
  [64,   50, "ARTS"],
  [222,  20, "DOWNTOWN"],
  [368,  10, "RESIDENTIAL"],
  [51,  148, "HOME"],
];

/** Subtle topographic contour curves for map depth. */
const CONTOURS: string[] = [
  "M-10,95 Q80,75 160,90 T340,82 T450,98",
  "M-10,130 Q100,110 200,125 T420,118",
  "M-10,175 Q120,155 240,168 T450,160",
  "M-10,205 Q90,190 180,200 T360,195 T450,208",
];

interface MapTheme {
  bg: string;
  bgGradientInner: string;
  bgGradientOuter: string;
  gridMinor: string;
  gridMajor: string;
  blockFill: string;
  blockStroke: string;
  zoneLabels: string;
  affinityLabel: string;
  pinLabel: string;
  pinLabelLocked: string;
  travelingOverlay: string;
  travelingText: string;
  contour: string;
  zones: Record<string, string>;
  pinLocked: string;
}

const MAP_THEMES: Record<"light" | "dark", MapTheme> = {
  light: {
    bg: "#f1f0f8",
    bgGradientInner: "rgba(196,181,253,0.35)",
    bgGradientOuter: "rgba(241,240,248,0)",
    gridMinor: "#c8bfd9",
    gridMajor: "#a898c4",
    blockFill: "#e4dff0",
    blockStroke: "#c9bfd8",
    zoneLabels: "rgba(71,56,105,0.42)",
    affinityLabel: "rgba(190,24,93,0.55)",
    pinLabel: "#1e293b",
    pinLabelLocked: "rgba(71,85,105,0.65)",
    travelingOverlay: "rgba(241,240,248,0.82)",
    travelingText: "#334155",
    contour: "rgba(139,92,246,0.14)",
    zones: {
      arts: "rgba(124,58,237,0.14)",
      downtown: "rgba(37,99,235,0.12)",
      residential: "rgba(219,39,119,0.12)",
      player: "rgba(217,119,6,0.16)",
    },
    pinLocked: "#64748b",
  },
  dark: {
    bg: "#13111c",
    bgGradientInner: "rgba(139,92,246,0.12)",
    bgGradientOuter: "rgba(19,17,28,0)",
    gridMinor: "#1e1a2e",
    gridMajor: "#2a2540",
    blockFill: "#1e1a30",
    blockStroke: "#252038",
    zoneLabels: "rgba(255,255,255,0.08)",
    affinityLabel: "rgba(236,72,153,0.25)",
    pinLabel: "rgba(255,255,255,0.7)",
    pinLabelLocked: "rgba(156,163,175,0.5)",
    travelingOverlay: "rgba(0,0,0,0.5)",
    travelingText: "white",
    contour: "rgba(139,92,246,0.07)",
    zones: {
      arts: "rgba(139,92,246,0.06)",
      downtown: "rgba(59,130,246,0.05)",
      residential: "rgba(236,72,153,0.05)",
      player: "rgba(245,158,11,0.08)",
    },
    pinLocked: "#4b5563",
  },
};

function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

function pinColor(loc: MapLocation, isActive: boolean, isLocked: boolean, theme: MapTheme): string {
  if (isLocked) return theme.pinLocked;
  if (isActive) return "#d97706";
  if (loc.type === "player_home") return "#d97706";
  if (loc.type === "public") return "#7c3aed";
  return "#db2777";
}

function pinGlow(loc: MapLocation, isActive: boolean, isLocked: boolean): string {
  if (isActive) return "rgba(217,119,6,0.45)";
  if (isLocked) return "none";
  if (loc.type === "player_home") return "rgba(217,119,6,0.25)";
  if (loc.type === "public") return "rgba(124,58,237,0.28)";
  return "rgba(219,39,119,0.28)";
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  characterId: string;
  currentLocation: string | null;
  currentAffinity: number;
  onTravel: (slug: string) => void;
  isTraveling?: boolean;
}

export default function CityMap({
  characterId,
  currentLocation,
  currentAffinity,
  onTravel,
  isTraveling = false,
}: Props) {
  const [tooltip, setTooltip] = useState<{ slug: string; x: number; y: number } | null>(null);
  const isDark = useIsDarkMode();
  const theme = MAP_THEMES[isDark ? "dark" : "light"];

  const activeSlug = currentLocation ?? "player_home";

  const visibleLocations = LOCATIONS.filter(
    (l) => l.type !== "character_home" || l.characterId === characterId,
  );

  function isLocked(loc: MapLocation): boolean {
    return (
      loc.type === "character_home" &&
      typeof loc.affinityRequired === "number" &&
      currentAffinity < loc.affinityRequired
    );
  }

  function handlePinClick(loc: MapLocation) {
    if (isTraveling) return;
    if (isLocked(loc)) return;
    if (loc.slug === activeSlug) return;
    onTravel(loc.slug);
  }

  return (
    <div className="relative select-none overflow-hidden rounded-2xl border border-black/10 bg-white/50 shadow-[0_8px_32px_rgba(0,0,0,0.06)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/[0.08] dark:bg-white/[0.04] dark:shadow-[0_8px_32px_rgba(0,0,0,0.18)]">
      {/* Header — glass strip */}
      <div className="flex items-center justify-between border-b border-black/[0.06] bg-white/60 px-3 py-2 backdrop-blur-xl dark:border-white/[0.06] dark:bg-white/[0.04]">
        <div className="flex items-center gap-1.5">
          <MapPin size={13} className="text-violet-600 dark:text-violet-400" />
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-700 dark:text-stone-300">
            City Map
          </span>
        </div>
        <span className="text-[10px] font-medium text-stone-500 dark:text-stone-400">
          {LOCATIONS.find((l) => l.slug === activeSlug)?.name ?? "Home"}
        </span>
      </div>

      {/* SVG Map */}
      <div className="relative overflow-hidden bg-slate-100 dark:bg-[#13111c]">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: "auto", aspectRatio: `${W}/${H}` }}
          aria-label="City map"
        >
          <defs>
            <radialGradient id="mapBgGlow" cx="50%" cy="40%" r="70%">
              <stop offset="0%" stopColor={theme.bgGradientInner} />
              <stop offset="100%" stopColor={theme.bgGradientOuter} />
            </radialGradient>
            <pattern id="mapFineGrid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path
                d="M 20 0 L 0 0 0 20"
                fill="none"
                stroke={theme.gridMinor}
                strokeWidth={0.35}
                opacity={isDark ? 0.6 : 0.85}
              />
            </pattern>
          </defs>

          {/* Base + radial depth */}
          <rect width={W} height={H} fill={theme.bg} />
          <rect width={W} height={H} fill="url(#mapBgGlow)" />
          <rect width={W} height={H} fill="url(#mapFineGrid)" />

          {/* Major street grid */}
          {[40, 80, 120, 160, 200].map((y) => (
            <line key={`hy${y}`} x1={0} y1={y} x2={W} y2={y} stroke={theme.gridMajor} strokeWidth={isDark ? 0.5 : 0.75} />
          ))}
          {[60, 120, 180, 240, 300, 360].map((x) => (
            <line key={`vx${x}`} x1={x} y1={0} x2={x} y2={H} stroke={theme.gridMajor} strokeWidth={isDark ? 0.5 : 0.75} />
          ))}

          {/* Topographic contour lines */}
          {CONTOURS.map((d, i) => (
            <path
              key={`contour-${i}`}
              d={d}
              fill="none"
              stroke={theme.contour}
              strokeWidth={isDark ? 0.6 : 0.9}
            />
          ))}

          {/* Zone fills */}
          {ZONES.map(([x, y, w, h, zoneKey, darkFill], i) => (
            <rect
              key={i}
              x={x}
              y={y}
              width={w}
              height={h}
              fill={isDark ? darkFill : theme.zones[zoneKey]}
              rx={4}
            />
          ))}

          {/* City blocks */}
          {BLOCKS.map(([x, y, w, h], i) => (
            <rect
              key={i}
              x={x}
              y={y}
              width={w}
              height={h}
              fill={theme.blockFill}
              stroke={theme.blockStroke}
              strokeWidth={isDark ? 0 : 0.5}
              rx={3}
            />
          ))}

          {/* Zone labels */}
          {ZONE_LABELS.map(([x, y, text], i) => (
            <text
              key={i}
              x={x}
              y={y}
              textAnchor="middle"
              fill={theme.zoneLabels}
              fontSize={7}
              fontFamily="monospace"
              letterSpacing={2}
              fontWeight="bold"
            >
              {text}
            </text>
          ))}

          <text
            x={368}
            y={H - 4}
            textAnchor="middle"
            fill={theme.affinityLabel}
            fontSize={6}
            fontFamily="monospace"
          >
            UNLOCK AT 25 AFFINITY
          </text>

          {/* Pins */}
          {visibleLocations.map((loc) => {
            const cx = loc.mapX * W;
            const cy = loc.mapY * H;
            const active = loc.slug === activeSlug;
            const locked = isLocked(loc);
            const color = pinColor(loc, active, locked, theme);
            const glow = pinGlow(loc, active, locked);
            const hovering = tooltip?.slug === loc.slug;

            return (
              <g
                key={loc.slug}
                transform={`translate(${cx}, ${cy})`}
                style={{ cursor: locked || loc.slug === activeSlug || isTraveling ? "default" : "pointer" }}
                onClick={() => handlePinClick(loc)}
                onMouseEnter={() => setTooltip({ slug: loc.slug, x: cx, y: cy })}
                onMouseLeave={() => setTooltip(null)}
                aria-label={loc.name}
              >
                {active && (
                  <circle r={11} fill="none" stroke={color} strokeWidth={isDark ? 1.5 : 2} opacity={0.55}>
                    <animate attributeName="r" values="9;13;9" dur="2.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.55;0.2;0.55" dur="2.5s" repeatCount="indefinite" />
                  </circle>
                )}

                {hovering && !locked && !active && <circle r={10} fill={glow} />}

                <circle
                  r={active ? 6 : 5}
                  fill={color}
                  stroke={isDark ? "none" : "white"}
                  strokeWidth={isDark ? 0 : 1.25}
                  opacity={locked ? 0.45 : 1}
                />

                {locked && (
                  <text x={0} y={2} textAnchor="middle" fontSize={5} fill={isDark ? "#9ca3af" : "#475569"}>
                    🔒
                  </text>
                )}

                <text
                  x={0}
                  y={active ? 14 : 13}
                  textAnchor="middle"
                  fontSize={active ? 7 : 6}
                  fontFamily="system-ui, sans-serif"
                  fontWeight={active ? "700" : "600"}
                  fill={
                    locked
                      ? theme.pinLabelLocked
                      : active
                        ? color
                        : theme.pinLabel
                  }
                >
                  {loc.shortName}
                </text>
              </g>
            );
          })}

          {isTraveling && (
            <g>
              <rect width={W} height={H} fill={theme.travelingOverlay} />
              <text
                x={W / 2}
                y={H / 2 - 6}
                textAnchor="middle"
                fill={theme.travelingText}
                fontSize={11}
                fontFamily="system-ui"
                fontWeight={600}
              >
                Traveling…
              </text>
            </g>
          )}
        </svg>

        {/* Tooltip — glassmorphism */}
        {tooltip && (() => {
          const loc = LOCATIONS.find((l) => l.slug === tooltip.slug);
          if (!loc) return null;
          const locked = isLocked(loc);
          const active = loc.slug === activeSlug;
          const pxX = (tooltip.x / W) * 100;
          const pxY = (tooltip.y / H) * 100;
          return (
            <div
              className="pointer-events-none absolute z-10 min-w-[110px] rounded-xl border border-black/10 bg-white/85 px-2.5 py-1.5 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-stone-900/85"
              style={{
                left: `${Math.min(pxX, 72)}%`,
                top: `${Math.max(pxY - 16, 2)}%`,
                transform: "translate(-50%, -100%)",
              }}
            >
              <p className="text-xs font-semibold leading-tight text-stone-800 dark:text-white">{loc.name}</p>
              {active && (
                <p className="mt-0.5 text-[10px] text-amber-600 dark:text-amber-400">You&apos;re here</p>
              )}
              {locked && (
                <p className="mt-0.5 text-[10px] text-rose-600 dark:text-rose-400">
                  Requires {loc.affinityRequired} affinity ({Math.round(currentAffinity)} now)
                </p>
              )}
              {!active && !locked && (
                <p className="mt-0.5 text-[10px] text-stone-500 dark:text-stone-400">Click to travel</p>
              )}
            </div>
          );
        })()}
      </div>

      {/* Legend — glass strip */}
      <div className="flex items-center gap-3 border-t border-black/[0.06] bg-white/60 px-3 py-1.5 backdrop-blur-xl dark:border-white/[0.06] dark:bg-white/[0.04]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500 shadow-sm ring-1 ring-amber-600/30" />
          <span className="text-[10px] font-medium text-stone-600 dark:text-stone-400">Home</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-violet-600 shadow-sm ring-1 ring-violet-700/30" />
          <span className="text-[10px] font-medium text-stone-600 dark:text-stone-400">Public</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-pink-600 shadow-sm ring-1 ring-pink-700/30" />
          <span className="text-[10px] font-medium text-stone-600 dark:text-stone-400">Private</span>
        </span>
      </div>
    </div>
  );
}
