// Groups the engine's Consequence[] into a flat EffectPlan the persistence layer
// can apply in one pass (summed affinity, narration-only warnings/responders).
// Pure + testable; execution lives in db/sim_apply.ts.
import type { Consequence } from './rules';

export interface EffectPlan {
  affinityByNpc: Record<string, number>;
  warnings: string[];    // authority warnings (narration only)
  responders: string[];  // dispatched responders (narration only)
  moveTo?: string;       // requested user move (narration / future scene change)
}

/** Prompt block injected before the Director narrates engine-mandated reactions. */
export function formatEngineFactsBlock(plan: EffectPlan, authority = 'venue security'): string {
  const lines: string[] = [];
  for (const w of plan.warnings) {
    lines.push(`${authority} steps in with a firm warning about ${w.replace(/_/g, ' ')}.`);
  }
  for (const r of plan.responders) {
    lines.push(`${r} arrive on scene.`);
  }
  if (lines.length === 0) return '';
  return (
    `\n\nENGINE-MANDATED WORLD REACTIONS (you MUST narrate these in the scene — they are not optional):\n` +
    lines.map((l) => `- ${l}`).join('\n')
  );
}

export function planEffects(consequences: Consequence[]): EffectPlan {
  const plan: EffectPlan = { affinityByNpc: {}, warnings: [], responders: [] };
  for (const c of consequences) {
    switch (c.type) {
      case 'affinity':
        plan.affinityByNpc[c.npc] = (plan.affinityByNpc[c.npc] ?? 0) + c.delta;
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
