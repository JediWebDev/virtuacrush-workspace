import fs from "fs";
import path from "path";

const reps = [
  [/border-white\/10/g, "border-black/10 dark:border-white/10"],
  [/border-white\/\[0\.08\]/g, "border-black/[0.08] dark:border-white/[0.08]"],
  [/border-white\/\[0\.06\]/g, "border-black/[0.06] dark:border-white/[0.06]"],
  [/border-white\/\[0\.07\]/g, "border-black/[0.07] dark:border-white/[0.07]"],
  [/border-white\/\[0\.05\]/g, "border-black/[0.05] dark:border-white/[0.05]"],
  [/bg-white\/\[0\.04\]/g, "bg-black/[0.04] dark:bg-white/[0.04]"],
  [/bg-white\/\[0\.03\]/g, "bg-black/[0.03] dark:bg-white/[0.03]"],
  [/bg-white\/\[0\.02\]/g, "bg-black/[0.02] dark:bg-white/[0.02]"],
  [/hover:bg-white\/\[0\.06\]/g, "hover:bg-black/[0.06] dark:hover:bg-white/[0.06]"],
  [/hover:bg-white\/\[0\.08\]/g, "hover:bg-black/[0.08] dark:hover:bg-white/[0.08]"],
  [/hover:bg-white\/\[0\.04\]/g, "hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"],
  [/bg-stone-950\/40/g, "bg-stone-100/80 dark:bg-stone-950/40"],
  [/bg-stone-950/g, "bg-stone-100 dark:bg-stone-950"],
  [/bg-stone-900\/60/g, "bg-stone-200/80 dark:bg-stone-900/60"],
  [/bg-stone-900/g, "bg-stone-100 dark:bg-stone-900"],
  [/bg-stone-800\/90/g, "bg-stone-200 dark:bg-stone-800/90"],
  [/bg-stone-800\/60/g, "bg-stone-200 dark:bg-stone-800/60"],
  [/bg-stone-800\/40/g, "bg-stone-200 dark:bg-stone-800/40"],
  [/bg-stone-800/g, "bg-stone-100 dark:bg-stone-800"],
  [/bg-surface\/90/g, "bg-stone-50/90 dark:bg-surface/90"],
  [/bg-surface\/70/g, "bg-stone-50/70 dark:bg-surface/70"],
  [/bg-surface\/60/g, "bg-stone-50/60 dark:bg-surface/60"],
  [/bg-surface/g, "bg-stone-50 dark:bg-surface"],
  [/text-stone-50/g, "text-stone-900 dark:text-stone-50"],
  [/text-stone-100/g, "text-stone-800 dark:text-stone-100"],
  [/text-stone-200/g, "text-stone-700 dark:text-stone-200"],
  [/text-stone-300/g, "text-stone-600 dark:text-stone-300"],
  [/text-stone-400/g, "text-stone-600 dark:text-stone-400"],
  [/hover:text-stone-100/g, "hover:text-stone-900 dark:hover:text-stone-100"],
  [/hover:text-stone-50/g, "hover:text-stone-900 dark:hover:text-stone-50"],
  [/hover:text-stone-200/g, "hover:text-stone-800 dark:hover:text-stone-200"],
  [/ring-surface/g, "ring-stone-50 dark:ring-surface"],
];

function dedupe(s) {
  return s
    .replace(/dark:([^\s"]+)\s+dark:\1/g, "dark:$1")
    .replace(/text-stone-900 dark:text-stone-900/g, "text-stone-900")
    .replace(/text-stone-600 dark:text-stone-600/g, "text-stone-600")
    .replace(/text-stone-800 dark:text-stone-800/g, "text-stone-800")
    .replace(/text-stone-700 dark:text-stone-700/g, "text-stone-700")
    .replace(/border-black\/10 dark:border-black\/10/g, "border-black/10")
    .replace(/bg-stone-50 dark:bg-stone-50/g, "bg-stone-50")
    .replace(/bg-stone-100 dark:bg-stone-100/g, "bg-stone-100")
    .replace(/bg-black\/\[0\.04\] dark:bg-black\/\[0\.04\]/g, "bg-black/[0.04]");
}

function processFile(file) {
  let s = fs.readFileSync(file, "utf8");
  const orig = s;
  for (const [re, rep] of reps) {
    if (re.test(s)) {
      s = s.replace(re, (match) => (match.includes("dark:") ? match : rep));
    }
  }
  s = dedupe(s);
  if (s !== orig) {
    fs.writeFileSync(file, s);
    console.log("updated", file);
  }
}

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== "scripts") walk(p);
    else if (p.endsWith(".tsx")) processFile(p);
  }
}

walk("src");
