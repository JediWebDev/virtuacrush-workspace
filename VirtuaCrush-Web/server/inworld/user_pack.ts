// Validation + conversion for user-authored CYOA STORY PACKS.
//
// The Story Studio "Adventures" builder collects a branching node graph; we
// normalize it into a stored spec (JSONB, format='pack') and, at play time,
// convert it into a runtime StoryPack the existing pack director consumes
// exactly like a built-in pack shipped from server/packs/*.json.
//
// A spec is a small choose-your-own-adventure graph:
//   - nodes keyed by id; there MUST be a "start" node.
//   - each node has an npcInstruction (the dramatic intent of the beat) and an
//     optional introNarrative.
//   - a node's choices are an array of { label, userMessage, next } where `next`
//     is another node id or the sentinel "end"; a node with choices: null is a
//     terminal/ending beat.
import type { StoryPack, PackNode, PackChoice, PackMood, PackNpc } from './pack_types';
import type { UserStory } from '../db/user_stories';
import { PACK_MOODS, isPackMood } from '../studio/schema';
import { parseSceneNpcRefs, type SceneNpcRef } from './npc_schema';

const MOODS: ReadonlyArray<PackMood> = PACK_MOODS;

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

// Node ids are author-facing; keep them simple and predictable.
function cleanNodeId(v: unknown): string {
  return str(v, 40).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
}

export interface UserPackSpec {
  title: string;
  blurb: string;
  mood: PackMood;
  setting: string;       // short location phrase (sceneAnchor.setting)
  situation: string;     // authoritative "where this opens" paragraph
  coPresent: boolean;
  systemInstruction: string; // overall story framing injected every turn
  nodes: Record<string, PackNode>;
  /** Optional scene NPCs (friend / enemy / bystander). */
  npcs?: SceneNpcRef[];
}

export interface PackValidation {
  ok: boolean;
  error?: string;
  spec?: UserPackSpec;
}

function normChoice(raw: unknown): PackChoice | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const label = str(o.label, 80);
  if (!label) return null;
  const next = cleanNodeId(o.next) || 'end';
  return {
    id: cleanNodeId(o.id) || `c_${Math.random().toString(36).slice(2, 8)}`,
    label,
    next,
    userMessage: str(o.userMessage, 400) || label,
  };
}

/**
 * Validates raw builder input into a stored UserPackSpec. Enforces the graph
 * invariants the director relies on: a "start" node exists, every choice target
 * is a real node or "end", every non-terminal node has at least one choice, and
 * the story can actually reach an ending.
 */
export function validatePackSpec(input: unknown): PackValidation {
  const o = (input ?? {}) as Record<string, unknown>;

  const title = str(o.title, 120);
  const situation = str(o.situation, 1500);
  const systemInstruction = str(o.systemInstruction, 1500);
  if (!title) return { ok: false, error: 'title is required' };
  if (!situation) return { ok: false, error: 'opening situation is required' };
  if (!systemInstruction) return { ok: false, error: 'story framing (systemInstruction) is required' };

  const rawNodes = (o.nodes ?? {}) as Record<string, unknown>;
  const ids = Object.keys(rawNodes).map(cleanNodeId).filter(Boolean);
  if (!ids.includes('start')) return { ok: false, error: 'a "start" node is required' };

  const idSet = new Set(ids);
  const nodes: Record<string, PackNode> = {};

  for (const [rawId, rawNode] of Object.entries(rawNodes)) {
    const id = cleanNodeId(rawId);
    if (!id) continue;
    const n = (rawNode ?? {}) as Record<string, unknown>;
    const npcInstruction = str(n.npcInstruction, 1200);
    if (!npcInstruction) return { ok: false, error: `node "${id}" needs a character instruction` };

    // choices: null/empty => terminal beat. Otherwise validate targets.
    const rawChoices = n.choices;
    let choices: PackChoice[] | null;
    if (rawChoices == null || (Array.isArray(rawChoices) && rawChoices.length === 0)) {
      choices = null;
    } else if (Array.isArray(rawChoices)) {
      const cleaned = rawChoices.map(normChoice).filter((c): c is PackChoice => c != null);
      if (cleaned.length === 0) {
        choices = null;
      } else {
        for (const c of cleaned) {
          if (c.next !== 'end' && c.next !== 'continue' && !idSet.has(c.next)) {
            return { ok: false, error: `choice "${c.label}" in node "${id}" points to unknown node "${c.next}"` };
          }
        }
        choices = cleaned.slice(0, 4);
      }
    } else {
      choices = null;
    }

    const node: PackNode = { npcInstruction, choices };
    const intro = str(n.introNarrative, 1000);
    if (intro) node.introNarrative = intro;
    const actRaw = str(n.act, 12);
    if (actRaw === 'beginning' || actRaw === 'middle' || actRaw === 'end') node.act = actRaw;
    nodes[id] = node;
  }

  // Reachability from start + at least one ending must be reachable.
  const reachable = new Set<string>();
  const stack = ['start'];
  let canEnd = false;
  while (stack.length) {
    const cur = stack.pop()!;
    if (reachable.has(cur)) continue;
    reachable.add(cur);
    const node = nodes[cur];
    if (!node) continue;
    if (node.choices == null) { canEnd = true; continue; }
    for (const c of node.choices) {
      if (c.next === 'end') { canEnd = true; continue; }
      if (c.next === 'continue') continue;
      if (nodes[c.next] && !reachable.has(c.next)) stack.push(c.next);
    }
  }
  if (!canEnd) return { ok: false, error: 'the story has no reachable ending (add a terminal node or a choice that goes to "end")' };

  const moodRaw = str(o.mood, 20);
  const mood: PackMood = isPackMood(moodRaw) ? moodRaw : 'dramatic';
  const npcs = parseSceneNpcRefs(o.npcs, 8);

  return {
    ok: true,
    spec: {
      title,
      blurb: str(o.blurb, 400),
      mood,
      setting: str(o.setting, 200),
      situation,
      coPresent: o.coPresent !== false, // default true
      systemInstruction,
      nodes,
      ...(npcs.length ? { npcs } : {}),
    },
  };
}

/** Builds a director-ready StoryPack from a stored user story (format='pack').
 *  The companion persona still comes from the chat character; this supplies the
 *  scene framing and the branching node graph. */
export function userStoryToPack(story: UserStory): StoryPack | null {
  if (story.format !== 'pack') return null;
  const s = story.spec as unknown as Partial<UserPackSpec>;
  if (!s || typeof s.situation !== 'string' || !s.nodes || typeof s.nodes !== 'object') return null;
  if (!s.nodes['start']) return null;

  const packNpcs: PackNpc[] | undefined = Array.isArray(s.npcs) && s.npcs.length
    ? s.npcs.map((n) => ({
        name: n.name,
        description: n.description ?? '',
        stance: n.stance,
        ...(n.archetypeId ? { archetypeId: n.archetypeId } : {}),
        ...(n.roleId ? { roleId: n.roleId } : {}),
      }))
    : undefined;

  return {
    id: `user:${story.id}`,
    characterId: story.characterId,
    title: s.title || story.title || 'Untitled adventure',
    blurb: s.blurb || story.blurb || '',
    tags: [],
    mood: (MOODS.includes(s.mood as PackMood) ? s.mood : 'dramatic') as PackMood,
    estimatedMinutes: 10,
    affinityReward: 10,
    coverGradient: ['#c9717d', '#8b5cf6'],
    systemInstruction: s.systemInstruction || '',
    sceneAnchor: {
      setting: s.setting ?? '',
      situation: s.situation,
      coPresent: s.coPresent !== false,
    },
    ...(packNpcs ? { npcs: packNpcs } : {}),
    nodes: s.nodes,
  };
}
