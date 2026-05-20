import type { Plugin } from '@elizaos/core';
import { psychologicalEvaluator } from './evaluator.ts';

export const affinityPlugin: Plugin = {
  name: 'virtuacrush-affinity',
  description: 'RPG-style user–character affinity progression via psychological message classification',
  evaluators: [psychologicalEvaluator],
};

export default affinityPlugin;
