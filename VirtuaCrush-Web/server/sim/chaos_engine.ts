/**
 * Chaos engine — NPC entrances, natural disasters, and player-triggered world
 * reactions injected into director prompts. One substantive derailment per turn;
 * no ignorable background texture.
 */
import type { NarrativeTag } from '../inworld/arcs';
import { disruptiveNpcs, type ResolvedSceneNpc } from '../inworld/npc_schema';
import type { WorldEvent } from '../db/world_util';
import { advanceNpcs, type NpcAction } from './agency';
import {
  nextDueDisruption,
  renderDisruptionDirective,
  disruptionResidue,
  pickEphemeralChaosEvent,
  type PlannedDisruption,
} from './interruptions';
import type { SceneContext } from './scene_context';
import { enrichWorldWithSceneNpcs, npcEntityIdFromName } from './world_npcs';
import type { WorldState } from './world';

export interface ChaosTurnResult {
  directiveBlock: string;
  firedDisruption: PlannedDisruption | null;
  firedNpcChaosKey: string | null;
  agencyActions: NpcAction[];
  residues: string[];
}

export interface PlanChaosOpts {
  rng?: () => number;
  worldEvent?: WorldEvent;
  /** Scales chaos probability (0–1). Default 1. */
  chaosIntensity?: number;
}

const NPC_CHAOS_MIN_TURN = 3;
const EPHEMERAL_MIN_TURN = 4;

const CHAOS_MANDATORY =
  'MANDATORY: The companion MUST react on-screen this turn. Do not ignore, deflect, or continue as if nothing happened.';

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

export function renderNpcEntranceDirective(
  npcName: string,
  companionName: string,
  reason: string,
  speakerTag: string,
): string {
  return (
    `\n\n=== CHAOS EVENT (NPC agency — ${npcName} enters the scene) ===\n` +
    `${npcName} shows up unexpectedly (${reason}). ` +
    `Voice ${npcName} via [${speakerTag}] with at least one line of dialogue. ` +
    `${companionName} MUST react in character — surprise, guilt, annoyance, or deflection as fits. ` +
    `Narrator owns physical actions; this NPC speaks. ` +
    `${CHAOS_MANDATORY}`
  );
}

export function renderSchemaNpcChaosDirective(npc: ResolvedSceneNpc, companionName: string): string {
  const entrance =
    npc.stance === 'enemy'
      ? `${npc.name} intrudes with hostile intent — walking in, a confrontational call, or a public callout aimed at the player.`
      : npc.stance === 'friend'
        ? `${npc.name} barges in with an agenda that pulls focus from the player — opinionated, loud, or emotionally loaded.`
        : `${npc.name} intervenes as venue staff or ambient cast (${npc.promptBrief}).`;

  return (
    `\n\n=== CHAOS EVENT (NPC — ${npc.name}) ===\n` +
    `${entrance} Voice ${npc.name} via [${npc.speakerTag}] with dialogue. ` +
    `${companionName} MUST react; the scene cannot proceed unchanged. ` +
    `${CHAOS_MANDATORY}`
  );
}

export function renderWorldEventDirective(event: WorldEvent, authority = 'venue security'): string {
  if (event.kind === 'none') return '';
  if (event.kind === 'crime') {
    return (
      `\n\n=== CHAOS EVENT (world — crime) ===\n` +
      `The player's action constitutes a serious crime (${event.crimeType ?? 'unknown'}). ` +
      `${authority} and/or responders MUST react on-scene this turn. Narrate consequences; do not soft-pedal. ` +
      `${CHAOS_MANDATORY}`
    );
  }
  return (
    `\n\n=== CHAOS EVENT (world — mischief) ===\n` +
    `${authority} intervenes with a firm, in-scene confrontation about the player's behavior. ` +
    `${CHAOS_MANDATORY}`
  );
}

function offSceneDisruptors(ctx: SceneContext, world: WorldState): ResolvedSceneNpc[] {
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
  const chance = Math.min(0.65, 0.3 + pick.chaosWeight * 0.4) * intensity;
  return r() < chance ? pick : null;
}

function chaosPlanOpts(ctx: SceneContext): { phase: 'home' | 'any'; hasFriend: boolean; firstMeeting: boolean } {
  const hasFriend = ctx.resolvedNpcs.some((n) => n.stance === 'friend')
    || Boolean(ctx.composition?.cast.length);
  return {
    phase: ctx.coPresent ? 'any' : 'home',
    hasFriend,
    firstMeeting: Boolean(ctx.composition?.firstMeeting),
  };
}

function renderEphemeralDirective(
  poolId: string,
  kind: 'npc_event' | 'disaster',
  displayName: string,
  characterId: string,
): string {
  const pseudo: PlannedDisruption = { id: 'ephemeral', poolId, kind, atTurn: 0 };
  return renderDisruptionDirective(pseudo, displayName, characterId);
}

/**
 * Plan chaos for one chat turn. At most ONE substantive derailment fires.
 */
export function planChaosTurn(ctx: SceneContext, opts: PlanChaosOpts = {}): ChaosTurnResult {
  const r = opts.rng ?? Math.random;
  const intensity = Math.max(0, Math.min(1, opts.chaosIntensity ?? 1));
  let directiveBlock = '';
  let firedDisruption: PlannedDisruption | null = null;
  let firedNpcChaosKey: string | null = null;
  const residues: string[] = [];

  const enriched = enrichWorldWithSceneNpcs(ctx.world, ctx.resolvedNpcs, {
    companionId: ctx.companionId,
    coPresent: ctx.coPresent,
  });

  if (intensity <= 0) {
    return { directiveBlock: '', firedDisruption: null, firedNpcChaosKey: null, agencyActions: [], residues: [] };
  }

  // 1. Player-triggered world events (crime / mischief).
  if (opts.worldEvent) {
    const we = renderWorldEventDirective(opts.worldEvent);
    if (we) {
      return {
        directiveBlock: we,
        firedDisruption: null,
        firedNpcChaosKey: null,
        agencyActions: [],
        residues: [],
      };
    }
  }

  // 2. NPC agency — rival / enemy interrupt only (no subtle inner-drive).
  let agencyActions: NpcAction[] = [];
  if (intensity >= 1 || r() < intensity) {
    agencyActions = advanceNpcs(enriched, { next: r });
  }
  const interrupt = agencyActions.find(
    (a) => a.action === 'interrupt_date' && a.npc !== ctx.companionId,
  );
  if (interrupt) {
    const entity = enriched.npcs[interrupt.npc];
    const resolved = ctx.resolvedNpcs.find(
      (n) => npcEntityIdFromName(n.name) === interrupt.npc || n.name === entity?.name,
    );
    const name = entity?.name ?? resolved?.name ?? interrupt.npc;
    const tag = resolved?.speakerTag ?? name.trim().toUpperCase();
    directiveBlock = renderNpcEntranceDirective(name, ctx.companionName, interrupt.reason, tag);
    residues.push(`${name} interrupted the scene (${interrupt.reason}).`);
    return { directiveBlock, firedDisruption, firedNpcChaosKey, agencyActions, residues };
  }

  // 3. Pre-rolled scene chaos (NPC event or disaster from composition).
  if (ctx.composition && !ctx.suppressAmbientDisruptions) {
    const due = nextDueDisruption(ctx.composition, ctx.turn);
    if (due) {
      directiveBlock = renderDisruptionDirective(due, ctx.companionName, ctx.companionId);
      firedDisruption = due;
      const residue = disruptionResidue(due, ctx.companionName, ctx.companionId);
      if (residue) residues.push(residue);
      return { directiveBlock, firedDisruption, firedNpcChaosKey, agencyActions, residues };
    }
  }

  // 4. Schema-weighted off-scene NPC entrance.
  const firedNpcKeys = new Set(ctx.firedNpcChaos.map((k) => k.toLowerCase()));
  const chaosNpc = pickSchemaNpcChaos(ctx, enriched, firedNpcKeys, r, intensity);
  if (chaosNpc) {
    directiveBlock = renderSchemaNpcChaosDirective(chaosNpc, ctx.companionName);
    firedNpcChaosKey = chaosNpc.name.trim().toLowerCase();
    residues.push(`${chaosNpc.name} caused a scene disruption (${chaosNpc.stance}).`);
    return { directiveBlock, firedDisruption, firedNpcChaosKey, agencyActions, residues };
  }

  // 5. Ephemeral chaos for packs / sessions without a composition budget.
  if (ctx.turn >= EPHEMERAL_MIN_TURN && r() < 0.24 * intensity) {
    const planOpts = chaosPlanOpts(ctx);
    if (!planOpts.firstMeeting) {
      const spec = pickEphemeralChaosEvent(r, planOpts);
      if (spec) {
        directiveBlock = renderEphemeralDirective(spec.poolId, spec.kind, ctx.companionName, ctx.companionId);
        firedDisruption = { id: 'ephemeral', poolId: spec.poolId, kind: spec.kind, atTurn: ctx.turn };
        const residue = disruptionResidue(firedDisruption, ctx.companionName, ctx.companionId);
        if (residue) residues.push(residue);
      }
    }
  }

  return { directiveBlock, firedDisruption, firedNpcChaosKey, agencyActions, residues };
}

/** @deprecated Chaos no longer writes to the world activity log. */
export function logChaosResidues(
  _userId: string,
  _residues: string[],
  _log: (userId: string, kind: string, actors: string[], text: string) => Promise<void>,
): void {
  /* no-op — world feed removed; chaos lives in-chat only */
}

export interface ChaosUiHint {
  title: string;
  detail: string;
  tone: 'subtle' | 'major';
}

const CHAOS_UI: Record<string, { title: string; detail: string }> = {
  friend_crash_in: { title: 'Someone burst in', detail: 'A friend just crashed the scene — watch the reply.' },
  friend_demands_answer: { title: 'Caught in the middle', detail: 'Someone demands an answer about you.' },
  rival_steps_in: { title: 'Rival alert', detail: 'A rival just stepped into the moment.' },
  bystander_callout: { title: 'Called out', detail: 'A stranger or staff member intervened.' },
  unexpected_guest: { title: 'Unexpected guest', detail: 'Privacy just evaporated.' },
  power_outage: { title: 'Lights out', detail: 'The power cut — the mood just shifted.' },
  fire_alarm: { title: 'Fire alarm', detail: 'Evacuation energy — the scene is interrupted.' },
  earthquake_tremor: { title: 'Earthquake', detail: 'The ground shook — grab something stable.' },
  sudden_storm: { title: 'Storm hit', detail: 'Weather just forced a reaction.' },
  street_chaos: { title: 'Chaos outside', detail: 'Something loud happened nearby.' },
  sprinkler_flood: { title: 'Water everywhere', detail: 'Sprinklers or a leak just soaked the scene.' },
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
      detail: 'Staff or security is pushing back in-scene.',
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
      detail: `${opts.companionName} has to react — this isn't background noise.`,
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
      detail: 'An NPC just pulled focus into the scene.',
      tone: 'major',
    };
  }

  if (result.firedDisruption) {
    const mapped = CHAOS_UI[result.firedDisruption.poolId];
    if (mapped) {
      return {
        ...mapped,
        tone: result.firedDisruption.kind === 'disaster' ? 'major' : 'major',
      };
    }
    return {
      title: 'Chaos struck',
      detail: 'Something just derailed the moment — read the reply.',
      tone: 'major',
    };
  }

  return null;
}
