// Executes an EffectPlan against persisted state, reusing the existing
// affinity helpers. This is the only place consequences become real;
// the planning that produced the plan is pure (sim/effects.ts).
import type { EffectPlan } from '../sim/effects';
import { incrementAffinity } from './affinity';

export interface ApplyResult {
  affinityScore: number | null; // companion's new affinity (for the done event)
}

export async function applyEffects(
  userId: string,
  companionId: string,
  plan: EffectPlan,
): Promise<ApplyResult> {
  let companionScore: number | null = null;
  for (const [npcId, delta] of Object.entries(plan.affinityByNpc)) {
    if (!delta) continue;
    const score = await incrementAffinity(userId, npcId, delta);
    if (npcId === companionId) companionScore = score;
  }
  return { affinityScore: companionScore };
}
