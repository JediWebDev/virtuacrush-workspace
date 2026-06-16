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
import { NARRATOR_BRIEF } from './characters';

export type ActorKind = 'companion' | 'narrator' | 'npc';
export interface Actor { tag: string; name: string; kind: ActorKind; brief?: string }

/** Arc context injected into the director when a story arc is active. */
export interface ArcContext {
  /** Behavioral instruction injected verbatim into the system prompt. */
  npcInstruction: string;
  /** Evaluative criteria passed to the director for arcStatus decisions. */
  completionCriteria: string;
  /** Concrete examples grounding the LLM's completion evaluation. */
  completionExamples: string[];
}

export interface DirectorStage {
  companionSystem: string;
  companionTag: string;
  companionName: string;
  npcs: Actor[];
  directives: string;
  history: ChatMessage[];
  userMessage: string;
  /** Present only when a story arc is active this turn. */
  arcContext?: ArcContext;
}

export interface DirectorTurn { speaker: string; text: string }

/** Arc evaluation result extracted from the director's JSON output. */
export interface ArcResult {
  arcStatus: 'ongoing' | 'climax' | 'completed' | 'abandoned';
  earnedBadge: { title: string; description: string } | null;
}

/** An LLM-suggested next move for the PLAYER (free-roam choice buttons). */
export interface ReplyChoice {
  /** Short button text, in the player's voice. */
  label: string;
  /** The message sent on the player's behalf if they tap it. */
  userMessage: string;
}

/** Extended output when an arc is active. */
export interface DirectorOutput {
  turns: DirectorTurn[];
  arc: ArcResult | null;
  /** LLM-generated suggested next moves for the player (may be empty). */
  choices: ReplyChoice[];
}

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

// Best-effort intent extraction even when the JSON object won't parse.
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

/**
 * Builds the director prompt.
 * When stage.arcContext is provided, the output schema gains arcStatus and
 * earnedBadge fields so the director evaluates arc progress each turn.
 */
export function buildDirectorPrompt(stage: DirectorStage): string {
  const turns = stage.history.slice(-MAX_HISTORY_TURNS).map((m) => (m.role === 'user' ? `User: ${m.content}` : m.content)).join('\n');
  const speakerLines = [
    `- "${stage.companionName}" — you, speaking ONLY your own spoken words in the FIRST person. Never put actions, gestures, expressions, or reactions in this line.`,
    `- "narrator" — ${NARRATOR_BRIEF} It owns EVERY action and reaction in the scene (yours, the NPCs', and the world's); wrap physical actions in *asterisks*. No dialogue.`,
    ...stage.npcs.map((n) => `- "${n.name}" — ${n.brief ?? 'present in the scene'}. Speaks ONLY their own words; their actions and reactions are narrated by "narrator".`),
  ].join('\n');

  const arcBlock = stage.arcContext ? `

=== ACTIVE STORY ARC ===
${stage.arcContext.npcInstruction}

ARC COMPLETION CRITERIA: ${stage.arcContext.completionCriteria}
Examples of completion: ${stage.arcContext.completionExamples.map((e, i) => `(${i + 1}) ${e}`).join(' ')}

USER FREEDOM — ABSURDITY IS NOT ABANDONMENT: If the player responds with something chaotic, unhinged, or unorthodox, they are still engaging — keep arcStatus "ongoing" or "climax". Only emit "abandoned" if the player has persistently changed the subject over multiple turns or explicitly exited the conversation.
PACING: Hold "ongoing" across multiple turns. Use "climax" to mark the emotional breaking point immediately before resolution. Only emit "completed" after a genuine climax beat.` : '';

  const outputSchema = stage.arcContext
    ? `Reply as a JSON object:
{
  "lines": [ { "speaker": "<name>", "text": "<their words or *action*>" } ],
  "choices": [ { "label": "<short button: a move the PLAYER could make next>", "userMessage": "<what the player says/does if they tap it>" } ],
  "arcStatus": "ongoing" | "climax" | "completed" | "abandoned",
  "earnedBadge": { "title": "<2-4 word title>", "description": "<1-sentence recap>" } or null
}
Set earnedBadge only when arcStatus is "completed"; otherwise null.`
    : `Reply as a JSON object: { "lines": [ { "speaker": "<name>", "text": "<their words or *action*>" } ], "choices": [ { "label": "<short player move>", "userMessage": "<what the player says/does if tapped>" } ] }`;

  return (
`${stage.companionSystem}${stage.directives}${arcBlock}

=== HOW TO REPLY ===
This is a live scene that may include more than just you. ${outputSchema}
Allowed speakers in "lines" (use these names exactly):
${speakerLines}

Guidance: ALWAYS include at least one "${stage.companionName}" line with their spoken reply so the player gets an answer. Put ANY physical action, reaction, expression, or scene beat in a "narrator" line — characters NEVER narrate themselves, so most turns also include a "narrator" line. (Only a pure, wordless reaction may be a "narrator" line alone.) Keep it short. Never write a line for the player. ADDRESS THE PLAYER AS "you" (second person) — never call them "the user" or "the player".
SUGGESTED MOVES: In "choices", offer 2-3 short, DISTINCT next moves the PLAYER could make right now — written in the player's own voice (e.g. a question, a flirt, a playful *action*) and true to where the conversation is. These are optional suggestions the player may tap or ignore; never put your own dialogue in them, and never assume the player has chosen one.
Output ONLY the JSON object — no preamble, no code fences, no commentary.

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

const VALID_ARC_STATUSES = new Set(['ongoing', 'climax', 'completed', 'abandoned']);

/**
 * Parses a director JSON response that may include arc fields.
 * Works whether or not arcContext was provided — `arc` is null when the
 * response has no arcStatus field (i.e. when no arc was active).
 */
/** Maps a raw choices array into clean ReplyChoice objects (fail-soft). */
function mapReplyChoices(arr: unknown): ReplyChoice[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      const label = cleanLine(asStr(o.label));
      const userMessage = asStr(o.userMessage) || label;
      return { label, userMessage };
    })
    .filter((c) => c.label && c.userMessage)
    .slice(0, 3);
}

export function parseDirectorOutput(raw: string, companionName: string): DirectorOutput {
  const text = (raw ?? '').trim();
  let turns: DirectorTurn[] = [];
  let arc: ArcResult | null = null;
  let choices: ReplyChoice[] = [];

  const start = text.indexOf('{');
  if (start >= 0) {
    const lastClose = text.lastIndexOf('}');
    const candidate = lastClose > start ? text.slice(start, lastClose + 1) : text.slice(start);
    for (const json of [candidate, repairJson(candidate)]) {
      try {
        const obj = JSON.parse(json) as Record<string, unknown>;
        if (Array.isArray(obj.lines)) {
          const t = mapLines(obj.lines as unknown[], companionName);
          if (t.length) turns = t;
        }
        if (Array.isArray(obj.choices)) choices = mapReplyChoices(obj.choices);
        const status = typeof obj.arcStatus === 'string' ? obj.arcStatus : null;
        if (status && VALID_ARC_STATUSES.has(status)) {
          const badge = obj.earnedBadge && typeof obj.earnedBadge === 'object'
            ? obj.earnedBadge as { title?: unknown; description?: unknown }
            : null;
          arc = {
            arcStatus: status as ('ongoing' | 'climax' | 'completed' | 'abandoned'),
            earnedBadge: badge && typeof badge.title === 'string' && typeof badge.description === 'string'
              ? { title: badge.title, description: badge.description }
              : null,
          };
        }
        if (turns.length) break;
      } catch { /* try repaired */ }
    }
  }

  if (turns.length === 0) turns = parseDirectorTurns(text, companionName);
  return { turns, arc, choices };
}

/** Renders ordered turns into the canonical tagged transcript the UI reads. */
export function turnsToTranscript(turns: DirectorTurn[]): string {
  return turns
    .filter((t) => t.text && t.text.trim())
    .map((t) => `[${(t.speaker || 'NARRATOR').toUpperCase()}] ${t.text.trim()}`)
    .join('\n');
}

// === Story-pack scene (one merged call) ======================================
// The pack director returns, in a SINGLE JSON object: the multi-actor scene
// (`lines`), a navigation decision (`advance`), an optional set of EVOLVED
// choice buttons (`choices`, used only when the player drifts off the authored
// branches), and an `arcStatus`. This lets free-text input be understood in
// context and advance the story without breaking the offered choices.
export interface PackSceneChoice {
  /** Short button label. */
  label: string;
  /** First-person line/action committed if the player taps this button. */
  userMessage: string;
  /** Authored beat id to advance to, or 'dynamic' to keep improvising, or 'end'. */
  next: string;
}
export interface PackSceneResult {
  /** 'stay' | 'end' | an authored beat id | 'dynamic'. */
  advance: string;
  turns: DirectorTurn[];
  /** Evolved choices the model wants to override the authored ones with (drift). Empty = keep authored. */
  choices: PackSceneChoice[];
  arcStatus: 'ongoing' | 'climax' | 'completed' | null;
}

function mapPackChoices(arr: unknown[]): PackSceneChoice[] {
  return (Array.isArray(arr) ? arr : [])
    .map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      const label = cleanLine(asStr(o.label));
      return {
        label,
        userMessage: asStr(o.userMessage) || label,
        next: asStr(o.next) || 'dynamic',
      };
    })
    .filter((c) => c.label && c.userMessage);
}

/**
 * Parses the pack director's single JSON object. Fail-soft like the others:
 * lines fall back to parseDirectorTurns, advance defaults to 'stay', choices to
 * [] (meaning: keep the authored buttons).
 */
export function parsePackScene(raw: string, companionName: string): PackSceneResult {
  const text = (raw ?? '').trim();
  let advance = 'stay';
  let turns: DirectorTurn[] = [];
  let choices: PackSceneChoice[] = [];
  let arcStatus: PackSceneResult['arcStatus'] = null;

  const start = text.indexOf('{');
  if (start >= 0) {
    const lastClose = text.lastIndexOf('}');
    const candidate = lastClose > start ? text.slice(start, lastClose + 1) : text.slice(start);
    for (const json of [candidate, repairJson(candidate)]) {
      try {
        const obj = JSON.parse(json) as Record<string, unknown>;
        if (Array.isArray(obj.lines)) {
          const t = mapLines(obj.lines as unknown[], companionName);
          if (t.length) turns = t;
        }
        if (Array.isArray(obj.choices)) choices = mapPackChoices(obj.choices as unknown[]);
        if (typeof obj.advance === 'string' && obj.advance.trim()) advance = obj.advance.trim();
        const st = typeof obj.arcStatus === 'string' ? obj.arcStatus : null;
        if (st && VALID_ARC_STATUSES.has(st)) arcStatus = st as PackSceneResult['arcStatus'];
        if (turns.length) break;
      } catch { /* try repaired, then fall through */ }
    }
  }
  if (turns.length === 0) turns = parseDirectorTurns(text, companionName);
  return { advance, turns, choices, arcStatus };
}

// === MERGED single-call scene (referee + director in one round) ==============
export interface SceneResult { intent: PlayerIntent | null; turns: DirectorTurn[] }

export function buildScenePrompt(stage: DirectorStage): string {
  const turns = stage.history.slice(-MAX_HISTORY_TURNS).map((m) => (m.role === 'user' ? `Player: ${m.content}` : m.content)).join('\n');
  const speakerLines = [
    `- "${stage.companionName}" — you, speaking ONLY your own words in the FIRST person (no actions/reactions here).`,
    `- "narrator" — ${NARRATOR_BRIEF} Owns every action and reaction (wrap actions in *asterisks*; no dialogue).`,
    ...stage.npcs.map((n) => `- "${n.name}" — ${n.brief ?? 'present in the scene'}. Speaks only their own words; actions are narrated by "narrator".`),
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
  "intent": { "type": "<social|romance|transaction|movement|conflict|work|observation>", "subtype": "<short label>", "target": "<npc id, 'venue', or omit>", "magnitude": "<modest|big|lavish or omit>" },
  "lines": [ { "speaker": "<name>", "text": "<words or *action*>" } ]
}

"intent" is your honest classification of what the PLAYER just did — NOT a consequence.
HOW THE WORLD REACTS (make your narration match your classification):
- conflict (insults, threats, scenes) → venue staff/security step in with a warning.
- otherwise → just play the scene naturally.

RULES:
- ALWAYS include at least one "${stage.companionName}" line with their spoken reply. Address the player as "you".
- Characters speak ONLY dialogue — put EVERY action, reaction, gesture, expression, and scene beat (for the companion, NPCs, and the world) in a "narrator" line. No actions inside a character's line.
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
