// Output-quality guard. Small models (especially free quantized deployments)
// occasionally degenerate into multilingual token salad mid-reply. This pure
// heuristic flags such output so the caller can retry / fall back instead of
// showing garbage to the user. Tuned to tolerate emoji, accents, *actions*,
// and normal punctuation-heavy roleplay text.

// Characters we consider "normal" for an English roleplay reply: Latin script
// (incl. accents), digits, whitespace, common punctuation, and emoji.
const NORMAL_CHAR =
  /[\p{Script=Latin}\p{N}\s.,!?'"’“”()\[\]{}*:;\-–—…%$€£/&+@#~`^_<>=|\\‍\p{Extended_Pictographic}️]/u;

/** True when the text looks like degenerate model output (token salad). */
export function looksDegenerate(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t) return true;
  if (t.includes('�')) return true; // replacement char = broken decoding

  const sample = [...t.slice(0, 1500)];
  let weird = 0;
  for (const ch of sample) {
    if (!NORMAL_CHAR.test(ch)) weird++;
  }
  // A normal English reply has near-zero out-of-script characters; salads run
  // 15-40%. Threshold leaves room for the odd borrowed word or kaomoji.
  if (sample.length >= 40 && weird / sample.length > 0.08) return true;

  // Secondary signal: high fraction of "words" containing mixed junk.
  const words = t.slice(0, 1500).split(/\s+/).filter(Boolean);
  if (words.length >= 15) {
    const junk = words.filter((w) => {
      const chars = [...w];
      const bad = chars.filter((c) => !NORMAL_CHAR.test(c)).length;
      return bad > 0 && bad / chars.length > 0.3;
    }).length;
    if (junk / words.length > 0.2) return true;
  }

  return false;
}

const FOREIGN_LETTER =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Greek}]/u;

/** Drops isolated non-Latin tokens (CJK leaks, etc.) from a single dialogue line. */
export function sanitizeEnglishDialogue(text: string): string {
  const t = (text ?? '').trim();
  if (!t) return t;
  const cleaned = t
    .split(/(\s+)/)
    .map((token) => {
      if (!token.trim()) return token;
      const stripped = token.trim();
      if (!FOREIGN_LETTER.test(stripped)) return token;
      const letters = [...stripped.replace(/[^\p{L}]/gu, '')];
      if (!letters.length) return token;
      const latin = letters.filter((c) => /\p{Script=Latin}/u.test(c)).length;
      if (latin / letters.length < 0.5) return '';
      return token;
    })
    .join('')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || t;
}
