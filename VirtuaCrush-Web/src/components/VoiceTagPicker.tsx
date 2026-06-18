/** Multi-select voice tag picker — uses vocabulary from GET /api/studio/vocabulary. */

export type VoiceTagId = string;

function labelForTag(tag: string): string {
  return tag
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function VoiceTagPicker({
  tags,
  selected,
  limit,
  onChange,
  disabled,
}: {
  tags: VoiceTagId[];
  selected: VoiceTagId[];
  limit: number;
  onChange: (next: VoiceTagId[]) => void;
  disabled?: boolean;
}) {
  const toggle = (tag: VoiceTagId) => {
    if (disabled) return;
    if (selected.includes(tag)) {
      onChange(selected.filter((t) => t !== tag));
      return;
    }
    if (selected.length >= limit) return;
    onChange([...selected, tag]);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => {
          const active = selected.includes(tag);
          const full = !active && selected.length >= limit;
          return (
            <button
              key={tag}
              type="button"
              disabled={disabled || full}
              onClick={() => toggle(tag)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? 'border-accent bg-accent/15 text-accent'
                  : full
                    ? 'cursor-not-allowed border-stone-300/50 text-stone-400 dark:border-stone-600 dark:text-stone-500'
                    : 'border-stone-300/80 bg-white text-stone-700 hover:border-accent/40 hover:text-accent dark:border-stone-500 dark:bg-stone-100 dark:text-stone-800'
              }`}
            >
              {labelForTag(tag)}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-stone-500">
        {selected.length}/{limit} selected — shapes how they talk in chat.
      </p>
    </div>
  );
}
