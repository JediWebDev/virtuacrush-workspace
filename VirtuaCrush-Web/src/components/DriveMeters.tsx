// Compact drive/desire meters shown on the profile rail.
interface Drive {
  key: string;
  label: string;
  value: number;
}

export default function DriveMeters({ drives }: { drives?: Drive[] }) {
  if (!drives || drives.length === 0) return null;
  return (
    <div className="mb-5 w-full rounded-2xl border border-black/10 bg-black/[0.03] p-4 text-left dark:border-white/10 dark:bg-white/[0.03]">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500">How they're feeling</p>
      <div className="flex flex-col gap-2.5">
        {drives.map((d) => (
          <div key={d.key}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-stone-700 dark:text-stone-300">{d.label}</span>
              <span className="text-[10px] tabular-nums text-stone-400">{d.value}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent/70 to-accent transition-[width] duration-500"
                style={{ width: `${Math.max(0, Math.min(100, d.value))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
