/** Shared form styles for Story Studio — high-contrast selects for readable dropdowns. */

export const studioLabelClass =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-600 dark:text-stone-400";

export const studioHintClass = "mb-1.5 text-xs leading-relaxed text-stone-600 dark:text-stone-400";

export const studioInputClass =
  "w-full min-h-[2.625rem] rounded-xl border border-stone-300/80 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition-colors " +
  "placeholder:text-stone-400 focus:border-accent/50 focus:ring-2 focus:ring-accent/15 " +
  "dark:border-stone-500 dark:bg-stone-100 dark:text-stone-900 dark:placeholder:text-stone-500";

/** Native selects: force light color-scheme so option text stays dark in dark mode. */
export const studioSelectClass =
  studioInputClass + " cursor-pointer font-medium [color-scheme:light]";

export const studioFormWrapperClass = "studio-form";
