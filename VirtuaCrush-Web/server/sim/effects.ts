// Groups the engine's Consequence[] into a flat EffectPlan the persistence layer
// can apply in one pass (summed affinity, collected bill items, arrest flag,
// narration-only warnings/responders). Pure + testable; execution lives in
// db/sim_apply.ts.
import type { Consequence } from './rules';

export interface EffectPlan {
  arrest: boolean;
  arrestReason?: string;
  affinityByNpc: Record<string, number>;
  billItems: { label: string; amount: number }[];
  warnings: string[];    // authority warnings (narration only)
  responders: string[];  // dispatched responders (narration only)
  moveTo?: string;       // requested user move (narration / future scene change)
}

export function planEffects(consequences: Consequence[]): EffectPlan {
  const plan: EffectPlan = { arrest: false, affinityByNpc: {}, billItems: [], warnings: [], responders: [] };
  for (const c of consequences) {
    switch (c.type) {
      case 'arrest':
        plan.arrest = true;
        plan.arrestReason = c.reason;
        break;
      case 'affinity':
        plan.affinityByNpc[c.npc] = (plan.affinityByNpc[c.npc] ?? 0) + c.delta;
        break;
      case 'bill_add':
        plan.billItems.push({ label: c.label, amount: c.amount });
        break;
      case 'authority_warn':
        plan.warnings.push(c.reason);
        break;
      case 'dispatch_responders':
        plan.responders.push(c.who);
        break;
      case 'move_user':
        plan.moveTo = c.to;
        break;
    }
  }
  return plan;
}
