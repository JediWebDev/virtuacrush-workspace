// Splits an assistant message into ordered segments of narration (third-person
// stage directions written in *asterisks*) and speech (everything else), so the
// UI can render non-verbal beats as distinct narrator lines. Tolerant of
// unbalanced asterisks (e.g. mid-stream), which are treated as speech.
export type NarrationSegment = { type: "narration" | "speech"; text: string };

export function splitNarration(content: string): NarrationSegment[] {
  const segments: NarrationSegment[] = [];
  const re = /\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) {
      const speech = content.slice(last, m.index).trim();
      if (speech) segments.push({ type: "speech", text: speech });
    }
    const narration = m[1].trim();
    if (narration) segments.push({ type: "narration", text: narration });
    last = re.lastIndex;
  }
  if (last < content.length) {
    const tail = content.slice(last).trim();
    if (tail) segments.push({ type: "speech", text: tail });
  }
  if (segments.length === 0 && content.trim()) {
    segments.push({ type: "speech", text: content.trim() });
  }
  return segments;
}
