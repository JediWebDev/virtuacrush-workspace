/**
 * Chaos engine — connects NPC schema, character agency, story-arc tags, and
 * pre-rolled scene disruptions into director directives for each chat turn.
 *
 * Layers (in priority order):
 *   1. Ambient disruptions (phone buzz, mom call) from scene composition
 *   2. NPC agency actions (rival interrupt_date, friend make_a_move)
 *   3. Schema-weighted NPC chaos (off-scene disruptors enter the scene)
 */
import type { NarrativeTag } from '../inworld/arcs';
import { disruptiveNpcs, type ResolvedSceneNpc } from '../inworld/npc_schema';
import type { WorldEvent } from '../db/world_util';
import { advanceNpcs, type NpcAction } from './agency';
import {
  nextDueDisruption,
  renderDisruptionDirective,
  disruptionResidue,
  type PlannedDisruption,
} from './interruptions';
import type { SceneContext } from './scene_context';
import { enrichWorldWithSceneNpcs, npcEntityIdFromName } from './world_npcs';
import type { WorldState } from './world';

export interface ChaosTurnResult {
  /** Combined prompt block for the director. */
  directiveBlock: string;
  firedDisruption: PlannedDisruption | null;
  /** NPC name key for schema-driven chaos (persisted in composition). */
  firedNpcChaosKey: string | null;
  agencyActions: NpcAction[];
  residues: string[];
}

export interface PlanChaosOpts {
  rng?: () => number;
  /** Player message — optional world-event detector input. */
  worldEvent?: WorldEvent;
  /** Scales schema-chaos probability and agency firing (0–1). Default 1. */
  chaosIntensity?: number;
}

const NPC_CHAOS_MIN_TURN = 4;

function tagBoost(tags: readonly NarrativeTag[], arcTags: NarrativeTag[]): number {
  if (!arcTags.length) return 1;
  const overlap = tags.filter((t) => arcTags.includes(t)).length;
  return 1 + overlap * 0.75;
}

function weightedPick<T extends { chaosWeight: number; narrativeTags: readonly NarrativeTag[] }>(
  pool: T[],
  arcTags: NarrativeTag[],
  r: () => number,
): T | null {
  if (!pool.length) return null;
  const weights = pool.map((n) => n.chaosWeight * tagBoost(n.narrativeTags, arcTags));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return pool[0] ?? null;
  let roll = r() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return pool[i]!;
  }
  return pool[pool.length - 1] ?? null;
}

/** NPC agency: rival arrives to interrupt a date / co-present scene. */
export function renderNpcEntranceDirective(
  npcName: string,
  companionName: string,
  reason: string,
  speakerTag: string,
): string {
  return (
    `\n\n=== CHAOS EVENT (NPC agency — ${npcName} enters the scene) ===\n` +
    `${npcName} shows up unexpectedly (${reason}). ` +
    `${companionName} reacts in character — surprise, guilt, annoyance, or deflection as fits. ` +
    `Voice ${npcName} via [${speakerTag}] for dialogue only; narrator owns actions. ` +
    `This is a hook — do not fully resolve the tension this turn unless the player engages.`
  );
}

/** Schema-driven chaos for an off-scene disruptor (text, knock, walk-in). */
export function renderSchemaNpcChaosDirective(npc: ResolvedSceneNpc, companionName: string): string {
  const entrance =
    npc.stance === 'enemy'
      ? `${npc.name} intrudes — a text that demands attention, a knock, or walking in with obvious intent to disrupt.`
      : npc.stance === 'friend'
        ? `${npc.name} barges in with an opinion or agenda that shifts the room's energy.`
        : `${npc.name} intervenes in the scene as venue staff or ambient cast (${npc.promptBrief}).`;

  return (
    `\n\n=== CHAOS EVENT (schema — ${npc.name}) ===\n` +
    `${entrance} ${npc.promptBrief} ` +
    `${companionName} must react in character. Voice ${npc.name} via [${npc.speakerTag}]. ` +
    `Do not resolve the thread this turn — leave a hook for later.`
  );
}

export function renderAgencyInnerDrive(
  action: NpcAction,
  entityName: string,
  companionName: string,
): string {
  if (action.action === 'make_a_move') {
    return `\n\nINNER DRIVE: ${entityName} feels inclined to ${action.action.replace(/_/g, ' ')} (${action.reason}) — let it color the reply, in character.`;
  }
  if (action.action === 'interrupt_date') {
    return renderNpcEntranceDirective(entityName, companionName, action.reason, entityName.trim().toUpperCase());
  }
  return `\n\nINNER DRIVE: ${entityName} is driven to ${action.action.replace(/_/g, ' ')} (${action.reason}).`;
}

export function renderWorldEventDirective(event: WorldEvent, authority = 'venue security'): string {
  if (event.kind === 'none') return '';
  if (event.kind === 'crime') {
    return (
      `\n\n=== WORLD EVENT (engine — crime) ===\n` +
      `The player's action constitutes a serious crime (${event.crimeType ?? 'unknown'}). ` +
      `${authority} and/or responders MUST react on-scene this turn. Narrate consequences; do not soft-pedal.`
    );
  }
  return (
    `\n\n=== WORLD EVENT (engine — mischief) ===\n` +
    `${authority} intervenes with a firm warning about the player's behavior. Narrate it in-scene.`
  );
}

function offSceneDisruptors(
  ctx: SceneContext,
  world: WorldState,
): ResolvedSceneNpc[] {
  const presentNames = new Set(
    world.scene.presentNpcIds.map((id) => world.npcs[id]?.name?.toLowerCase()).filter(Boolean),
  );
  let pool = disruptiveNpcs(ctx.resolvedNpcs, ctx.arcTags.length ? ctx.arcTags : undefined).filter(
    (n) => !presentNames.has(n.name.trim().toLowerCase()),
  );
  if (!pool.length && ctx.arcTags.length) {
    pool = disruptiveNpcs(ctx.resolvedNpcs).filter(
      (n) => !presentNames.has(n.name.trim().toLowerCase()),
    );
  }
  return pool;
}

function pickSchemaNpcChaos(
  ctx: SceneContext,
  world: WorldState,
  firedKeys: Set<string>,
  r: () => number,
  intensity: number,
): ResolvedSceneNpc | null {
  if (ctx.turn < NPC_CHAOS_MIN_TURN) return null;
  const pool = offSceneDisruptors(ctx, world).filter(
    (n) => !firedKeys.has(n.name.trim().toLowerCase()),
  );
  if (!pool.length) return null;
  const pick = weightedPick(pool, ctx.arcTags, r);
  if (!pick) return null;
  const chance = Math.min(0.55, 0.22 + pick.chaosWeight * 0.35) * intensity;
  return r() < chance ? pick : null;
}

/**
 * Plan chaos for one chat turn: enrich world, run agency, merge directives.
 */
export function planChaosTurn(ctx: SceneContext, opts: PlanChaosOpts = {}): ChaosTurnResult {
  const r = opts.rng ?? Math.random;
  const intensity = Math.max(0, Math.min(1, opts.chaosIntensity ?? 1));
  const blocks: string[] = [];
  const residues: string[] = [];
  let firedDisruption: PlannedDisruption | null = null;
  let firedNpcChaosKey: string | null = null;

  const enriched = enrichWorldWithSceneNpcs(ctx.world, ctx.resolvedNpcs, {
    companionId: ctx.companionId,
    coPresent: ctx.coPresent,
  });

  // 1. Ambient disruptions from scene composition budget.
  if (ctx.composition && !ctx.suppressAmbientDisruptions) {
    const due = nextDueDisruption(ctx.composition, ctx.turn);
    if (due) {
      blocks.push(renderDisruptionDirective(due, ctx.companionName, ctx.companionId));
      firedDisruption = due;
      const residue = disruptionResidue(due, ctx.companionName, ctx.companionId);
      if (residue) residues.push(residue);
    }
  }

  // 2. NPC agency on enriched world (scaled down at lower intensity).
  let agencyActions: NpcAction[] = [];
  if (intensity > 0 && (intensity >= 1 || r() < intensity)) {
    agencyActions = advanceNpcs(enriched, { next: r });
  }
  for (const act of agencyActions) {
    if (act.npc === ctx.companionId) {
      blocks.push(renderAgencyInnerDrive(act, ctx.companionName, ctx.companionName));
    } else {
      const entity = enriched.npcs[act.npc];
      const resolved = ctx.resolvedNpcs.find(
        (n) => npcEntityIdFromName(n.name) === act.npc || n.name === entity?.name,
      );
      const name = entity?.name ?? resolved?.name ?? act.npc;
      const tag = resolved?.speakerTag ?? name.trim().toUpperCase();
      if (act.action === 'interrupt_date') {
        blocks.push(renderNpcEntranceDirective(name, ctx.companionName, act.reason, tag));
        residues.push(`${name} interrupted the scene (${act.reason}).`);
      } else {
        blocks.push(renderAgencyInnerDrive(act, name, ctx.companionName));
      }
    }
  }

  // 3. Schema-weighted NPC chaos when no ambient beat fired (avoid double-stack).
  const firedNpcKeys = new Set(ctx.firedNpcChaos.map((k) => k.toLowerCase()));
  if (!firedDisruption && intensity > 0) {
    const chaosNpc = pickSchemaNpcChaos(ctx, enriched, firedNpcKeys, r, intensity);
    if (chaosNpc) {
      blocks.push(renderSchemaNpcChaosDirective(chaosNpc, ctx.companionName));
      firedNpcChaosKey = chaosNpc.name.trim().toLowerCase();
      residues.push(`${chaosNpc.name} caused a scene disruption (${chaosNpc.stance}, chaos=${chaosNpc.chaosWeight.toFixed(2)}).`);
    }
  }

  if (opts.worldEvent) {
    const we = renderWorldEventDirective(opts.worldEvent);
    if (we) blocks.push(we);
  }

  return {
    directiveBlock: blocks.join(''),
    firedDisruption,
    firedNpcChaosKey,
    agencyActions,
    residues,
  };
}

/** Fire-and-forget world log for chaos residues (free roam + packs). */
export function logChaosResidues(
  userId: string,
  residues: string[],
  log: (userId: string, kind: string, actors: string[], text: string) => Promise<void>,
): void {
  for (const text of residues) {
    void log(userId, 'chaos', [], text).catch(() => {});
  }
}

/** Player-facing summary of the most notable chaos beat this turn (for UI toast). */
export interface ChaosUiHint {
  title: string;
  detail: string;
  /** major = longer toast; subtle = ambient texture only */
  tone: 'subtle' | 'major';
}

const DISRUPTION_UI: Record<string, { title: string; detail: string; tone: 'subtle' | 'major' }> = {
  mom_call: {
    title: 'The world interrupted',
    detail: 'A phone call just cut through the moment.',
    tone: 'major',
  },
  friend_text: {
    title: 'Someone else reached out',
    detail: 'A text from a friend landed mid-conversation.',
    tone: 'major',
  },
  delivery_knock: {
    title: 'Knock at the door',
    detail: 'Something — or someone — showed up uninvited.',
    tone: 'major',
  },
  work_ping: {
    title: 'Work intrudes',
    detail: 'A work notification pulled focus back to real life.',
    tone: 'major',
  },
  friend_ride_arrives: {
    title: 'Her friend is here',
    detail: 'Someone in the scene just arrived and changed the energy.',
    tone: 'major',
  },
  notification_swipe: {
    title: 'Ping',
    detail: 'A notification flickered across the screen.',
    tone: 'subtle',
  },
  ambient_sound: {
    title: 'Something outside',
    detail: 'Noise from outside briefly stole attention.',
    tone: 'subtle',
  },
  tv_moment: {
    title: 'Background noise',
    detail: 'Whatever was on in the background got loud for a second.',
    tone: 'subtle',
  },
  drink_refill: {
    title: 'Small interruption',
    detail: 'They stepped away for a moment and came back.',
    tone: 'subtle',
  },
};

export function chaosUiHint(
  result: ChaosTurnResult,
  opts: {
    companionName: string;
    resolvedNpcs: ResolvedSceneNpc[];
    worldEvent?: WorldEvent;
  },
): ChaosUiHint | null {
  if (opts.worldEvent?.kind === 'crime') {
    return {
      title: 'The world reacted',
      detail: 'Your action had serious consequences — expect a response in-scene.',
      tone: 'major',
    };
  }
  if (opts.worldEvent?.kind === 'mischief') {
    return {
      title: 'Someone noticed',
      detail: 'Staff or security may push back on what just happened.',
      tone: 'major',
    };
  }

  const interrupt = result.agencyActions.find((a) => a.action === 'interrupt_date');
  if (interrupt) {
    const npc =
      opts.resolvedNpcs.find((n) => n.name.trim().toLowerCase() === interrupt.npc.toLowerCase())
      ?? opts.resolvedNpcs.find((n) => npcEntityIdFromName(n.name) === interrupt.npc);
    const name = npc?.name ?? interrupt.npc.replace(/^npc:/, '').replace(/_/g, ' ');
    return {
      title: `${name} entered the scene`,
      detail: `Something shifted — ${opts.companionName} will have to react.`,
      tone: 'major',
    };
  }

  if (result.firedNpcChaosKey) {
    const npc = opts.resolvedNpcs.find(
      (n) => n.name.trim().toLowerCase() === result.firedNpcChaosKey!.toLowerCase(),
    );
    const name = npc?.name ?? result.firedNpcChaosKey;
    return {
      title: `${name} stirred things up`,
      detail: 'Watch the reply — someone new is pulling focus into the scene.',
      tone: 'major',
    };
  }

  if (result.firedDisruption) {
    const mapped = DISRUPTION_UI[result.firedDisruption.poolId];
    if (mapped) return mapped;
    return {
      title: 'The moment shifted',
      detail: 'Something unexpected threaded into the scene.',
      tone: result.firedDisruption.kind === 'beat' ? 'major' : 'subtle',
    };
  }

  return null;
}
