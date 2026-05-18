import fs from "fs";
import path from "path";

function fix(s) {
  return s
    .replace(/dark:([a-z0-9\[\]\/.%-]+)\s+dark:\1/g, "dark:$1")
    .replace(/(text-stone-\d+)\s+\1/g, "$1")
    .replace(/(bg-stone-\d+)\s+\1/g, "$1")
    .replace(/(border-black\/\d+)\s+\1/g, "$1")
    .replace(/dark:text-stone-600 dark:text-stone-400/g, "dark:text-stone-400")
    .replace(/dark:hover:text-stone-800 dark:text-stone-100/g, "dark:hover:text-stone-100")
    .replace(/dark:border-black\/10 dark:border-white\/10/g, "border-black/10 dark:border-white/10")
    .replace(/dark:bg-black\/\[0\.04\] dark:bg-white\/\[0\.04\]/g, "bg-black/[0.04] dark:bg-white/[0.04]")
    .replace(/dark:hover:bg-black\/\[0\.08\] dark:hover:bg-white\/\[0\.08\]/g, "hover:bg-black/[0.08] dark:hover:bg-white/[0.08]")
    .replace(/dark:hover:text-stone-900 dark:text-stone-50/g, "hover:text-stone-900 dark:hover:text-stone-50")
    .replace(/hover:text-stone-900 dark:hover:text-stone-900/g, "hover:text-stone-900");
}

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== "scripts") walk(p);
    else if (p.endsWith(".tsx")) {
      const orig = fs.readFileSync(p, "utf8");
      const next = fix(orig);
      if (next !== orig) {
        fs.writeFileSync(p, next);
        console.log("fixed", p);
      }
    }
  }
}

walk("src");
