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
  theft: 250, shoplift: 120, armed_robbery: 0, arson: 1500, assault: 400,
  vandalism: 600, kidnapping: 0, fraud: 300, reckless_endangerment: 120,
};
const CRIME_RESPONDERS: Record<string, string> = { arson: 'the fire department and police', theft: 'store security and the police', shoplift: 'store security' };
const SPEND_AMOUNTS: Record<SpendTier, number> = { modest: 80, big: 300, lavish: 850 };
const SOCIAL_AFFINITY: Record<string, number> = {
  smalltalk: 0.2, compliment: 0.6, tease: 0.2, joke: 0.3, share: 0.2,
  apologize: 0.5, comfort: 0.8, help: 0.8, boast: 0, lie: -0.5, manipulate: -1,
};
const ROMANCE_AFFINITY: Record<string, number> = {
  flirt: 0.5, affection: 1, confession: 1.5, date_request: 0.3,
  kiss_attempt: 0.8, proposition: 0.3, breakup: -3, reject: -1,
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
  const dmg = CRIME_DAMAGE[sub] ?? 200;
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

    case 'social':
      return [{ type: 'affinity', npc: target, delta: SOCIAL_AFFINITY[intent.subtype] ?? 0.2, reason: intent.subtype }];

    case 'romance':
      return [{ type: 'affinity', npc: target, delta: ROMANCE_AFFINITY[intent.subtype] ?? 0.3, reason: intent.subtype }];

    case 'transaction': {
      if (intent.subtype === 'gift') {
        const cs: Consequence[] = [{ type: 'affinity', npc: target, delta: 1.5, reason: 'gift' }];
        if (onDate && intent.magnitude) cs.push({ type: 'bill_add', label: 'Gift', amount: SPEND_AMOUNTS[intent.magnitude] });
        return cs;
      }
      if (intent.subtype === 'tip') return [{ type: 'affinity', npc: target, delta: 0.3, reason: 'tip' }];
      if (intent.subtype === 'buy') return onDate ? [{ type: 'bill_add', label: 'Purchases', amount: SPEND_AMOUNTS[intent.magnitude ?? 'modest'] }] : [];
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
