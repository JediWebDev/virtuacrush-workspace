import fs from "fs";

const path = "src/components/ChatInterface.tsx";
let s = fs.readFileSync(path, "utf8");

s = s.replace(
  `<motion.div className="flex w-full flex-col border-b border-black/[0.06] dark:border-white/[0.06] p-6 glass backdrop-blur-2xl lg:h-full lg:overflow-y-auto lg:border-b-0 lg:border-r">`,
  `<div className="hidden w-full flex-col border-b border-black/[0.06] p-6 glass backdrop-blur-2xl lg:flex lg:h-full lg:overflow-y-auto lg:border-b-0 lg:border-r dark:border-white/[0.06]">`
);
s = s.replace(
  `<div className="flex w-full flex-col border-b border-black/[0.06] dark:border-white/[0.06] p-6 glass backdrop-blur-2xl lg:h-full lg:overflow-y-auto lg:border-b-0 lg:border-r">`,
  `<motion.div className="hidden w-full flex-col border-b border-black/[0.06] p-6 glass backdrop-blur-2xl lg:flex lg:h-full lg:overflow-y-auto lg:border-b-0 lg:border-r dark:border-white/[0.06]">`
);

s = s.replace(/onClick=\{onBack\}/g, "onClick={handleBack}");

s = s.replace(
  `bg-stone-200 dark:bg-stone-100 dark:bg-stone-800/40`,
  `bg-stone-200 dark:bg-stone-800/40`
);
s = s.replace(
  `border-2 border-surface bg-emerald-400`,
  `border-2 border-stone-50 bg-emerald-400 dark:border-surface`
);

const oldHeader = `      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-stone-100/80 dark:bg-stone-100 dark:bg-stone-950/40 lg:min-h-full">
        <div className="z-10 flex items-center justify-between gap-3 border-b border-black/[0.06] dark:border-white/[0.06] bg-stone-50/70 dark:bg-stone-50 dark:bg-surface/70 px-5 py-4 backdrop-blur-xl md:px-8 md:py-5">
            <div className="flex items-center gap-3">
                <motion.div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-accent/25">
                    <img src={character.image} alt="" className="h-full w-full object-cover" />
                </motion.div>
                <motion.div>
                    <h3 className="font-semibold text-stone-900 dark:text-stone-50">{character.name}</h3>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400/95">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Online now
                    </motion.div>
                </motion.div>
            </motion.div>
            <button
              type="button"
              onClick={() => setFeedOpen(true)}
              className="flex shrink-0 items-center gap-2 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.04] px-3 py-2 text-xs font-semibold text-stone-600 dark:text-stone-300 transition-all hover:border-accent/30 hover:text-stone-800 dark:text-stone-100 lg:hidden"
            >
              <LayoutGrid size={16} />
              View Feed
            </button>
        </motion.div>`;

const newHeader = `      <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-stone-100/80 dark:bg-stone-950/40">
        <div className="z-10 flex shrink-0 items-center justify-between gap-2 border-b border-black/[0.06] bg-stone-50/70 px-4 py-3 backdrop-blur-xl dark:border-white/[0.06] dark:bg-surface/70 md:gap-3 md:px-8 md:py-5">
            <div className="flex min-w-0 flex-1 items-center gap-2">
                <button
                  type="button"
                  onClick={handleBack}
                  className="lg:hidden rounded-xl p-2 text-stone-600 transition-colors hover:bg-black/[0.04] hover:text-stone-900 dark:text-stone-400 dark:hover:bg-white/[0.06] dark:hover:text-stone-100"
                  aria-label="Back to home"
                >
                  <ArrowLeft size={20} />
                </button>
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-accent/25">
                    <img src={character.image} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0">
                    <h3 className="truncate font-semibold text-stone-900 dark:text-stone-50">{character.name}</h3>
                    <motion.div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400/95">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Online now
                    </motion.div>
                </motion.div>
            </motion.div>
            <div className="flex shrink-0 items-center gap-2 lg:hidden">
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-black/10 bg-black/[0.04] px-2.5 py-2 text-xs font-semibold text-stone-600 transition-all hover:border-accent/30 hover:text-stone-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-300 dark:hover:text-stone-100"
                aria-label="View profile"
              >
                <Info size={16} />
                Profile
              </button>
              <button
                type="button"
                onClick={() => setFeedOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-black/10 bg-black/[0.04] px-2.5 py-2 text-xs font-semibold text-stone-600 transition-all hover:border-accent/30 hover:text-stone-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-300 dark:hover:text-stone-100"
                aria-label="View feed"
              >
                <LayoutGrid size={16} />
                Feed
              </button>
            </motion.div>
        </motion.div>`;

if (s.includes(oldHeader)) {
  s = s.replace(oldHeader, newHeader);
} else {
  console.warn("header block not found, trying simpler replace");
}

// Fix accidental motion.div in newHeader - replace motion.div typos in header section
s = s.replace(
  `                    <motion.div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400/95">`,
  `                    <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400/95">`
);
s = s.replace(
  `                    </motion.div>\n                </motion.div>\n            </motion.div>\n            <div className="flex shrink-0`,
  `                    </div>\n                </motion.div>\n            </motion.div>\n            <motion.div className="flex shrink-0`
);
s = s.replace(`            </motion.div>\n        </motion.div>\n\n        {showHistoryView`, `            </motion.div>\n        </motion.div>\n\n        {showHistoryView`);

const profileDrawer = `
      <AnimatePresence>
        {profileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[55] bg-black/50 backdrop-blur-sm lg:hidden"
              onClick={() => setProfileOpen(false)}
              aria-hidden
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="absolute inset-y-0 left-0 z-[60] flex w-full max-w-[320px] flex-col border-r border-black/[0.08] bg-stone-50 shadow-2xl dark:border-white/[0.08] dark:bg-surface lg:hidden"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-black/[0.06] px-4 py-3 dark:border-white/[0.06]">
                <span className="text-sm font-semibold text-stone-800 dark:text-stone-200">Profile</span>
                <button
                  type="button"
                  onClick={() => setProfileOpen(false)}
                  className="rounded-lg p-2 text-stone-600 transition-colors hover:bg-black/[0.06] dark:text-stone-400 dark:hover:bg-white/[0.06] dark:hover:text-stone-100"
                  aria-label="Close profile"
                >
                  <X size={20} />
                </button>
              </motion.div>
              <div className="no-scrollbar flex-1 overflow-y-auto p-6">
                <div className="flex flex-col items-center text-center">
                  <div className="relative mb-5 h-36 w-36 overflow-hidden rounded-[1.75rem] border border-black/10 bg-stone-200 p-1 shadow-lg dark:border-white/10 dark:bg-stone-800/40">
                    <img src={character.image} alt="" className="h-full w-full rounded-[1.5rem] object-cover" />
                    <div className="absolute bottom-3 right-3 h-3 w-3 rounded-full border-2 border-stone-50 bg-emerald-400 dark:border-surface" />
                  </motion.div>
                  <h2 className="mb-1 font-serif text-xl font-bold text-stone-900 dark:text-stone-50">{character.name}</h2>
                  <p className="mb-3 text-xs font-medium uppercase tracking-[0.12em] text-accent">{character.role}</p>
                  <span className="mb-6 inline-flex items-center rounded-full border border-black/10 bg-black/[0.04] px-3 py-1 text-[11px] font-semibold text-stone-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-300">
                    Affinity {affinity}%
                  </span>
                  <div className="w-full rounded-2xl border border-black/[0.06] bg-black/[0.03] p-4 text-left dark:border-white/[0.06] dark:bg-white/[0.03]">
                    <h4 className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Vibe</h4>
                    <div className="flex flex-wrap justify-center gap-2">
                      {character.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-rose-100/95"
                        >
                          {tag}
                        </span>
                      ))}
                    </motion.div>
                  </motion.div>
                </motion.div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
`;

if (!s.includes("profileOpen &&")) {
  s = s.replace(
    `      <AnimatePresence>\n        {activeMessage ? (`,
    `${profileDrawer}\n\n      <AnimatePresence>\n        {activeMessage ? (`
  );
}

// Fix motion.div typos in profile drawer from template
s = s.replace(/<\/motion\.div>\s*<div className="no-scrollbar/g, `</div>\n              <div className="no-scrollbar`);
s = s.replace(/<\/motion\.motion.div>/g, "</div>");

fs.writeFileSync(path, s);
console.log("patched ChatInterface");
