// Mid-scene chaos events — NPC entrances and natural disasters that MUST
// derail the moment. No ignorable phone pings or background texture. The scene
// composer pre-rolls a budget; the chat loop fires each slot when its turn
// arrives. The LLM performs inside engine bounds; the sim decides what fires.
import { friendFor, pronounsFor, type Pronouns } from './scene_registry';
import { pickFrom } from './scene_registry';
import type { NarrativeTag } from '../inworld/arcs';

export type DisruptionKind = 'npc_event' | 'disaster';

export interface PlannedDisruption {
  id: string;
  poolId: string;
  kind: DisruptionKind;
  atTurn: number;
}

interface ChaosEventSpec {
  poolId: string;
  kind: DisruptionKind;
  /** 'home' = remote/at-home scenes, 'any' = all scenes including venues. */
  phase: 'home' | 'any';
  requiresFriend?: boolean;
  /** Only fire when the scene has a real, established enemy/rival NPC. Prevents a
   *  "rival or ex" being conjured from nowhere with no actual character behind it. */
  requiresRival?: boolean;
  tags: NarrativeTag[];
  directive: (name: string, friend: string, pro: Pronouns) => string;
  residue?: (name: string, friend: string, pro: Pronouns) => string;
}

const MANDATORY_RULES =
  'MANDATORY: This MUST appear in this reply — narrated and reacted to. ' +
  'The companion cannot ignore it, swipe it away, or continue as if nothing happened. ' +
  'The player should feel the moment derail. Leave a hook; do not fully resolve in one turn.';

// --- NPC events (friends, enemies, bystanders enter and speak) ----------------

const NPC_EVENTS: ChaosEventSpec[] = [
  {
    poolId: 'friend_crash_in',
    kind: 'npc_event',
    phase: 'any',
    requiresFriend: true,
    tags: ['friendship', 'social', 'conflict'],
    directive: (n, f, pro) =>
      `${f} crashes into the scene — door flying open, unmuted on the call, or physically arriving with obvious intent. ` +
      `Voice ${f} via [${f.trim().toUpperCase()}] with at least one line of dialogue. ` +
      `${pro.subjectCap} MUST react on-screen (surprise, guilt, delight, or irritation — in character). ` +
      `The conversation cannot proceed unchanged.`,
    residue: (n, f) => `${f} barged into ${n}'s scene mid-conversation and forced a reaction.`,
  },
  {
    poolId: 'friend_demands_answer',
    kind: 'npc_event',
    phase: 'any',
    tags: ['friendship', 'conflict', 'social'],
    directive: (n, f, pro) =>
      `${f} shows up — in person or on speakerphone — and demands ${n}'s attention about something that clearly involves the player. ` +
      `Voice ${f} via [${f.trim().toUpperCase()}]. ${pro.subjectCap} is caught between ${f} and the player; ` +
      `must address ${f} directly this turn, not deflect with a glance at the phone.`,
    residue: (n, f) => `${f} confronted ${n} about something involving the player.`,
  },
  {
    poolId: 'rival_steps_in',
    kind: 'npc_event',
    phase: 'any',
    requiresRival: true,
    tags: ['jealousy', 'conflict', 'chaos'],
    directive: (n, f, pro) =>
      `A rival or ex — someone with obvious romantic or competitive history — enters or calls in with hostile energy aimed at the player. ` +
      `Name them, voice them via [NPC TAG], give them dialogue. ${pro.subjectCap} MUST react: tension, defensiveness, or guilty surprise. ` +
      `This is a confrontation hook, not background noise.`,
    residue: (n) => `A rival interrupted ${n}'s scene with the player.`,
  },
  {
    poolId: 'bystander_callout',
    kind: 'npc_event',
    phase: 'any',
    tags: ['chaos', 'conflict', 'social'],
    directive: (n, _f, pro) =>
      `A stranger, staff member, or authority figure intervenes — calling out something in the scene (too loud, suspicious behavior, a mistaken identity, an overdue tab). ` +
      `Voice them via [NPC TAG]. ${pro.subjectCap} and the player MUST respond; the scene pauses until this is addressed.`,
    residue: (n) => `A bystander or staff member interrupted ${n}'s scene.`,
  },
  {
    poolId: 'unexpected_guest',
    kind: 'npc_event',
    phase: 'home',
    tags: ['family', 'social', 'chaos'],
    directive: (n, f, pro) =>
      `Someone ${n} did not expect — family, a roommate, or ${f} with keys — arrives unannounced and changes the privacy of the moment. ` +
      `Voice the guest via [NPC TAG]. ${pro.subjectCap} must scramble to adjust; the player is now part of a more crowded, awkward beat.`,
    residue: (n) => `An unexpected guest arrived while ${n} was with the player.`,
  },
];

// --- Natural disasters & environmental chaos -----------------------------------

const DISASTERS: ChaosEventSpec[] = [
  {
    poolId: 'power_outage',
    kind: 'disaster',
    phase: 'home',
    tags: ['isolation', 'chaos'],
    directive: (n, _f, pro) =>
      `The power cuts out — sudden darkness, devices dying, the mood shifts from cozy to vulnerable. ` +
      `${pro.subjectCap} MUST react (nervous laugh, curse, reach for a flashlight, grab the player's arm). ` +
      `Narrate the blackout; this changes the scene until power returns.`,
    residue: (n) => `The power went out mid-conversation with ${n}.`,
  },
  {
    poolId: 'fire_alarm',
    kind: 'disaster',
    phase: 'any',
    tags: ['chaos', 'stress'],
    directive: (n, _f, pro) =>
      `A fire alarm blares — strobe lights, mandatory evacuation energy, or building staff shouting instructions. ` +
      `${pro.subjectCap} MUST react and the scene MUST pause for the alarm; they cannot keep chatting through it.`,
    residue: (n) => `A fire alarm interrupted ${n}'s scene with the player.`,
  },
  {
    poolId: 'earthquake_tremor',
    kind: 'disaster',
    phase: 'any',
    tags: ['chaos', 'isolation'],
    directive: (_n, _f, pro) =>
      `The ground shudders — a tremor that rattles shelves, spills a drink, or sends both of them grabbing for stability. ` +
      `${pro.subjectCap} MUST react physically and emotionally; the moment becomes about safety and proximity.`,
    residue: (n) => `An earthquake tremor hit during a conversation with ${n}.`,
  },
  {
    poolId: 'sudden_storm',
    kind: 'disaster',
    phase: 'home',
    tags: ['isolation', 'romance'],
    directive: (n, _f, pro) =>
      `Weather turns violent — wind, hail, or rain hammering the windows hard enough to startle. ` +
      `Maybe a leak, a blown fuse, or a branch scraping the glass. ${pro.subjectCap} MUST react; ` +
      `the storm forces them to deal with it together or seek shelter in a smaller space.`,
    residue: (n) => `A sudden storm interrupted a chat with ${n}.`,
  },
  {
    poolId: 'street_chaos',
    kind: 'disaster',
    phase: 'any',
    tags: ['chaos', 'conflict'],
    directive: (n, _f, pro) =>
      `Chaos erupts nearby — a car crash, shouting match, sirens, or a crowd surge audible through the window/door. ` +
      `${pro.subjectCap} MUST react (freeze, rush to look, pull the player back from the window). ` +
      `The outside world invades the scene; they cannot pretend they didn't hear it.`,
    residue: (n) => `Street chaos outside interrupted ${n}'s scene.`,
  },
  {
    poolId: 'sprinkler_flood',
    kind: 'disaster',
    phase: 'any',
    tags: ['chaos', 'stress'],
    directive: (n, _f, pro) =>
      `Sprinklers or a burst pipe activates — water everywhere, false alarm or real leak. ` +
      `${pro.subjectCap} MUST react; belongings get soaked, they need to move, and the date/scene is physically disrupted.`,
    residue: (n) => `Sprinklers or a flood interrupted ${n}'s scene.`,
  },
];

const ALL_SPECS = [...NPC_EVENTS, ...DISASTERS];

export function disruptionSpec(poolId: string): ChaosEventSpec | null {
  return ALL_SPECS.find((s) => s.poolId === poolId) ?? null;
}

export function allChaosEventSpecs(): readonly ChaosEventSpec[] {
  return ALL_SPECS;
}

export interface PlanOpts {
  phase: 'home' | 'any';
  hasFriend: boolean;
  firstMeeting: boolean;
  /** True only when a genuine enemy/rival NPC is present in the scene. Defaults to
   *  off, so rival confrontations never spawn without an actual rival behind them. */
  hasRival?: boolean;
}

function specEligible(s: ChaosEventSpec, opts: Pick<PlanOpts, 'phase' | 'hasFriend' | 'hasRival'>): boolean {
  return (
    (s.phase === 'any' || s.phase === opts.phase) &&
    (!s.requiresFriend || opts.hasFriend) &&
    (!s.requiresRival || Boolean(opts.hasRival))
  );
}

function pickSpec(pool: ChaosEventSpec[], opts: PlanOpts, r: () => number): ChaosEventSpec | null {
  const ok = pool.filter((s) => specEligible(s, opts));
  return ok.length ? pickFrom(ok, r) : null;
}

/** NPC entrances are preferred; environmental disasters are rare spice. */
function pickPlannedChaosEvent(opts: PlanOpts, r: () => number): ChaosEventSpec | null {
  if (r() < 0.88) return pickSpec(NPC_EVENTS, opts, r);
  return pickSpec(DISASTERS, opts, r);
}

/**
 * Pre-rolls substantive chaos for a scene: one NPC or disaster event mid-scene,
 * optionally a second later. No textures or ignorable pings. Skipped on first
 * meetings until the connection is established (turn 8+).
 */
export function planDisruptions(r: () => number, opts: PlanOpts): PlannedDisruption[] {
  const out: PlannedDisruption[] = [];
  let n = 0;
  const push = (spec: ChaosEventSpec | null, atTurn: number) => {
    if (spec) out.push({ id: `d${++n}`, poolId: spec.poolId, kind: spec.kind, atTurn });
  };

  if (opts.firstMeeting) return out;

  const event1Turn = 5 + Math.floor(r() * 4);
  push(pickPlannedChaosEvent(opts, r), event1Turn);

  if (r() < 0.65) {
    const event2Turn = event1Turn + 7 + Math.floor(r() * 5);
    push(pickPlannedChaosEvent(opts, r), event2Turn);
  }

  return out.sort((a, b) => a.atTurn - b.atTurn);
}

export function nextDueDisruption(
  comp: { disruptions?: PlannedDisruption[]; firedDisruptions?: string[] },
  turn: number,
): PlannedDisruption | null {
  const fired = new Set(comp.firedDisruptions ?? []);
  const due = (comp.disruptions ?? [])
    .filter((d) => !fired.has(d.id) && d.atTurn <= turn)
    .sort((a, b) => a.atTurn - b.atTurn);
  return due[0] ?? null;
}

export function renderDisruptionDirective(
  d: PlannedDisruption,
  displayName: string,
  characterId: string,
): string {
  const spec = disruptionSpec(d.poolId);
  if (!spec) return '';
  const friend = friendFor(characterId).name;
  const pro = pronounsFor(characterId);
  const label = spec.kind === 'disaster' ? 'NATURAL DISASTER' : 'NPC CHAOS';
  return (
    `\n\n=== CHAOS EVENT (${label} — ${spec.poolId.replace(/_/g, ' ')}) ===\n` +
    `${spec.directive(displayName, friend, pro)}\n` +
    MANDATORY_RULES
  );
}

export function rerollUnfiredDisruptions(
  disruptions: PlannedDisruption[],
  firedIds: Set<string>,
  arcTags: NarrativeTag[],
  opts: Pick<PlanOpts, 'phase' | 'hasFriend' | 'hasRival'>,
): PlannedDisruption[] {
  return disruptions.map((d) => {
    if (firedIds.has(d.id)) return d;
    const kind = d.kind;
    const pool = (kind === 'disaster' ? DISASTERS : NPC_EVENTS).filter((s) => specEligible(s, opts));
    if (pool.length === 0) return d;
    const totalWeight = pool.reduce((sum, s) => {
      const overlap = s.tags.filter((t) => arcTags.includes(t)).length;
      return sum + 1 + 2 * overlap;
    }, 0);
    let roll = Math.random() * totalWeight;
    for (const spec of pool) {
      const overlap = spec.tags.filter((t) => arcTags.includes(t)).length;
      roll -= 1 + 2 * overlap;
      if (roll <= 0) return { ...d, poolId: spec.poolId, kind: spec.kind };
    }
    const last = pool[pool.length - 1]!;
    return { ...d, poolId: last.poolId, kind: last.kind };
  });
}

export function disruptionResidue(
  d: PlannedDisruption,
  displayName: string,
  characterId: string,
): string {
  const spec = disruptionSpec(d.poolId);
  if (!spec?.residue) return '';
  const pro = pronounsFor(characterId);
  return spec.residue(displayName, friendFor(characterId).name, pro);
}

/** Pick a one-off chaos event when no scene composition budget exists (packs, arcs). */
export function pickEphemeralChaosEvent(
  r: () => number,
  opts: PlanOpts,
  allowDisasters = true,
): ChaosEventSpec | null {
  const pool = (allowDisasters ? ALL_SPECS : NPC_EVENTS).filter((s) => specEligible(s, opts));
  if (!pool.length) return null;
  if (!allowDisasters) return pickFrom(pool, r);
  if (r() < 0.9) {
    const npcOnly = pool.filter((s) => s.kind === 'npc_event');
    if (npcOnly.length) return pickFrom(npcOnly, r);
  }
  return pickFrom(pool, r);
}

/** Player-facing toast copy — states what happened, not meta "read the reply". */
export function chaosPlayerToast(
  poolId: string,
  displayName: string,
  characterId: string,
): { title: string; detail: string } | null {
  const friend = friendFor(characterId).name;
  const toasts: Record<string, { title: string; detail: string }> = {
    friend_crash_in: {
      title: `${friend} burst in`,
      detail: `${friend} crashed into ${displayName}'s scene — mid-conversation.`,
    },
    friend_demands_answer: {
      title: `${friend} needs an answer`,
      detail: `${friend} showed up demanding ${displayName} explain something about you.`,
    },
    rival_steps_in: {
      title: 'A rival showed up',
      detail: `Someone with history walked in and aimed hostility at you and ${displayName}.`,
    },
    bystander_callout: {
      title: 'Someone called you out',
      detail: `A stranger or staff member interrupted ${displayName} and you.`,
    },
    unexpected_guest: {
      title: 'Unexpected guest',
      detail: `Someone ${displayName} didn't expect just walked in on you two.`,
    },
    power_outage: {
      title: 'The power went out',
      detail: `Lights died while you were talking with ${displayName}.`,
    },
    fire_alarm: {
      title: 'Fire alarm',
      detail: `Alarms blared — ${displayName}'s scene just got evacuated.`,
    },
    earthquake_tremor: {
      title: 'Earthquake',
      detail: `The ground shook; ${displayName} grabbed for stability.`,
    },
    sudden_storm: {
      title: 'Storm hit',
      detail: `Weather turned violent outside ${displayName}'s place.`,
    },
    street_chaos: {
      title: 'Chaos outside',
      detail: `Sirens or shouting erupted nearby — ${displayName} heard it.`,
    },
    sprinkler_flood: {
      title: 'Sprinklers went off',
      detail: `Water everywhere — ${displayName}'s scene got soaked.`,
    },
  };
  return toasts[poolId] ?? null;
}
