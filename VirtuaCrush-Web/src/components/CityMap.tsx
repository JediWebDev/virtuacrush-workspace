import { assetUrl } from '../lib/api';
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
    <div className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-2xl border border-black/10 bg-stone-300 dark:border-white/10 dark:bg-stone-800">
      <img
        src={assetUrl('city-map.png')}
        alt="City map"
        draggable={false}
        className="absolute inset-0 h-full w-full select-none object-cover"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent dark:from-black/40" />
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
