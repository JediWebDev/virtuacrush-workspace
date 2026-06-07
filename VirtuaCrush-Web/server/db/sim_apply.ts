// Executes an EffectPlan against persisted state, reusing the existing jail /
// affinity / bill helpers. This is the only place consequences become real;
// the planning that produced the plan is pure (sim/effects.ts).
import type { EffectPlan } from '../sim/effects';
import { arrestUser, appendIncident } from './state';
import { incrementAffinity } from './affinity';
import { jailEndFrom } from './jail_util';

export interface ApplyResult {
  affinityScore: number | null; // companion's new affinity (for the done event)
  arrested: boolean;
}

export async function applyEffects(
  userId: string,
  companionId: string,
  plan: EffectPlan,
): Promise<ApplyResult> {
  if (plan.arrest) {
    await arrestUser(userId, companionId, jailEndFrom());
  }

  let companionScore: number | null = null;
  for (const [npcId, delta] of Object.entries(plan.affinityByNpc)) {
    if (!delta) continue;
    const score = await incrementAffinity(userId, npcId, delta);
    if (npcId === companionId) companionScore = score;
  }

  // Bill line items accrue on the current date (settled via the End-date flow).
  // Skip when arrested — the date is over, there is no tab to settle.
  if (!plan.arrest) {
    for (const item of plan.billItems) {
      if (item.amount > 0) {
        await appendIncident(userId, companionId, { kind: 'spend', label: item.label, amount: item.amount });
      }
    }
  }

  return { affinityScore: companionScore, arrested: plan.arrest };
}
