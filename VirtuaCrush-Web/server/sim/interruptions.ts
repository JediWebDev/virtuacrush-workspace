// Mid-scene interruptions. The scene composer pre-rolls a seeded disruption
// budget when a scene is composed; the chat loop fires each one when its turn
// arrives by injecting an engine-bounded directive (character reacts, deflects if
// asked, do NOT resolve — it's a hook). The sim decides outcome bounds; the
// LLM performs inside them. Severity ladder (MVP): texture (no redirect),
// beat interrupts (momentary redirect that deposits content), friend beats
// (only when the friend is in the scene). Cast changes & scene breaks later.
import { friendFor, pronounsFor, type Pronouns } from './scene_registry';
import { pickFrom } from './scene_registry';
import type { NarrativeTag } from '../inworld/arcs';

export type DisruptionKind = 'texture' | 'beat';

export interface PlannedDisruption {
  id: string;       // unique within the composition ("d1", "d2", ...)
  poolId: string;   // which authored spec to render
  kind: DisruptionKind;
  atTurn: number;   // fires on the first user turn >= this, once
}

interface DisruptionSpec {
  poolId: string;
  kind: DisruptionKind;
  /** 'home' = remote/texting scenes, 'any' = all scenes. */
  phase: 'home' | 'any';
  requiresFriend?: boolean;
  /** Narrative tags used for arc-weighted selection. */
  tags: NarrativeTag[];
  directive: (name: string, friend: string, pro: Pronouns) => string;
  /** Durable memory written after the beat fires (texture leaves none). */
  residue?: (name: string, friend: string, pro: Pronouns) => string;
}

// --- Authored pools -----------------------------------------------------------

const TEXTURES: DisruptionSpec[] = [
  {
    poolId: 'notification_swipe', kind: 'texture', phase: 'any',
    tags: ['social'],
    directive: (n, _f, pro) =>
      `${n}'s phone buzzes with some notification; ${pro.subject} glances and swipes it away without comment.`,
  },
  {
    poolId: 'ambient_sound', kind: 'texture', phase: 'home',
    tags: ['stability'],
    directive: () => `Somewhere outside, a car alarm starts and gives up after a few seconds.`,
  },
  {
    poolId: 'tv_moment', kind: 'texture', phase: 'home',
    tags: ['stability'],
    directive: (n) => `Whatever's on ${n}'s TV gets suddenly loud for a second — ${n} mutes it without looking.`,
  },
  {
    poolId: 'drink_refill', kind: 'texture', phase: 'home',
    tags: ['stability'],
    directive: (n) => `${n} pads off mid-thought to refill ${n}'s drink and comes back settling deeper into the couch.`,
  },

];

const BEATS: DisruptionSpec[] = [
  {
    poolId: 'friend_text', kind: 'beat', phase: 'any',
    tags: ['friendship', 'conflict', 'social'],
    directive: (n, f, pro) =>
      `${n}'s phone lights up — a text from ${f}. ${pro.subjectCap} reads it, reacts visibly (a snort, an eye-roll, a flicker of worry — your choice, in character), and puts the phone face-down. ` +
      `If the player asks, ${pro.subject} gives a vague half-answer ("${f} being ${f}") and changes the subject. Do NOT explain what the text said — it's a hook for later.`,
    residue: (n, f) => `${f} texted ${n} mid-conversation; ${n} got cagey about what it said.`,
  },
  {
    poolId: 'mom_call', kind: 'beat', phase: 'any',
    tags: ['family', 'stress', 'isolation'],
    directive: (n, _f, pro) =>
      `${n}'s phone rings: "Mom". ${pro.subjectCap} stares at it for a second too long, then declines the call. ${pro.possessive} mood dips — distracted, a little tight. ` +
      `If the player asks, ${pro.subject} deflects ("it's nothing — family stuff") but doesn't fully recover this turn. Do NOT resolve why; leave the thread hanging.`,
    residue: (n) => `${n}'s mom called during the conversation; ${n} declined it and went quiet about why.`,
  },
  {
    poolId: 'delivery_knock', kind: 'beat', phase: 'home',
    tags: ['money', 'chaos'],
    directive: (n, _f, pro) =>
      `A knock — a delivery ${n} forgot ${pro.subject} ordered. ${pro.subjectCap} is gone for a moment and comes back with a package ${pro.subject}'s clearly pleased about but won't open right now. ` +
      `If the player asks what it is, ${pro.subject} teases ("you'll see... maybe") and moves on. Do NOT reveal the contents.`,
    residue: (n) => `A mystery package arrived for ${n} mid-chat; ${n} refused to say what's inside.`,
  },
  {
    poolId: 'work_ping', kind: 'beat', phase: 'any',
    tags: ['work', 'stress'],
    directive: (n, _f, pro) =>
      `${n} gets a message that is obviously about work or ${pro.possessive} main hustle — ${pro.subject} groans, types a fast reply, and tosses the phone aside. ` +
      `It costs ${pro.object} a beat of attention and earns the player a small apology. If asked, one tired sentence about it, then ${pro.subject} firmly changes the subject to the player.`,
    residue: (n) => `Work pinged ${n} mid-conversation; whatever it was annoyed ${n}.`,
  },
  {
    poolId: 'friend_ride_arrives', kind: 'beat', phase: 'home', requiresFriend: true,
    tags: ['friendship', 'social'],
    directive: (n, f, pro) =>
      `${f}'s ride is outside — ${pro.subject} has to go. ${pro.subjectCap} makes a small production of leaving (one last pointed remark aimed at ${n} about the player, in character), then ${pro.subject}'s gone and the room is suddenly quieter. ` +
      `${n} reacts to the new privacy however fits ${n}'s current feelings. ${f} is now GONE from the scene — do not voice ${f} again after this reply.`,
    residue: (n, f) => `${f} left partway through; on the way out ${f} made a pointed remark about the player to ${n}.`,
  },
];

const ALL_SPECS = [...TEXTURES, ...BEATS];

export function disruptionSpec(poolId: string): DisruptionSpec | null {
  return ALL_SPECS.find((s) => s.poolId === poolId) ?? null;
}

// --- Planner (pure, seeded) ----------------------------------------------------

export interface PlanOpts {
  phase: 'home';
  hasFriend: boolean;
  firstMeeting: boolean;
}

function pickSpec(pool: DisruptionSpec[], opts: PlanOpts, r: () => number): DisruptionSpec | null {
  const ok = pool.filter(
    (s) => (s.phase === 'any' || s.phase === opts.phase) && (!s.requiresFriend || opts.hasFriend),
  );
  return ok.length ? pickFrom(ok, r) : null;
}

/**
 * Pre-rolls the scene's disruption budget: textures every ~5-7 turns, ONE beat
 * around turns 7-12 (none on first meetings — don't sabotage the meet-cute),
 * and the friend's exit a few turns after the beat when they're present.
 */
export function planDisruptions(r: () => number, opts: PlanOpts): PlannedDisruption[] {
  const out: PlannedDisruption[] = [];
  let n = 0;
  const push = (spec: DisruptionSpec | null, atTurn: number) => {
    if (spec) out.push({ id: `d${++n}`, poolId: spec.poolId, kind: spec.kind, atTurn });
  };

  // Texture cadence: first around turn 4-6, second ~6 turns later.
  const t1 = 4 + Math.floor(r() * 3);
  push(pickSpec(TEXTURES, opts, r), t1);
  push(pickSpec(TEXTURES, opts, r), t1 + 6 + Math.floor(r() * 3));

  // One meaningful beat per scene (the workhorse), skipped on first meetings.
  if (!opts.firstMeeting) {
    const beatTurn = 7 + Math.floor(r() * 6);
    push(pickSpec(BEATS.filter((b) => !b.requiresFriend), opts, r), beatTurn);
    if (opts.hasFriend) {
      push(pickSpec(BEATS.filter((b) => b.requiresFriend), opts, r), beatTurn + 4 + Math.floor(r() * 3));
    }
  }

  return out.sort((a, b) => a.atTurn - b.atTurn);
}

/** The next unfired disruption due at or before this turn (lowest turn first). */
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

// --- Rendering -------------------------------------------------------------------

/** Engine-bounded directive injected into the prompt the turn a disruption fires. */
export function renderDisruptionDirective(
  d: PlannedDisruption,
  displayName: string,
  characterId: string,
): string {
  const spec = disruptionSpec(d.poolId);
  if (!spec) return '';
  const friend = friendFor(characterId).name;
  const pro = pronounsFor(characterId);
  return (
    `\n\n=== DISRUPTION THIS TURN (engine event — weave it into your reply) ===\n` +
    `[${spec.kind}] ${spec.directive(displayName, friend, pro)}\n` +
    `Rules: it happens DURING this reply, woven in naturally — never ignore it, never treat it as the player's doing. ` +
    `It interrupts the moment but does not derail the scene unless the player engages withit. ` +
    `Do not resolve any tension it introduces this turn, and keep every established scene fact intact.`
  );
}

/**
 * Re-rolls the poolId for each unfired disruption using arc-tag weighting.
 * Call this when a new arc activates mid-scene so the remaining disruption
 * slots are biased toward thematically resonant moments.
 *
 * Weight formula: 1 + (2 × N) where N = intersecting tags with arcTags.
 */
export function rerollUnfiredDisruptions(
  disruptions: PlannedDisruption[],
  firedIds: Set<string>,
  arcTags: NarrativeTag[],
  opts: Pick<PlanOpts, 'phase' | 'hasFriend'>,
): PlannedDisruption[] {
  return disruptions.map((d) => {
    if (firedIds.has(d.id)) return d; // already fired â leave it
    const kind = d.kind;
    const pool = (kind === 'texture' ? TEXTURES : BEATS).filter(
      (s) =>
        (s.phase === 'any' || s.phase === opts.phase) &&
        (!s.requiresFriend || opts.hasFriend),
    );
    if (pool.length === 0) return d;
    const totalWeight = pool.reduce((sum, s) => {
      const overlap = s.tags.filter((t) => arcTags.includes(t)).length;
      return sum + 1 + 2 * overlap;
    }, 0);
    let roll = Math.random() * totalWeight;
    for (const spec of pool) {
      const overlap = spec.tags.filter((t) => arcTags.includes(t)).length;
      roll -= 1 + 2 * overlap;
      if (roll <= 0) return { ...d, poolId: spec.poolId };
    }
    return { ...d, poolId: pool[pool.length - 1].poolId };
  });
}

/** Durable memory text for beats (empty for texture). */
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
