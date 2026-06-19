import { ImagePlus, Loader2, Sparkles, Upload } from "lucide-react";

const textareaClass =
  "w-full rounded-xl border border-black/10 bg-black/[0.04] px-4 py-3 text-sm leading-relaxed text-stone-800 outline-none transition-colors placeholder:text-stone-500 focus:border-accent/35 focus:ring-2 focus:ring-accent/10 dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-100 dark:placeholder:text-stone-400";

const actionBtnClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-black/10 px-4 py-2.5 text-sm font-semibold transition-colors hover:border-brand-aqua/40 hover:text-brand-aqua disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-white dark:hover:text-brand-aqua";

export interface AvatarImageStudioProps {
  imageSrc: string;
  alt: string;
  prompt: string;
  onPromptChange: (value: string) => void;
  onUpload: (file: File) => void;
  onGenerate: () => void;
  onRemove?: () => void;
  busy?: boolean;
  error?: string | null;
  isPro?: boolean;
  hasCustomImage?: boolean;
  promptLabel?: string;
  promptPlaceholder?: string;
  promptHint?: string;
  generateLabel?: string;
}

export default function AvatarImageStudio({
  imageSrc,
  alt,
  prompt,
  onPromptChange,
  onUpload,
  onGenerate,
  onRemove,
  busy = false,
  error = null,
  isPro = true,
  hasCustomImage = false,
  promptLabel = "Describe the image for AI",
  promptPlaceholder = "Warm smile, soft studio lighting, painterly portrait style, navy sweater, friendly eyes…",
  promptHint = "Be specific about look, mood, clothing, and art style. Leave blank to use your saved profile details.",
  generateLabel = "Generate with AI",
}: AvatarImageStudioProps) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-black/[0.02] p-4 dark:border-white/[0.06] dark:bg-white/[0.02] sm:p-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,280px)_1fr] lg:items-start">
        <div className="relative mx-auto w-full max-w-[280px] lg:mx-0">
          <div className="aspect-square relative overflow-hidden rounded-2xl border border-black/10 bg-black/[0.03] shadow-lg dark:border-white/10 dark:bg-white/[0.03]">
            <img src={imageSrc} alt={alt} className="h-full w-full object-cover object-top" />
            {busy ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-black/50 text-white backdrop-blur-[2px]">
                <Loader2 size={28} className="animate-spin" />
                <span className="text-xs font-medium">Working…</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="min-w-0">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-700 dark:text-stone-300">
            {promptLabel}
          </label>
          {promptHint ? (
            <p className="mb-2 text-xs leading-relaxed text-stone-600 dark:text-stone-400">{promptHint}</p>
          ) : null}
          <textarea
            className={textareaClass}
            rows={5}
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder={promptPlaceholder}
            disabled={busy}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className={`${actionBtnClass} cursor-pointer text-stone-700`}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          Upload photo
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          onClick={onGenerate}
          disabled={busy || !isPro}
          title={isPro ? generateLabel : "Pro subscribers only"}
          className={`${actionBtnClass} border-accent/30 text-accent hover:bg-accent/10`}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {generateLabel}
          {!isPro ? " (Pro)" : ""}
        </button>
        {hasCustomImage && onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className={`${actionBtnClass} text-stone-500 hover:border-red-500/30 hover:text-red-500 dark:text-stone-400 dark:hover:text-red-400`}
          >
            <ImagePlus size={16} /> Remove photo
          </button>
        ) : null}
      </div>

      {!isPro ? (
        <p className="mt-3 text-xs text-stone-600 dark:text-stone-400">
          Upgrade to Pro to generate profile images with AI. You can still upload your own photo anytime.
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}
    </div>
  );
}
