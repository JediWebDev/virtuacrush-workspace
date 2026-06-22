// Unified read model for progression gates — engine consults this, not scattered DB calls.

import { getAffinity } from './affinity';
import { getArcState, getCompletedArcIds, type ArcState } from './arc_state';
import { hasCompletedMeetArc } from '../inworld/meet_arc';
import { AFFINITY_HOME_GATE, locationsForCharacter } from '../inworld/locations';
import { secretTrustProgress, SECRET_REVEAL_AFFINITY } from '../progression';
import { pool } from './pool';
import { getArc, type StoryArc } from '../inworld/arcs';
import { getUserStory } from './user_stories';

export interface ArcBadge {
  arcId: string;
  title: string;
  description: string;
  completedAt?: string;
}

export interface ActiveQuest {
  arcId: string;
  title: string;
  completionCriteria: string;
  tone: StoryArc['tone'];
  isMeetArc: boolean;
}

export interface PlayerProgressDetail extends PlayerProgress {
  badges: ArcBadge[];
  quest: ActiveQuest | null;
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
    completedArcIds: [...completedArcIds],
    badges: [],
    unlockedVenueSlugs,
    secretTrustPercent: secretTrustProgress(affinity),
    canRevealSecret: affinity >= SECRET_REVEAL_AFFINITY,
    canVisitCompanionHome: affinity >= AFFINITY_HOME_GATE,
  };
}

export async function loadArcBadges(userId: string, characterId: string): Promise<ArcBadge[]> {
  const { rows } = await pool.query<{ arc_id: string; badge_title: string; badge_description: string; completed_at: Date }>(
    `SELECT arc_id, badge_title, badge_description, completed_at
       FROM arc_completions
      WHERE user_id = $1 AND character_id = $2
      ORDER BY completed_at DESC`,
    [userId, characterId],
  );
  return rows.map((r) => ({
    arcId: r.arc_id,
    title: r.badge_title,
    description: r.badge_description,
    completedAt: r.completed_at?.toISOString(),
  }));
}

async function resolveActiveQuest(
  userId: string,
  arcState: ArcState,
): Promise<ActiveQuest | null> {
  if (!arcState.currentArcId) return null;
  const arcId = arcState.currentArcId;
  if (arcId.startsWith('user:')) {
    const story = await getUserStory(arcId.slice('user:'.length));
    if (!story) return null;
    return {
      arcId,
      title: story.title,
      completionCriteria:
        (typeof story.spec?.completionCriteria === 'string' && story.spec.completionCriteria) ||
        story.blurb ||
        'Complete the story arc.',
      tone: 'dramatic',
      isMeetArc: false,
    };
  }
  const arc = getArc(arcId);
  if (!arc) return null;
  return {
    arcId,
    title: arc.id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    completionCriteria: arc.completionCriteria,
    tone: arc.tone,
    isMeetArc: !!arc.isMeetArc,
  };
}

/** Full progress + quest journal data for HUD / map / actions UI. */
export async function loadPlayerProgressDetail(
  userId: string,
  characterId: string,
): Promise<PlayerProgressDetail> {
  const [base, arcState, badges] = await Promise.all([
    loadPlayerProgress(userId, characterId),
    getArcState(userId, characterId),
    loadArcBadges(userId, characterId),
  ]);
  const quest = await resolveActiveQuest(userId, arcState);
  return { ...base, badges, quest };
}
