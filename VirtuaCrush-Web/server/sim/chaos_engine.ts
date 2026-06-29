/**
 * Chaos engine — NPC entrances, natural disasters, and player-triggered world
 * reactions injected into director prompts. One substantive derailment per turn.
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
  chaosPlayerToast,
  type PlannedDisruption,
} from './interruptions';
import { friendFor } from './scene_registry';
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
  chaosIntensity?: number;
}

export interface ChaosUiHint {
  title: string;
  detail: string;
  tone: 'subtle' | 'major';
}

export interface ChaosExtraActor {
  tag: string;
  name: string;
  brief: string;
}

const NPC_CHAOS_MIN_TURN = 3;
const EPHEMERAL_MIN_TURN = 4;
const EPHEMERAL_CHANCE = 0.08;

/** Minimum turns between any two ambient/random chaos beats. Player-triggered
 *  world events (crime/mischief) bypass this — they are direct reactions. The
 *  cooldown only applies when the caller supplies ctx.lastChaosTurn. */
const CHAOS_COOLDOWN_TURNS = 4;

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
    `${npcName} shows up unexpectedly (${reason}). ` +
    `Voice ${npcName} via [${speakerTag}] with at least one line of dialogue. ` +
    `${companionName} MUST react in character — surprise, guilt, annoyance, or deflection as fits. ` +
    `Narrator owns physical actions; this NPC speaks. ${CHAOS_MANDATORY}`
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
    `${entrance} Voice ${npc.name} via [${npc.speakerTag}] with dialogue. ` +
    `${companionName} MUST react; the scene cannot proceed unchanged. ${CHAOS_MANDATORY}`
  );
}

export function renderWorldEventDirective(event: WorldEvent, authority = 'venue security'): string {
  if (event.kind === 'none') return '';
  if (event.kind === 'crime') {
    return (
      `The player's action constitutes a serious crime (${event.crimeType ?? 'unknown'}). ` +
      `${authority} and/or responders MUST react on-scene this turn. Narrate consequences; do not soft-pedal. ${CHAOS_MANDATORY}`
    );
  }
  return (
    `${authority} intervenes with a firm, in-scene confrontation about the player's behavior. ${CHAOS_MANDATORY}`
  );
}

/**
 * Injected immediately before the user message so the model must weave chaos into JSON "lines".
 */
export function formatChaosPromptBlock(
  directiveBlock: string,
  companionName: string,
  requiredSpeakers: string[] = [],
): string {
  const beat = directiveBlock.trim();
  if (!beat) return '';
  const speakerNote = requiredSpeakers.length
    ? ` Required speakers this turn: ${requiredSpeakers.join(', ')}.`
    : '';
  return (
    `\n=== CHAOS THIS TURN (REQUIRED — must appear in your JSON "lines") ===\n` +
    `${beat}\n\n` +
    `Before writing JSON: include (1) a "narrator" line depicting this event happening, ` +
    `(2) ${companionName} visibly reacting in character.${speakerNote} ` +
    `Do not reply as if the moment continued normally.\n`
  );
}

/** NPCs that must be registered as speakers when certain chaos events fire. */
export function chaosRequiredActors(
  result: ChaosTurnResult,
  characterId: string,
  resolvedNpcs: ResolvedSceneNpc[],
): ChaosExtraActor[] {
  const out: ChaosExtraActor[] = [];
  const poolId = result.firedDisruption?.poolId;
  const friend = friendFor(characterId);

  const pushNpc = (npc: ResolvedSceneNpc) => {
    if (!out.some((a) => a.tag === npc.speakerTag)) {
      out.push({
        tag: npc.speakerTag,
        name: npc.name,
        brief: `[${npc.stance}] ${npc.promptBrief}`,
      });
    }
  };

  if (poolId === 'friend_crash_in' || poolId === 'friend_demands_answer' || poolId === 'unexpected_guest') {
    const f = resolvedNpcs.find((n) => n.name === friend.name)
      ?? resolvedNpcs.find((n) => n.stance === 'friend');
    if (f) pushNpc(f);
    else {
      out.push({
        tag: friend.name.trim().toUpperCase(),
        name: friend.name,
        brief: `[friend] ${friend.vibe}`,
      });
    }
  }

  if (poolId === 'rival_steps_in') {
    // Only register a real, named enemy NPC. Never force a generic "Rival"
    // placeholder — rival_steps_in is gated on an actual rival existing, so if
    // none is resolved we simply add no required speaker.
    const rival = resolvedNpcs.find((n) => n.stance === 'enemy');
    if (rival) pushNpc(rival);
  }

  if (poolId === 'bystander_callout') {
    const bystander = resolvedNpcs.find((n) => n.stance === 'bystander');
    if (bystander) pushNpc(bystander);
    else {
      out.push({
        tag: 'STAFF',
        name: 'Staff member',
        brief: '[bystander] A stranger, waiter, or security guard intervening in-scene.',
      });
    }
  }

  if (result.firedNpcChaosKey) {
    const npc = resolvedNpcs.find(
      (n) => n.name.trim().toLowerCase() === result.firedNpcChaosKey!.toLowerCase(),
    );
    if (npc) pushNpc(npc);
  }

  const interrupt = result.agencyActions.find((a) => a.action === 'interrupt_date');
  if (interrupt) {
    const npc =
      resolvedNpcs.find((n) => npcEntityIdFromName(n.name) === interrupt.npc)
      ?? resolvedNpcs.find((n) => n.name.trim().toLowerCase() === interrupt.npc.toLowerCase());
    if (npc) pushNpc(npc);
  }

  return out;
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
  const chance = Math.min(0.45, 0.18 + pick.chaosWeight * 0.35) * intensity;
  return r() < chance ? pick : null;
}

function chaosPlanOpts(ctx: SceneContext): { phase: 'home' | 'any'; hasFriend: boolean; firstMeeting: boolean; hasRival: boolean } {
  const hasFriend = ctx.resolvedNpcs.some((n) => n.stance === 'friend')
    || Boolean(ctx.composition?.cast.length);
  const hasRival = ctx.resolvedNpcs.some((n) => n.stance === 'enemy');
  return {
    phase: ctx.coPresent ? 'any' : 'home',
    hasFriend,
    firstMeeting: Boolean(ctx.composition?.firstMeeting),
    hasRival,
  };
}

function renderEphemeralDirective(
  poolId: string,
  kind: 'npc_event' | 'disaster',
  displayName: string,
  characterId: string,
): string {
  const pseudo: PlannedDisruption = { id: 'ephemeral', poolId, kind, atTurn: 0 };
  const full = renderDisruptionDirective(pseudo, displayName, characterId);
  return full.replace(/^\n+=== CHAOS EVENT[^=]*===\n+/i, '').trim();
}

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

  // Cooldown: suppress ambient/random chaos for a few turns after the last beat
  // so derailments don't pile up turn-after-turn. Only active when the caller
  // tracks lastChaosTurn; scheduled, NPC, and ephemeral chaos all respect it.
  if (
    ctx.lastChaosTurn != null &&
    ctx.turn - ctx.lastChaosTurn < CHAOS_COOLDOWN_TURNS
  ) {
    return { directiveBlock: '', firedDisruption: null, firedNpcChaosKey: null, agencyActions: [], residues: [] };
  }

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

  if (ctx.composition && !ctx.suppressAmbientDisruptions) {
    const due = nextDueDisruption(ctx.composition, ctx.turn);
    if (due && !(due.kind === 'disaster' && ctx.suppressEnvironmentalChaos)) {
      const full = renderDisruptionDirective(due, ctx.companionName, ctx.companionId);
      directiveBlock = full.replace(/^\n+=== CHAOS EVENT[^=]*===\n+/i, '').trim();
      firedDisruption = due;
      const residue = disruptionResidue(due, ctx.companionName, ctx.companionId);
      if (residue) residues.push(residue);
      return { directiveBlock, firedDisruption, firedNpcChaosKey, agencyActions, residues };
    }
  }

  const firedNpcKeys = new Set(ctx.firedNpcChaos.map((k) => k.toLowerCase()));
  const chaosNpc = pickSchemaNpcChaos(ctx, enriched, firedNpcKeys, r, intensity);
  if (chaosNpc) {
    directiveBlock = renderSchemaNpcChaosDirective(chaosNpc, ctx.companionName);
    firedNpcChaosKey = chaosNpc.name.trim().toLowerCase();
    residues.push(`${chaosNpc.name} caused a scene disruption (${chaosNpc.stance}).`);
    return { directiveBlock, firedDisruption, firedNpcChaosKey, agencyActions, residues };
  }

  if (ctx.turn >= EPHEMERAL_MIN_TURN && r() < EPHEMERAL_CHANCE * intensity) {
    const planOpts = chaosPlanOpts(ctx);
    if (!planOpts.firstMeeting) {
      const spec = pickEphemeralChaosEvent(r, planOpts, !ctx.suppressEnvironmentalChaos);
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

export function logChaosResidues(
  _userId: string,
  _residues: string[],
  _log: (userId: string, kind: string, actors: string[], text: string) => Promise<void>,
): void {
  /* no-op */
}

export function chaosUiHint(
  result: ChaosTurnResult,
  opts: {
    companionName: string;
    characterId: string;
    resolvedNpcs: ResolvedSceneNpc[];
    worldEvent?: WorldEvent;
  },
): ChaosUiHint | null {
  if (!result.directiveBlock.trim()) return null;

  if (opts.worldEvent?.kind === 'crime') {
    return {
      title: 'Security responded',
      detail: `Authorities are reacting in-scene to what you did.`,
      tone: 'major',
    };
  }
  if (opts.worldEvent?.kind === 'mischief') {
    return {
      title: 'Staff intervened',
      detail: `Someone official just called you out in front of ${opts.companionName}.`,
      tone: 'major',
    };
  }

  if (result.firedDisruption?.poolId) {
    const toast = chaosPlayerToast(result.firedDisruption.poolId, opts.companionName, opts.characterId);
    if (toast) return { ...toast, tone: 'major' };
  }

  const interrupt = result.agencyActions.find((a) => a.action === 'interrupt_date');
  if (interrupt) {
    const npc =
      opts.resolvedNpcs.find((n) => npcEntityIdFromName(n.name) === interrupt.npc)
      ?? opts.resolvedNpcs.find((n) => n.name.trim().toLowerCase() === interrupt.npc.toLowerCase());
    const name = npc?.name ?? interrupt.npc.replace(/^npc:/, '').replace(/_/g, ' ');
    return {
      title: `${name} walked in`,
      detail: `${name} just entered the scene — ${opts.companionName} has to react.`,
      tone: 'major',
    };
  }

  if (result.firedNpcChaosKey) {
    const npc = opts.resolvedNpcs.find(
      (n) => n.name.trim().toLowerCase() === result.firedNpcChaosKey!.toLowerCase(),
    );
    const name = npc?.name ?? result.firedNpcChaosKey;
    return {
      title: `${name} entered the scene`,
      detail: `${name} just pulled focus — ${opts.companionName} is caught off guard.`,
      tone: 'major',
    };
  }

  return null;
}
