// Shared story-structure helpers for arcs and CYOA packs (not free roam).
//
// Provides:
//   - Classic three-act pacing directives (beginning / middle / end)
//   - Engine-owned scene/cast blocks the LLM must not contradict without an
//     explicit narrator transition beat

import type { PackNode, StoryPack } from './pack_types';
import type { SceneAnchor } from './arcs';

export type StoryAct = 'beginning' | 'middle' | 'end';

export interface PresentCharacter {
  name: string;
  role: 'companion' | 'npc' | 'player';
  /** One-line brief for NPCs; omitted for player/companion when already in persona. */
  description?: string;
}

export interface SceneDirectiveInput {
  setting: string;
  situation: string;
  coPresent: boolean;
  presentCharacters: PresentCharacter[];
}

/** Builds the opening "scene so far" seed when a pack session or arc starts. */
export function buildInitialSceneState(input: SceneDirectiveInput): string {
  const cast = input.presentCharacters
    .map((c) => {
      const extra = c.description ? ` — ${c.description}` : '';
      return `${c.name} (${c.role})${extra}`;
    })
    .join('; ');
  const loc = input.setting.trim() || 'unspecified location';
  const proximity = input.coPresent
    ? 'Companion and player are physically together.'
    : 'Companion and player are NOT in the same physical space (remote/texting).';
  return `Location: ${loc}. ${proximity} Present: ${cast || 'companion and player'}. ${input.situation.trim()}`.slice(0, 1200);
}

/** Hard engine block injected every story turn — not LLM-maintained. */
export function formatPersistentSceneDirective(input: SceneDirectiveInput): string {
  const castLines = input.presentCharacters.map((c) => {
    const desc = c.description ? ` — ${c.description}` : '';
    return `- ${c.name} (${c.role})${desc}`;
  });
  const proximity = input.coPresent
    ? 'The companion and player ARE physically together unless SCENE SO FAR records an explicit move away.'
    : 'The companion and player are NOT physically together — this is remote/texting unless SCENE SO FAR records an explicit in-person meet.';

  return (
    `\n\n=== SCENE DIRECTIVE (ENGINE — DO NOT CONTRADICT) ===\n` +
    `Opening setting: ${input.setting.trim() || 'see situation below'}\n` +
    `${input.situation.trim()}\n\n` +
    `Proximity: ${proximity}\n\n` +
    `Characters currently in play (do not drop anyone still present; do not re-introduce someone already here):\n` +
    (castLines.length ? castLines.join('\n') : '- companion and player\n') +
    `\n\nSCENE CHANGES: You may move the scene ONLY after a "narrator" line that explicitly establishes travel, arrival, or a cut to a new place/time. ` +
    `When you do, update "sceneState" to the new location and who is physically present. Never describe two places at once.`
  );
}

export function sceneDirectiveFromAnchor(
  anchor: SceneAnchor,
  companionName: string,
  extraNpcs: Array<{ name: string; description?: string }> = [],
): SceneDirectiveInput {
  const presentCharacters: PresentCharacter[] = [
    { name: 'you', role: 'player' },
    { name: companionName, role: 'companion' },
    ...extraNpcs.map((n) => ({ name: n.name, role: 'npc' as const, description: n.description })),
  ];
  return {
    setting: anchor.setting,
    situation: anchor.situation.replace(/^\s*===\s*CURRENT SETTING\s*===\s*/i, '').trim(),
    coPresent: anchor.coPresent,
    presentCharacters,
  };
}

export function formatStoryActDirective(act: StoryAct, mode: 'arc' | 'pack'): string {
  const label = act.toUpperCase();
  if (mode === 'arc') {
    if (act === 'beginning') {
      return (
        `\n\n=== STORY ACT: ${label} ===\n` +
        `You are in the SETUP of this arc. Establish where everyone is, what just happened, and the emotional stakes. ` +
        `Do NOT resolve or complete the arc yet. Hold arcStatus "ongoing".`
      );
    }
    if (act === 'middle') {
      return (
        `\n\n=== STORY ACT: ${label} ===\n` +
        `You are in the CONFRONTATION / development phase. Escalate complications, deepen the relationship beat, and let the player’s choices matter. ` +
        `Stay "ongoing" until a genuine climax moment; use "climax" only when the breaking point arrives.`
      );
    }
    return (
      `\n\n=== STORY ACT: ${label} ===\n` +
      `You are in RESOLUTION. Pay off the arc’s setup and middle beats. ` +
      `Use arcStatus "climax" for the peak beat, then "completed" only after a satisfying denouement — not mid-scene.`
    );
  }

  // pack
  if (act === 'beginning') {
    return (
      `\n\n=== STORY ACT: ${label} ===\n` +
      `SETUP: Ground the player in place, time, and who is present. Clarify the immediate situation and stakes. ` +
      `Do NOT jump to an ending. Prefer "advance":"stay" or early middle beats — never "end" yet.`
    );
  }
  if (act === 'middle') {
    return (
      `\n\n=== STORY ACT: ${label} ===\n` +
      `CONFRONTATION: Complicate, escalate, or deepen the scenario. Honor authored beats but adapt to the current location. ` +
      `Keep moving toward an ending; do not loop the same beat.`
    );
  }
  return (
    `\n\n=== STORY ACT: ${label} ===\n` +
    `RESOLUTION: This beat is part of the ending phase. Land consequences, emotional payoff, and closure. ` +
    `When the scene has truly resolved, set "advance":"end" and arcStatus "completed".`
  );
}

/** Maps arc director status + turn count to a three-act phase. */
export function resolveArcAct(opts: {
  arcStatus?: 'ongoing' | 'climax' | 'completed' | 'abandoned';
  userTurnsSinceStart: number;
}): StoryAct {
  if (opts.arcStatus === 'climax' || opts.arcStatus === 'completed') return 'end';
  if (opts.userTurnsSinceStart <= 2) return 'beginning';
  return 'middle';
}

/** Shortest-path depth from `start` for act inference when nodes lack an explicit `act`. */
function nodeDepths(nodes: Record<string, PackNode>): Map<string, number> {
  const depths = new Map<string, number>();
  const stack: Array<{ id: string; d: number }> = [{ id: 'start', d: 0 }];
  while (stack.length) {
    const { id, d } = stack.pop()!;
    if (depths.has(id)) continue;
    depths.set(id, d);
    const node = nodes[id];
    if (!node?.choices) continue;
    for (const c of node.choices) {
      if (c.next !== 'end' && nodes[c.next]) stack.push({ id: c.next, d: d + 1 });
    }
  }
  return depths;
}

function isTerminalNode(node: PackNode | undefined): boolean {
  return !node || node.choices == null || node.choices.length === 0;
}

/** Resolves the act for a pack beat — explicit tag wins; else infer from graph position. */
export function resolvePackNodeAct(pack: StoryPack, nodeId: string): StoryAct {
  const node = pack.nodes[nodeId];
  if (node?.act) return node.act;
  if (isTerminalNode(node)) return 'end';
  if (nodeId === 'start') return 'beginning';

  const depths = nodeDepths(pack.nodes);
  const d = depths.get(nodeId) ?? 1;
  let max = 0;
  for (const v of depths.values()) max = Math.max(max, v);
  if (max <= 1) return d === 0 ? 'beginning' : 'end';
  const ratio = d / max;
  if (ratio <= 0.34) return 'beginning';
  if (ratio >= 0.67) return 'end';
  return 'middle';
}
