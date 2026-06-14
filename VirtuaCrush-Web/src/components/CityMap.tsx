import React, { useState } from "react";
import { Lock, MapPin, Home, Coffee, ShoppingBag, Film, Palette } from "lucide-react";

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

// City block rectangles [x, y, w, h]
const BLOCKS: [number, number, number, number][] = [
  // Arts district
  [18, 60, 88, 120],
  // Downtown blocks
  [150, 30, 140, 70], [160, 115, 120, 65],
  // Residential zone
  [310, 10, 120, 220],
  // Player home zone
  [10, 160, 80, 68],
  // Mid connectors
  [120, 80, 30, 80], [280, 60, 30, 130],
];

// Zone background fills [x, y, w, h, fill]
const ZONES: [number, number, number, number, string][] = [
  [8,   52,  112, 138, "rgba(139,92,246,0.06)"],   // arts — violet tint
  [142, 22,  164,  168, "rgba(59,130,246,0.05)"],  // downtown — blue tint
  [302, 6,   132, 228, "rgba(236,72,153,0.05)"],   // residential — pink tint
  [6,   152,  90,  84, "rgba(245,158,11,0.08)"],   // player home — amber tint
];

// Zone labels [x, y, text]
const ZONE_LABELS: [number, number, string][] = [
  [64,   50, "ARTS"],
  [222,  20, "DOWNTOWN"],
  [368,  10, "RESIDENTIAL"],
  [51,  148, "HOME"],
];

// Pin color by type/state
function pinColor(loc: MapLocation, isActive: boolean, isLocked: boolean): string {
  if (isActive) return "#f59e0b";      // amber — current location
  if (isLocked) return "#4b5563";      // dark gray — locked
  if (loc.type === "player_home") return "#f59e0b"; // amber
  if (loc.type === "public") return "#8b5cf6";       // violet
  return "#ec4899";                                   // pink — character home
}

function pinGlow(loc: MapLocation, isActive: boolean, isLocked: boolean): string {
  if (isActive) return "rgba(245,158,11,0.4)";
  if (isLocked) return "none";
  if (loc.type === "player_home") return "rgba(245,158,11,0.2)";
  if (loc.type === "public") return "rgba(139,92,246,0.2)";
  return "rgba(236,72,153,0.2)";
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  /** The character whose conversation context this map is in. */
  characterId: string;
  /** Player's current location slug (null = player_home). */
  currentLocation: string | null;
  /** Player's current affinity with this character (0–100). */
  currentAffinity: number;
  /** Called when a pin is clicked (passes the slug). */
  onTravel: (slug: string) => void;
  /** Show a spinner overlay while a travel request is in flight. */
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

  const activeSlug = currentLocation ?? "player_home";

  // Only show the active character's home + all public + player_home
  const visibleLocations = LOCATIONS.filter(
    (l) => l.type !== "character_home" || l.characterId === characterId
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
    <div className="relative select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-black/[0.06] dark:border-white/[0.06]">
        <div className="flex items-center gap-1.5">
          <MapPin size={13} className="text-violet-500 dark:text-violet-400" />
          <span className="text-xs font-semibold text-stone-600 dark:text-stone-300 tracking-wide uppercase">City Map</span>
        </div>
        <span className="text-[10px] text-stone-400 dark:text-stone-500">
          {LOCATIONS.find((l) => l.slug === activeSlug)?.name ?? "Home"}
        </span>
      </div>

      {/* SVG Map */}
      <div className="relative overflow-hidden">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: "auto", aspectRatio: `${W}/${H}` }}
          aria-label="City map"
        >
          {/* Background */}
          <rect width={W} height={H} fill="#13111c" />

          {/* Street grid */}
          {[40, 80, 120, 160, 200].map((y) => (
            <line key={`hy${y}`} x1={0} y1={y} x2={W} y2={y} stroke="#1e1a2e" strokeWidth={0.5} />
          ))}
          {[60, 120, 180, 240, 300, 360].map((x) => (
            <line key={`vx${x}`} x1={x} y1={0} x2={x} y2={H} stroke="#1e1a2e" strokeWidth={0.5} />
          ))}

          {/* Zone fills */}
          {ZONES.map(([x, y, w, h, fill], i) => (
            <rect key={i} x={x} y={y} width={w} height={h} fill={fill} rx={4} />
          ))}

          {/* City blocks */}
          {BLOCKS.map(([x, y, w, h], i) => (
            <rect key={i} x={x} y={y} width={w} height={h} fill="#1e1a30" rx={3} />
          ))}

          {/* Zone labels */}
          {ZONE_LABELS.map(([x, y, text], i) => (
            <text
              key={i}
              x={x} y={y}
              textAnchor="middle"
              fill="rgba(255,255,255,0.08)"
              fontSize={7}
              fontFamily="monospace"
              letterSpacing={2}
              fontWeight="bold"
            >
              {text}
            </text>
          ))}

          {/* Affinity gate label */}
          <text x={368} y={H - 4} textAnchor="middle" fill="rgba(236,72,153,0.25)" fontSize={6} fontFamily="monospace">
            UNLOCK AT 25 AFFINITY
          </text>

          {/* Pins */}
          {visibleLocations.map((loc) => {
            const cx = loc.mapX * W;
            const cy = loc.mapY * H;
            const active = loc.slug === activeSlug;
            const locked = isLocked(loc);
            const color = pinColor(loc, active, locked);
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
                {/* Glow ring for active */}
                {active && (
                  <circle r={11} fill="none" stroke={color} strokeWidth={1.5} opacity={0.5}>
                    <animate attributeName="r" values="9;13;9" dur="2.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.5;0.15;0.5" dur="2.5s" repeatCount="indefinite" />
                  </circle>
                )}

                {/* Hover glow */}
                {hovering && !locked && !active && (
                  <circle r={10} fill={glow} />
                )}

                {/* Pin body */}
                <circle r={active ? 6 : 5} fill={color} opacity={locked ? 0.35 : 1} />

                {/* Lock icon for locked homes */}
                {locked && (
                  <text x={0} y={2} textAnchor="middle" fontSize={5} fill="#9ca3af">🔒</text>
                )}

                {/* Short label below pin */}
                <text
                  x={0}
                  y={active ? 14 : 13}
                  textAnchor="middle"
                  fontSize={active ? 7 : 6}
                  fontFamily="system-ui, sans-serif"
                  fontWeight={active ? "700" : "500"}
                  fill={locked ? "rgba(156,163,175,0.5)" : active ? color : "rgba(255,255,255,0.7)"}
                >
                  {loc.shortName}
                </text>
              </g>
            );
          })}

          {/* Traveling spinner overlay */}
          {isTraveling && (
            <g>
              <rect width={W} height={H} fill="rgba(0,0,0,0.5)" />
              <text x={W / 2} y={H / 2 - 6} textAnchor="middle" fill="white" fontSize={11} fontFamily="system-ui">
                Traveling…
              </text>
            </g>
          )}
        </svg>

        {/* Tooltip */}
        {tooltip && (() => {
          const loc = LOCATIONS.find((l) => l.slug === tooltip.slug);
          if (!loc) return null;
          const locked = isLocked(loc);
          const active = loc.slug === activeSlug;
          const pxX = (tooltip.x / W) * 100;
          const pxY = (tooltip.y / H) * 100;
          return (
            <div
              className="pointer-events-none absolute z-10 rounded-lg border border-black/20 dark:border-white/10 bg-stone-900/90 backdrop-blur px-2.5 py-1.5 shadow-lg"
              style={{
                left: `${Math.min(pxX, 72)}%`,
                top: `${Math.max(pxY - 16, 2)}%`,
                transform: "translate(-50%, -100%)",
                minWidth: 110,
              }}
            >
              <p className="text-xs font-semibold text-white leading-tight">{loc.name}</p>
              {active && (
                <p className="text-[10px] text-amber-400 mt-0.5">You're here</p>
              )}
              {locked && (
                <p className="text-[10px] text-rose-400 mt-0.5">
                  Requires {loc.affinityRequired} affinity ({Math.round(currentAffinity)} now)
                </p>
              )}
              {!active && !locked && (
                <p className="text-[10px] text-stone-400 mt-0.5">Click to travel</p>
              )}
            </div>
          );
        })()}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-t border-black/[0.06] dark:border-white/[0.06]">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
          <span className="text-[10px] text-stone-500 dark:text-stone-400">Home</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-violet-500" />
          <span className="text-[10px] text-stone-500 dark:text-stone-400">Public</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-pink-500" />
          <span className="text-[10px] text-stone-500 dark:text-stone-400">Private</span>
        </span>
      </div>
    </div>
  );
}
