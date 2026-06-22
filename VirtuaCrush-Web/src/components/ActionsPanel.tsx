import { useState } from 'react';
import { motion } from 'motion/react';
import { MapPin, Hand, Backpack, ChevronDown, BookMarked } from 'lucide-react';
import type { MapLocationPin, PlayerAction, PlayerProgressDetail } from '../types/playerActions';
import CityMap from './CityMap';
import QuestJournal from './QuestJournal';

type Tab = 'scene' | 'map' | 'journal' | 'items';

interface Props {
  actions: PlayerAction[];
  mapLocations: MapLocationPin[];
  progress: PlayerProgressDetail | null;
  onAction: (actionId: string) => void;
  disabled?: boolean;
}

export default function ActionsPanel({
  actions,
  mapLocations,
  progress,
  onAction,
  disabled,
}: Props) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>('scene');

  const sceneActions = actions.filter((a) => a.category === 'scene');
  const itemActions = actions.filter((a) => a.category === 'inventory');
  const hasScene = sceneActions.length > 0;
  const hasItems = itemActions.length > 0;

  const allTabs: { id: Tab; label: string; icon: typeof Hand; show: boolean }[] = [
    { id: 'scene', label: 'Scene', icon: Hand, show: hasScene },
    { id: 'map', label: 'Map', icon: MapPin, show: true },
    { id: 'journal', label: 'Journal', icon: BookMarked, show: true },
    { id: 'items', label: 'Items', icon: Backpack, show: hasItems },
  ];
  const tabs = allTabs.filter((t) => t.show);

  if (tabs.length === 0) return null;

  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-[520px] px-4"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-2 flex w-full items-center justify-between rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-stone-500 dark:border-white/10 dark:bg-white/[0.04]"
      >
        <span>Actions</span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="rounded-2xl border border-black/10 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <div className="mb-3 flex flex-wrap gap-1">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  activeTab === id
                    ? 'bg-accent/15 text-accent'
                    : 'text-stone-500 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>

          {activeTab === 'scene' && (
            <ActionList actions={sceneActions} onAction={onAction} disabled={disabled} empty="No scene actions right now." />
          )}
          {activeTab === 'map' && (
            <CityMap locations={mapLocations} onTravel={onAction} disabled={disabled} />
          )}
          {activeTab === 'journal' && <QuestJournal progress={progress} />}
          {activeTab === 'items' && (
            <ActionList actions={itemActions} onAction={onAction} disabled={disabled} empty="No items to use in this scene." />
          )}
        </div>
      )}
    </motion.div>
  );
}

function ActionList({
  actions,
  onAction,
  disabled,
  empty,
}: {
  actions: PlayerAction[];
  onAction: (id: string) => void;
  disabled?: boolean;
  empty: string;
}) {
  if (!actions.length) {
    return <p className="py-3 text-center text-xs text-stone-500">{empty}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          disabled={disabled || a.disabled}
          title={a.disabledReason ?? a.hint}
          onClick={() => onAction(a.id)}
          className="rounded-xl border border-black/10 bg-white/70 px-3 py-2.5 text-left text-sm font-medium text-stone-800 transition-all hover:border-accent/35 hover:bg-accent/[0.06] disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.03] dark:text-stone-100"
        >
          {a.label}
          {a.hint && !a.disabled && (
            <span className="mt-0.5 block text-[11px] font-normal text-stone-500">{a.hint}</span>
          )}
          {a.disabled && a.disabledReason && (
            <span className="mt-0.5 block text-[11px] font-normal text-stone-400">{a.disabledReason}</span>
          )}
        </button>
      ))}
    </div>
  );
}
