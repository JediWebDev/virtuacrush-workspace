// Unified read model for progression gates — engine consults this, not scattered DB calls.

import { getAffinity } from './affinity';
import { getArcState, getCompletedArcIds } from './arc_state';
import { hasCompletedMeetArc } from '../inworld/meet_arc';
import { AFFINITY_HOME_GATE, locationsForCharacter } from '../inworld/locations';
import { secretTrustProgress, SECRET_REVEAL_AFFINITY } from '../progression';

export interface ArcBadge {
  arcId: string;
  title: string;
  description: string;
}

export interface PlayerProgress {
  affinity: number;
  meetArcComplete: boolean;
  activeArcId: string | null;
  activeArcStartedAt: string | null;
  completedArcIds: string[];
  badges: ArcBadge[];
  unlockedVenueSlugs: string[];
  secretTrustPercent: number;
  canRevealSecret: boolean;
  canVisitCompanionHome: boolean;
}

export async function loadPlayerProgress(userId: string, characterId: string): Promise<PlayerProgress> {
  const [affinity, arcState, completedArcIds] = await Promise.all([
    getAffinity(userId, characterId),
    getArcState(userId, characterId),
    getCompletedArcIds(userId, characterId),
  ]);

  const meetArcComplete = hasCompletedMeetArc(characterId, completedArcIds);
  const unlockedVenueSlugs = locationsForCharacter(characterId)
    .filter((loc) => {
      if (loc.type === 'character_home' && loc.affinityRequired) {
        return affinity >= loc.affinityRequired;
      }
      return loc.type !== 'character_home' || loc.characterId === characterId;
    })
    .map((l) => l.slug);

  return {
    affinity,
    meetArcComplete,
    activeArcId: arcState.currentArcId,
    activeArcStartedAt: arcState.activeArcStartedAt ?? null,
    completedArcIds,
    badges: [], // populated by caller when badge rows needed; keep lean for hot path
    unlockedVenueSlugs,
    secretTrustPercent: secretTrustProgress(affinity),
    canRevealSecret: affinity >= SECRET_REVEAL_AFFINITY,
    canVisitCompanionHome: affinity >= AFFINITY_HOME_GATE,
  };
}
