import type { ReactNode } from "react";

export function StudioGuide({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-6 rounded-2xl border border-accent/25 bg-accent/[0.07] p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent">{title}</p>
      <div className="space-y-2 text-sm leading-relaxed text-stone-700 dark:text-stone-300">{children}</div>
    </div>
  );
}

export function StudioFieldHint({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 text-xs leading-relaxed text-stone-600 dark:text-stone-400">{children}</p>;
}

/** Collapsible optional/advanced block to reduce form overwhelm. */
export function StudioOptionalSection({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      className="group mt-5 rounded-2xl border border-stone-300/60 bg-stone-50/80 open:border-accent/25 open:bg-accent/[0.04] dark:border-stone-600 dark:bg-stone-900/20"
      {...(defaultOpen ? { open: true } : {})}
    >
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-stone-800 marker:content-none dark:text-stone-100 [&::-webkit-details-marker]:hidden">
        <span className="text-accent">{title}</span>
        <span className="mt-0.5 block text-xs font-normal text-stone-600 dark:text-stone-400">{summary}</span>
      </summary>
      <div className="space-y-4 border-t border-stone-200/80 px-4 py-4 dark:border-stone-700">{children}</div>
    </details>
  );
}
