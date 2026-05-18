import fs from "fs";
import path from "path";

const file = path.join("src", "components", "ChatInterface.tsx");
let s = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const eol = "\n";

const oldBlock = `            <button
              type="button"
              onClick={() => setFeedOpen(true)}
              className="flex shrink-0 items-center gap-2 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.04] px-3 py-2 text-xs font-semibold text-stone-600 dark:text-stone-300 transition-all hover:border-accent/30 hover:text-stone-800 dark:text-stone-100 lg:hidden"
            >
              <LayoutGrid size={16} />
              View Feed
            </button>`;

const newBlock = `            <div className="flex shrink-0 items-center gap-1.5 lg:hidden">
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                className="rounded-xl border border-black/10 p-2 text-stone-600 transition-all hover:border-accent/30 hover:text-stone-800 dark:border-white/10 dark:text-stone-300 dark:hover:text-stone-100"
                aria-label="View profile"
              >
                <Info size={18} />
              </button>
              <button
                type="button"
                onClick={() => setFeedOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-black/10 bg-black/[0.04] px-2.5 py-2 text-xs font-semibold text-stone-600 transition-all hover:border-accent/30 hover:text-stone-800 dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-300 dark:hover:text-stone-100"
              >
                <LayoutGrid size={16} />
                <span className="hidden sm:inline">Feed</span>
              </button>
            </motion.div>`;

// fix: use div not motion for button group
const newBlockFixed = newBlock.replace("</motion.div>", "</div>").replace("<motion.div className=\"flex shrink-0", "<div className=\"flex shrink-0");

if (!s.includes(oldBlock)) {
  console.error("feed button block not found");
  process.exit(1);
}
s = s.replace(oldBlock, newBlock);

const nameOld = `                <div>
                    <h3 className="font-semibold text-stone-900 dark:text-stone-50">{character.name}</h3>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400/95">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Online now
                    </div>
                </div>`;

const nameNew = `                <div className="min-w-0">
                    <h3 className="truncate font-semibold text-stone-900 dark:text-stone-50">{character.name}</h3>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-500 dark:text-emerald-400/95">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                        Online now
                    </div>
                </div>`;

if (s.includes(nameOld)) s = s.replace(nameOld, nameNew);
else console.warn("name block not found");

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
              className="absolute inset-y-0 left-0 z-[60] flex w-full max-w-[320px] flex-col border-r border-black/[0.08] dark:border-white/[0.08] bg-stone-50 dark:bg-surface shadow-2xl lg:hidden"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-black/[0.06] dark:border-white/[0.06] px-4 py-3">
                <span className="text-sm font-semibold text-stone-700 dark:text-stone-200">Profile</span>
                <button
                  type="button"
                  onClick={() => setProfileOpen(false)}
                  className="rounded-lg p-2 text-stone-600 transition-colors hover:bg-black/[0.06] hover:text-stone-800 dark:text-stone-400 dark:hover:bg-white/[0.06] dark:hover:text-stone-100"
                  aria-label="Close profile"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="no-scrollbar flex-1 overflow-y-auto p-6">
                <div className="flex flex-col items-center text-center">
                  <div className="relative mb-5 h-36 w-36 overflow-hidden rounded-[2rem] border border-black/10 bg-stone-200 p-1 shadow-xl shadow-black/10 dark:border-white/10 dark:bg-stone-800/40 dark:shadow-black/20">
                    <img src={character.image} alt="" className="h-full w-full rounded-[1.75rem] object-cover" />
                    <div className="absolute bottom-3 right-3 h-3.5 w-3.5 rounded-full border-2 border-stone-50 bg-emerald-400 dark:border-surface shadow-[0_0_0_2px_rgba(16,185,129,0.35)]" />
                  </div>
                  <h2 className="mb-1 font-serif text-2xl font-bold text-stone-900 dark:text-stone-50">{character.name}</h2>
                  <p className="mb-3 text-xs font-medium uppercase tracking-[0.12em] text-accent">{character.role}</p>
                  <span className="mb-5 inline-flex items-center rounded-full border border-black/10 bg-black/[0.04] px-3 py-1 text-[11px] font-semibold text-stone-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-300">
                    Affinity {affinity}%
                  </span>
                  <div className="w-full rounded-2xl border border-black/[0.06] bg-black/[0.03] p-4 text-left dark:border-white/[0.06] dark:bg-white/[0.03]">
                    <h4 className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Vibe</h4>
                    <div className="flex flex-wrap gap-2">
                      {character.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-rose-700 dark:text-rose-100/95"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
`;

if (!s.includes("profileOpen &&")) {
  const anchor = `      </AnimatePresence>\n\n      <AnimatePresence>\n        {activeMessage`;
  if (!s.includes(anchor)) {
    console.error("profile drawer anchor not found");
    process.exit(1);
  }
  s = s.replace(anchor, `      </AnimatePresence>${profileDrawer}\n\n      <AnimatePresence>\n        {activeMessage`);
}

// Fix main chat closing: ensure </motion.div> for main column
s = s.replace(
  /      <\/div>\n      \{\/\* Desktop social feed \*\/\}/,
  "      </motion.div>\n      {/* Desktop social feed */}"
);

// Fix duplicate classes
s = s.replace(/dark:bg-stone-50 dark:bg-surface/g, "dark:bg-surface");
s = s.replace(/dark:bg-stone-100 dark:bg-stone-800/g, "dark:bg-stone-800");
s = s.replace(/hover:text-stone-800 dark:text-stone-100/g, "hover:text-stone-800 dark:hover:text-stone-100");
s = s.replace(/placeholder:text-stone-900 dark:text-stone-500/g, "placeholder:text-stone-500");

fs.writeFileSync(file, s.replace(/\n/g, "\r\n"));
console.log("patched", file);
