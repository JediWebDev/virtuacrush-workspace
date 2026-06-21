// Incrementally extract displayable transcript from a partial director JSON stream.
import { turnsToTranscript, type DirectorTurn } from '../inworld/director';

/** Unescape a JSON string value fragment (partial-safe for complete matches). */
function unescapeJsonString(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

/**
 * Pull complete `{ "speaker": "...", "text": "..." }` entries from partial JSON.
 * Fail-soft — returns only fully closed string values.
 */
export function extractCompleteDirectorLines(partialJson: string): DirectorTurn[] {
  const lines: DirectorTurn[] = [];
  const re =
    /\{\s*"speaker"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*,\s*"text"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(partialJson)) !== null) {
    const speaker = unescapeJsonString(m[1] ?? '').trim();
    const text = unescapeJsonString(m[2] ?? '').trim();
    if (speaker && text) lines.push({ speaker, text });
  }
  return lines;
}

/** Cumulative tagged transcript suitable for SSE chunk deltas. */
export function streamingDirectorTranscript(partialJson: string, companionName: string): string {
  const lines = extractCompleteDirectorLines(partialJson);

  // Append the in-progress last `"text":"…` value so tokens show before the closing quote.
  const openText = partialJson.match(/"text"\s*:\s*"((?:\\.|[^"\\])*)$/);
  if (openText?.[1]) {
    const idx = openText.index ?? 0;
    const prefix = partialJson.slice(0, idx);
    const speakerMatch = prefix.match(/"speaker"\s*:\s*"((?:\\.|[^"\\])*)"\s*,[\s\n]*$/);
    const speaker = speakerMatch
      ? unescapeJsonString(speakerMatch[1] ?? '').trim()
      : companionName;
    const text = unescapeJsonString(openText[1] ?? '').trim();
    if (speaker && text) lines.push({ speaker, text });
  }

  return turnsToTranscript(lines);
}
