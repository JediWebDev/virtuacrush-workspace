/** Shared cleanup for persisted / streamed roleplay transcripts. */
export function sanitizeRoleplayTranscript(raw: string): string {
  const noFences = (raw ?? '').replace(/```[a-z]*|```/gi, '');
  const lines = noFences
    .split('\n')
    .map((line) =>
      line
        .replace(/"?[A-Za-z0-9_]+_(?:actions|lines)"?\s*:\s*\[?\s*/gi, '')
        .replace(/"(?:lines|speaker|text|intent|arcStatus|advance|choices|sceneState)"\s*:\s*"?/gi, '')
        .replace(/^\s*[{}\[\],"'`]+\s*$/g, '')
        .trimEnd(),
    )
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      if (/^[{}\[\],"'`]+$/.test(t)) return false;
      if (/^PLAYER'S CURRENT SITUATION/i.test(t)) return false;
      return true;
    });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
