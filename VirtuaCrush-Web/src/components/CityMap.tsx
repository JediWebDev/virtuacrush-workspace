import type { MapLocationPin, PlayerAction } from '../types/playerActions';

interface Props {
  locations: MapLocationPin[];
  onTravel: (actionId: string) => void;
  disabled?: boolean;
}

const ZONE_TINT: Record<string, string> = {
  player: 'bg-emerald-500',
  arts: 'bg-violet-500',
  downtown: 'bg-sky-500',
  residential_n: 'bg-amber-500',
  residential_s: 'bg-rose-500',
};

export default function CityMap({ locations, onTravel, disabled }: Props) {
  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-2xl border border-black/10 bg-gradient-to-br from-stone-200/80 to-stone-300/60 dark:border-white/10 dark:from-stone-800/80 dark:to-stone-900/60">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute left-[10%] top-[20%] h-[60%] w-[35%] rounded-full bg-stone-400/40 blur-2xl" />
        <div className="absolute right-[5%] bottom-[10%] h-[45%] w-[40%] rounded-full bg-stone-500/30 blur-2xl" />
      </div>
      {locations.map((loc) => {
        const travelAction: PlayerAction = {
          id: `travel:${loc.slug}`,
          label: loc.shortName,
          category: 'travel',
        };
        const pinClass = ZONE_TINT[loc.zone] ?? 'bg-stone-500';
        return (
          <button
            key={loc.slug}
            type="button"
            disabled={disabled || loc.locked || loc.current}
            title={loc.locked ? 'Locked — raise closeness to visit' : loc.name}
            onClick={() => onTravel(travelAction.id)}
            className="group absolute -translate-x-1/2 -translate-y-1/2 disabled:cursor-not-allowed"
            style={{ left: `${loc.mapX * 100}%`, top: `${loc.mapY * 100}%` }}
          >
            <span
              className={`flex h-3 w-3 items-center justify-center rounded-full ring-2 ring-white/80 shadow-md transition-transform group-hover:scale-125 disabled:opacity-40 ${pinClass} ${loc.current ? 'ring-accent ring-4' : ''}`}
            />
            <span className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/75 px-2 py-0.5 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              {loc.shortName}
              {loc.locked ? ' 🔒' : loc.current ? ' • here' : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}
