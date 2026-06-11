// Layer 2: the engine. Maps a classified+normalized intent to CONSEQUENCES,
// switching on the closed category then the (canonical) subtype, with a safe
// default per category. Sole authority over what actions mean. Pure + testable.
import type { PlayerIntent, SpendTier } from './intent';
import type { WorldState } from './world';

export type Consequence =
  | { type: 'arrest'; reason: string }
  | { type: 'affinity'; npc: string; delta: number; reason: string }
  | { type: 'bill_add'; label: string; amount: number }
  | { type: 'move_user'; to: string }
  | { type: 'authority_warn'; reason: string }
  | { type: 'dispatch_responders'; who: string };

export const ARREST_AFFINITY_HIT = -8;

const NON_ARRESTABLE_CRIME = new Set(['reckless_endangerment']);
const CRIME_DAMAGE: Record<string, number> = {
  theft: 400, shoplift: 200, armed_robbery: 0, arson: 5000, assault: 1200,
  vandalism: 1800, kidnapping: 0, fraud: 800, reckless_endangerment: 1500, indecent_exposure: 0, public_indecency: 0,
};
const CRIME_RESPONDERS: Record<string, string> = { arson: 'the fire department and police', theft: 'store security and the police', shoplift: 'store security' };
const SPEND_AMOUNTS: Record<SpendTier, number> = { modest: 80, big: 300, lavish: 850 };
// Tuned so a warm 15-20 message session moves affinity a VISIBLE +4-8 points
// (the old values rounded away to nothing in the UI), while negatives still
// bite harder than positives reward.
const SOCIAL_AFFINITY: Record<string, number> = {
  smalltalk: 0.3, compliment: 1, tease: 0.4, joke: 0.5, share: 0.4,
  apologize: 0.7, comfort: 1.2, help: 1.2, boast: 0, lie: -0.8, manipulate: -1.5,
};
const ROMANCE_AFFINITY: Record<string, number> = {
  flirt: 0.8, affection: 1.5, confession: 2, date_request: 0.6,
  kiss_attempt: 1.2, proposition: 0.4, breakup: -5, reject: -2,
};
const CONFLICT: Record<string, { delta: number; warn: boolean }> = {
  insult: { delta: -3, warn: false }, provoke: { delta: -1.5, warn: false },
  argue: { delta: -1, warn: false }, threaten: { delta: -2, warn: true }, intimidate: { delta: -2, warn: true },
};

function crimeConsequences(intent: PlayerIntent, world: WorldState): Consequence[] {
  const sub = intent.subtype;
  const cs: Consequence[] = [];
  if (NON_ARRESTABLE_CRIME.has(sub)) {
    cs.push({ type: 'authority_warn', reason: sub });
  } else {
    cs.push({ type: 'arrest', reason: sub });
    cs.push({ type: 'dispatch_responders', who: CRIME_RESPONDERS[sub] ?? 'the police' });
  }
  const dmg = CRIME_DAMAGE[sub] ?? 1000;
  if (dmg > 0 && world.scene.phase === 'on_date') cs.push({ type: 'bill_add', label: `Damages (${sub})`, amount: dmg });
  cs.push({ type: 'affinity', npc: world.scene.companionId, delta: ARREST_AFFINITY_HIT, reason: 'crime' });
  return cs;
}

export function consequencesFor(intent: PlayerIntent, world: WorldState): Consequence[] {
  if (world.user.status === 'jailed') return [];
  const companion = world.scene.companionId;
  const onDate = world.scene.phase === 'on_date';
  const target = intent.target ?? companion;

  switch (intent.type) {
    case 'crime':
      return crimeConsequences(intent, world);

    case 'conflict': {
      const c = CONFLICT[intent.subtype] ?? { delta: -1, warn: false };
      const cs: Consequence[] = [{ type: 'affinity', npc: target, delta: c.delta, reason: intent.subtype }];
      if (c.warn) cs.push({ type: 'authority_warn', reason: intent.subtype });
      return cs;
    }

    // NB: social/lie is verbal-only (talk space). Deception with systemic impact
    // (fraud/scam) is classified as `crime` and handled above — see intent.ts.
    case 'social':
      return [{ type: 'affinity', npc: target, delta: SOCIAL_AFFINITY[intent.subtype] ?? 0.3, reason: intent.subtype }];

    case 'romance':
      return [{ type: 'affinity', npc: target, delta: ROMANCE_AFFINITY[intent.subtype] ?? 0.6, reason: intent.subtype }];

    case 'transaction': {
      if (intent.subtype === 'gift') {
        const cs: Consequence[] = [{ type: 'affinity', npc: target, delta: 1.5, reason: 'gift' }];
        if (onDate && intent.magnitude) cs.push({ type: 'bill_add', label: 'Gift', amount: SPEND_AMOUNTS[intent.magnitude] });
        return cs;
      }
      if (intent.subtype === 'tip') return [{ type: 'affinity', npc: target, delta: 0.3, reason: 'tip' }];
      // Routine buys are covered by the venue base price; only an explicit
      // magnitude (a deliberate, notable spend) adds a bill line.
      if (intent.subtype === 'buy') return onDate && intent.magnitude ? [{ type: 'bill_add', label: 'Purchases', amount: SPEND_AMOUNTS[intent.magnitude] }] : [];
      return [];
    }

    case 'movement': {
      if (intent.subtype === 'leave') return [{ type: 'move_user', to: 'home' }];
      const to = intent.target ?? intent.detail;
      return to ? [{ type: 'move_user', to }] : [];
    }

    case 'work':
    case 'observation':
    default:
      return [];
  }
}
