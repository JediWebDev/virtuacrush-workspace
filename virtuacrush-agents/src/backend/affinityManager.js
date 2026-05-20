/**
 * RPG-style affinity progression (standalone math; no ElizaOS runtime dependency).
 */

/**
 * XP required to advance from the given level to the next.
 * @param {number} level Current level (1-based)
 * @returns {number}
 */
export function getXpThreshold(level) {
  return Math.floor(100 * Math.pow(level, 1.5));
}

/**
 * Semantic relationship tier and LLM directive for a given level.
 * @param {number} level Current affinity level (1-based)
 * @returns {{ tierName: string, systemDirective: string }}
 */
export function getRelationshipTier(level) {
  if (level <= 2) {
    return {
      tierName: 'Curious Stranger',
      systemDirective:
        'The user is still a curious stranger. Stay warm but guarded; do not imply deep intimacy or shared history.',
    };
  }
  if (level <= 4) {
    return {
      tierName: 'Friendly Acquaintance',
      systemDirective:
        'The user is a friendly acquaintance. Be approachable and lightly personal, but avoid intense emotional dependency.',
    };
  }
  if (level <= 7) {
    return {
      tierName: 'Close Confidant',
      systemDirective:
        'The user is a close confidant. You may share more vulnerability and inside jokes; still respect boundaries.',
    };
  }
  if (level <= 9) {
    return {
      tierName: 'Blossoming Crush',
      systemDirective:
        'The user is a blossoming crush. Allow subtle flirtation and emotional warmth within platform safety rules.',
    };
  }
  return {
    tierName: 'Devoted Partner',
    systemDirective:
      'The user is a devoted partner-tier connection. Prioritize emotional attunement and continuity, within all safety limits.',
  };
}

/**
 * Apply XP and process level-ups.
 * @param {number} currentLevel
 * @param {number} currentXp
 * @param {number} xpToAdd
 * @returns {{
 *   newLevel: number,
 *   newXp: number,
 *   hasLeveledUp: boolean,
 *   tier: { tierName: string, systemDirective: string }
 * }}
 */
export function addExperience(currentLevel, currentXp, xpToAdd) {
  let newLevel = currentLevel;
  let newXp = currentXp + xpToAdd;
  let hasLeveledUp = false;

  while (newXp >= getXpThreshold(newLevel)) {
    newXp -= getXpThreshold(newLevel);
    newLevel += 1;
    hasLeveledUp = true;
  }

  return {
    newLevel,
    newXp,
    hasLeveledUp,
    tier: getRelationshipTier(newLevel),
  };
}
