// The scene director. Two modes:
//   * Legacy two-call: buildDirectorPrompt (narration only; intent came from a
//     separate referee call) + parseDirectorTurns.
//   * MERGED single-call (preferred): buildScenePrompt + parseScene classify the
//     player's action AND narrate the scene in one JSON object — halving LLM
//     calls (latency + cost). The engine still applies consequences from the
//     returned `intent`; prompt rules keep narration consistent with them.
// All parsing is fail-soft so a malformed model response never blanks a turn.
import type { ChatMessage } from './chat';
import { validateIntent, type PlayerIntent } from '../sim/intent';

export type ActorKind = 'companion' | 'narrator' | 'npc';
export interface Actor { tag: string; name: string; kind: ActorKind; brief?: string }

export interface DirectorStage {
  companionSystem: string;
  companionTag: string;
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

function asStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Strips leaked JSON artifacts (`" }, {`, trailing braces/quotes, speaker keys) from a line. */
function cleanLine(t: string): string {
  return (t ?? '')
    // Leaked per-character JSON keys (e.g. serena_actions": [ or serena_lines":)
    .replace(/"?[a-zA-Z0-9_]+_actions"?\s*:\s*\[?\s*/gi, '')
    .replace(/"?[a-zA-Z0-9_]+_lines"?\s*:\s*"?/gi, '')
    .replace(/^[\s"'`{\[]+/, '')
    .replace(/^[A-Za-z][A-Za-z0-9]*"\s*:\s*"?/i, '') // leaked JSON key, e.g. Ash": " or ash":
    .replace(/^[A-Za-z][A-Za-z0-9]*:\s*/i, '')       // plain name prefix, e.g. Ash:
    .replace(/[\s"'`}\],]+$/, '')
    .replace(/"\s*[}\]]\s*,?\s*[{\[]?\s*"?/g, ' ')
    .replace(/\]\s*"?$/g, '')   // stray ] or "] left from leaked action arrays
    .replace(/\s+/g, ' ')
    .trim();
}

function salvageTexts(raw: string): string[] {
  const out: string[] = [];
  const re = /"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    try { out.push(JSON.parse(`"${m[1]}"`)); } catch { out.push(m[1]); }
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

function mapLines(arr: unknown[], companionName: string): DirectorTurn[] {
  return arr
    .map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      return { speaker: asStr(o.speaker) || companionName, text: cleanLine(asStr(o.text)) };
    })
    .filter((t) => t.text);
}

// Attempts to repair near-valid JSON from weaker models: strips trailing commas,
// closes an unterminated string, and balances brackets/braces. Best-effort.
function repairJson(s: string): string {
  let t = s.trim().replace(/,\s*([}\]])/g, '$1');
  const quotes = (t.match(/(?<!\\)"/g) || []).length;
  if (quotes % 2 === 1) t += '"';
  const openSq = (t.match(/\[/g) || []).length - (t.match(/\]/g) || []).length;
  if (openSq > 0) t += ']'.repeat(openSq);
  const openBr = (t.match(/\{/g) || []).length - (t.match(/\}/g) || []).length;
  if (openBr > 0) t += '}'.repeat(openBr);
  return t;
}

// True if the text still looks like raw JSON structure — used to refuse dumping
// JSON fragments to the player when every parse attempt has failed.
function looksStructured(s: string): boolean {
  return /"(?:intent|lines|speaker|text|type|subtype|target|magnitude)"\s*:/.test(s);
}

// Best-effort intent extraction even when the JSON object won't parse, so the
// engine still classifies the player's action (e.g. crimes still trigger arrest).
function salvageIntent(raw: string): PlayerIntent | null {
  const type = raw.match(/"type"\s*:\s*"([^"]+)"/)?.[1];
  if (!type) return null;
  return validateIntent({
    type,
    subtype: raw.match(/"subtype"\s*:\s*"([^"]*)"/)?.[1] ?? '',
    target: raw.match(/"target"\s*:\s*"([^"]*)"/)?.[1],
    magnitude: raw.match(/"magnitude"\s*:\s*"([^"]*)"/)?.[1],
  });
}

/** Legacy: narration-only prompt (JSON array of lines). */
export function buildDirectorPrompt(stage: DirectorStage): string {
  const turns = stage.history.slice(-MAX_HISTORY_TURNS).map((m) => (m.role === 'user' ? `User: ${m.content}` : m.content)).join('\n');
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

export function parseDirectorTurns(raw: string, companionName: string): DirectorTurn[] {
  const text = (raw ?? '').trim();
  if (!text) return [];
  const tryParse = (json: string): DirectorTurn[] | null => {
    try {
      const parsed = JSON.parse(json) as unknown;
      const arr = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object'
          ? Array.isArray((parsed as { lines?: unknown[] }).lines)
            ? (parsed as { lines: unknown[] }).lines
            : [parsed]
          : null;
      if (arr) { const t = mapLines(arr, companionName); return t.length ? t : null; }
    } catch { /* fall through */ }
    return null;
  };
  const arr = text.match(/\[[\s\S]*\]/);
  if (arr) { const t = tryParse(arr[0]) ?? tryParse(repairJson(arr[0])); if (t) return t; }
  const objs = text.match(/\{[^{}]*\}/g);
  if (objs && objs.length) { const t = tryParse('[' + objs.join(',') + ']'); if (t) return t; }
  // Repair a truncated object/array starting at the first bracket.
  const firstBracket = [text.indexOf('['), text.indexOf('{')].filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (firstBracket !== undefined) { const t = tryParse(repairJson(text.slice(firstBracket))); if (t) return t; }
  const salvaged = salvageTexts(text).map(cleanLine).filter(Boolean);
  if (salvaged.length) return salvaged.map((t) => ({ speaker: companionName, text: t }));
  // Plain prose becomes a line; JSON-looking garbage does NOT (route supplies a
  // graceful fallback instead of leaking structure to the player).
  const cleaned = cleanLine(text.replace(/```[a-z]*|```/gi, ''));
  return cleaned && !looksStructured(text) ? [{ speaker: companionName, text: cleaned }] : [];
}

/** Renders ordered turns into the canonical tagged transcript the UI reads. */
export function turnsToTranscript(turns: DirectorTurn[]): string {
  return turns
    .filter((t) => t.text && t.text.trim())
    .map((t) => `[${(t.speaker || 'NARRATOR').toUpperCase()}] ${t.text.trim()}`)
    .join('\n');
}

// === MERGED single-call scene (referee + director in one round) ==============
export interface SceneResult { intent: PlayerIntent | null; turns: DirectorTurn[] }

export function buildScenePrompt(stage: DirectorStage): string {
  const turns = stage.history.slice(-MAX_HISTORY_TURNS).map((m) => (m.role === 'user' ? `Player: ${m.content}` : m.content)).join('\n');
  const speakerLines = [
    `- "${stage.companionName}" — you, in the FIRST person (your default voice).`,
    `- "narrator" — third-person beats and what the world or others do (wrap actions in *asterisks*; no dialogue).`,
    ...stage.npcs.map((n) => `- "${n.name}" — ${n.brief ?? 'present in the scene'}.`),
  ].join('\n');
  // ORDER MATTERS FOR COST: the prompt is laid out stable-prefix-first so
  // providers with prompt caching (DeepSeek, OpenAI, ...) can reuse the
  // identical prefix across every message: system persona + contract + rules
  // never change for a character, while scene directives, history, and the
  // player's message churn every turn and live at the end.
  return (
`${stage.companionSystem}

=== CLASSIFY, THEN PLAY THE SCENE (one step) ===
Reply with ONE JSON object only:
{
  "intent": { "type": "<social|romance|transaction|movement|conflict|crime|work|observation>", "subtype": "<short label>", "target": "<npc id, 'venue', or omit>", "magnitude": "<modest|big|lavish or omit>" },
  "lines": [ { "speaker": "<name>", "text": "<words or *action*>" } ]
}

"intent" is your honest classification of what the PLAYER just did — NOT a consequence.
If the player is the VICTIM or target of someone else's act (they get kidnapped, robbed, attacked, threatened), that is NOT the player's crime — classify it as "observation"/"share", never "crime".

HOW THE WORLD REACTS (make your narration match your classification):
- crime (theft, robbery, arson, assault, vandalism, kidnapping, indecent_exposure, …) → the player is ARRESTED: police/security arrive, cuff them, haul them off. Narrate it seriously; never a joke.
- conflict (insults, threats, scenes) → venue staff/security step in with a warning.
- otherwise → just play the scene naturally.

RULES:
- ALWAYS include at least one "${stage.companionName}" line. Address the player as "you".
- NEVER put another speaker's words, name, or a "Narrator" label inside your own line — give each speaker their own entry in "lines".
- Keep it short. Output ONLY the JSON object — no prose, no code fences.

=== THIS SCENE ===
Speakers allowed in "lines":
${speakerLines}${stage.directives}

${turns ? turns + '\n' : ''}Player: ${stage.userMessage}

JSON:`
  );
}

export function parseScene(raw: string, companionName: string): SceneResult {
  const text = (raw ?? '').trim();
  let intent: PlayerIntent | null = null;
  let turns: DirectorTurn[] = [];
  const start = text.indexOf('{');
  if (start >= 0) {
    const lastClose = text.lastIndexOf('}');
    const candidate = lastClose > start ? text.slice(start, lastClose + 1) : text.slice(start);
    for (const json of [candidate, repairJson(candidate)]) {
      try {
        const obj = JSON.parse(json) as Record<string, unknown>;
        intent = validateIntent(obj.intent);
        if (Array.isArray(obj.lines)) turns = mapLines(obj.lines as unknown[], companionName);
        if (turns.length) break;
      } catch { /* try repaired, then fall through */ }
    }
  }
  // Even if the lines couldn't be parsed, still classify the player's action.
  if (!intent) intent = salvageIntent(text);
  if (turns.length === 0) turns = parseDirectorTurns(text, companionName);
  return { intent, turns };
}
