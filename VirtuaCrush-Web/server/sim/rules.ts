// Layer 2: the engine. Maps a classified+normalized intent to CONSEQUENCES,
// switching on the closed category then the (canonical) subtype, with a safe
// default per category. Sole authority over what actions mean. Pure + testable.
import type { PlayerIntent } from './intent';
import type { WorldState } from './world';

export type Consequence =
  | { type: 'affinity'; npc: string; delta: number; reason: string }
  | { type: 'move_user'; to: string }
  | { type: 'authority_warn'; reason: string }
  | { type: 'dispatch_responders'; who: string };

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

export function consequencesFor(intent: PlayerIntent, world: WorldState): Consequence[] {
  const companion = world.scene.companionId;
  const target = intent.target ?? companion;

  switch (intent.type) {
    case 'conflict': {
      const c = CONFLICT[intent.subtype] ?? { delta: -1, warn: false };
      const cs: Consequence[] = [{ type: 'affinity', npc: target, delta: c.delta, reason: intent.subtype }];
      if (c.warn) cs.push({ type: 'authority_warn', reason: intent.subtype });
      return cs;
    }

    case 'social':
      return [{ type: 'affinity', npc: target, delta: SOCIAL_AFFINITY[intent.subtype] ?? 0.3, reason: intent.subtype }];

    case 'romance':
      return [{ type: 'affinity', npc: target, delta: ROMANCE_AFFINITY[intent.subtype] ?? 0.6, reason: intent.subtype }];

    case 'transaction': {
      if (intent.subtype === 'gift') {
        return [{ type: 'affinity', npc: target, delta: 1.5, reason: 'gift' }];
      }
      if (intent.subtype === 'tip') return [{ type: 'affinity', npc: target, delta: 0.3, reason: 'tip' }];
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
