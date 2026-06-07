// The scene director, split into two stages so the model never owns output
// STRUCTURE — only meaning:
//   Stage 1 (LLM): buildDirectorPrompt asks for a JSON array of {speaker, text}
//                  lines. No tags, no formatting rules.
//   Stage 2 (code): parseDirectorTurns turns that JSON into ordered turns
//                  (fail-soft: malformed/prose/empty never yields a blank turn),
//                  and turnsToTranscript renders them to the canonical tagged
//                  string the UI parser already consumes.
import type { ChatMessage } from './chat';

export type ActorKind = 'companion' | 'narrator' | 'npc';
export interface Actor { tag: string; name: string; kind: ActorKind; brief?: string }

export interface DirectorStage {
  companionSystem: string;
  companionTag: string;   // kept for compatibility; not used by the JSON prompt
  companionName: string;
  npcs: Actor[];
  directives: string;
  history: ChatMessage[];
  userMessage: string;
}

export interface DirectorTurn { speaker: string; text: string }

const MAX_HISTORY_TURNS = 30;

export function companionTagFor(displayName: string): string {
  return (displayName || 'YOU').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'YOU';
}

/** Stage 1 prompt: meaning only, JSON out. */
export function buildDirectorPrompt(stage: DirectorStage): string {
  const turns = stage.history
    .slice(-MAX_HISTORY_TURNS)
    .map((m) => (m.role === 'user' ? `User: ${m.content}` : m.content))
    .join('\n');

  const speakerLines = [
    `- "${stage.companionName}" — you, speaking and acting in the FIRST person. Your default voice; usually the only speaker.`,
    `- "narrator" — third-person narration of non-verbal beats and what the world or other people do. No first-person, no dialogue; wrap actions in *asterisks*.`,
    ...stage.npcs.map((n) => `- "${n.name}" — ${n.brief ?? 'present in the scene'}. Speaks and acts only as themselves.`),
  ].join('\n');

  return (
`${stage.companionSystem}${stage.directives}

=== HOW TO REPLY ===
This is a live scene that may include more than just you. Reply as a JSON array of lines, in order. Each element is {"speaker": <name>, "text": <their words or *action*>}.
Allowed speakers (use these names exactly):
${speakerLines}

Guidance: ALWAYS include at least one "${stage.companionName}" line so the player gets a reply (usually that is the only line). Add a "narrator" line or another speaker ONLY when something warrants it. Keep it short. Never write a line for the player. ADDRESS THE PLAYER AS "you" (second person) — never call them "the user" or "the player".
Output ONLY the JSON array — no preamble, no code fences, no commentary.

${turns ? turns + '\n' : ''}User: ${stage.userMessage}

JSON:`
  );
}

// --- Stage 2: deterministic parsing (no LLM) --------------------------------

function asStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Pulls all "text":"..." values out of malformed output as a salvage path. */
function salvageTexts(raw: string): string[] {
  const out: string[] = [];
  const re = /"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    try {
      out.push(JSON.parse(`"${m[1]}"`));
    } catch {
      out.push(m[1]);
    }
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * Parses the director's output into ordered {speaker, text} turns. Fail-soft, in
 * priority order: a clean JSON array -> salvaged "text" values -> the raw text as
 * a single companion line. Returns [] only when there is genuinely no content.
 */
export function parseDirectorTurns(raw: string, companionName: string): DirectorTurn[] {
  const text = (raw ?? '').trim();
  if (!text) return [];

  const cleanLine = (t: string): string =>
    (t ?? '')
      .replace(/^[\s"'`{\[]+/, '')
      .replace(/[\s"'`}\],]+$/, '')
      .replace(/"\s*[}\]]\s*,?\s*[{\[]?\s*"?/g, ' ') // collapse leaked "}, {" artifacts
      .replace(/\s+/g, ' ')
      .trim();

  const tryParse = (json: string): DirectorTurn[] | null => {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) {
        const turns = parsed
          .map((it) => {
            const o = (it ?? {}) as Record<string, unknown>;
            return { speaker: asStr(o.speaker) || companionName, text: cleanLine(asStr(o.text)) };
          })
          .filter((t) => t.text);
        return turns.length ? turns : null;
      }
    } catch {
      /* fall through */
    }
    return null;
  };

  // 1) a JSON array
  const arr = text.match(/\[[\s\S]*\]/);
  if (arr) {
    const t = tryParse(arr[0]);
    if (t) return t;
  }
  // 2) loose {speaker,text} objects with no enclosing array -> wrap them
  const objs = text.match(/\{[^{}]*\}/g);
  if (objs && objs.length) {
    const t = tryParse('[' + objs.join(',') + ']');
    if (t) return t;
  }
  // 3) salvage any "text" values
  const salvaged = salvageTexts(text).map(cleanLine).filter(Boolean);
  if (salvaged.length) return salvaged.map((t) => ({ speaker: companionName, text: t }));
  // 4) last resort: raw as one companion line, JSON artifacts stripped
  const cleaned = cleanLine(text.replace(/```[a-z]*|```/gi, ''));
  return cleaned ? [{ speaker: companionName, text: cleaned }] : [];
}

/** Stage 2 render: ordered turns -> the canonical tagged transcript the UI reads. */
export function turnsToTranscript(turns: DirectorTurn[]): string {
  return turns
    .filter((t) => t.text && t.text.trim())
    .map((t) => `[${(t.speaker || 'NARRATOR').toUpperCase()}] ${t.text.trim()}`)
    .join('\n');
}
