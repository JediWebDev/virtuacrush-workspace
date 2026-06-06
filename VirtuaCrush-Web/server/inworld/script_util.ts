// Pure parser for the multi-actor "scene director" transcript format.
// The director emits lines tagged with a speaker: "[NARRATOR] ...",
// "[SERENA] ...", "[SECURITY] ...". This splits a transcript into ordered,
// classified bubbles so the UI can render each speaker distinctly.
//
// Shared logic: the server uses this (and it is unit-tested here); the client
// mirrors it in src/lib/script.ts for rendering stored transcripts. Keep them in
// sync. No imports so it stays trivially portable and testable.

export type BubbleKind = 'companion' | 'narrator' | 'npc';
export interface ScriptBubble {
  kind: BubbleKind;
  name: string; // display name (companion name, "Narrator", or NPC label)
  tag: string;  // raw tag, uppercased
  text: string; // the speaker's line(s), tag stripped
}

const TAG_LINE = /^\s*\[([A-Za-z][A-Za-z0-9 ._'-]{0,28})\]\s?/;

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function classify(tag: string, companionName: string): { kind: BubbleKind; name: string } {
  const norm = tag.trim().toUpperCase();
  if (norm === 'NARRATOR') return { kind: 'narrator', name: 'Narrator' };
  if (norm === companionName.trim().toUpperCase()) return { kind: 'companion', name: companionName };
  return { kind: 'npc', name: titleCase(tag.trim()) };
}

/**
 * Parses a director transcript into ordered bubbles. `companionName` is the
 * selected character's display name (to tell the companion tag from NPCs).
 * `dropIncompleteTag` (default true) hides a trailing, not-yet-closed "[..."
 * line so bubbles don't flicker while streaming.
 */
export function parseScript(
  content: string,
  companionName: string,
  dropIncompleteTag = true,
): ScriptBubble[] {
  const raw = (content ?? '').replace(/\r\n/g, '\n');
  if (!raw.trim()) return [];

  let text = raw;
  if (dropIncompleteTag) {
    const lastOpen = text.lastIndexOf('[');
    if (lastOpen !== -1 && text.indexOf(']', lastOpen) === -1) {
      text = text.slice(0, lastOpen);
    }
  }

  const lines = text.split('\n');
  const bubbles: ScriptBubble[] = [];
  let current: ScriptBubble | null = null;
  let sawTag = false;

  const push = (b: ScriptBubble | null) => {
    if (b && b.text.trim()) bubbles.push({ ...b, text: b.text.trim() });
  };

  for (const line of lines) {
    const m = line.match(TAG_LINE);
    if (m) {
      sawTag = true;
      push(current);
      const { kind, name } = classify(m[1], companionName);
      current = { kind, name, tag: m[1].trim().toUpperCase(), text: line.slice(m[0].length) };
    } else if (current) {
      current.text += '\n' + line;
    } else {
      current = { kind: 'companion', name: companionName, tag: companionName.toUpperCase(), text: line };
    }
  }
  push(current);

  if (!sawTag) {
    const t = raw.trim();
    return t ? [{ kind: 'companion', name: companionName, tag: companionName.toUpperCase(), text: t }] : [];
  }
  return bubbles;
}
