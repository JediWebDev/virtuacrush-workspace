export type PlayerActionCategory = 'scene' | 'travel' | 'inventory';

export interface PlayerAction {
  id: string;
  label: string;
  category: PlayerActionCategory;
  hint?: string;
  disabled?: boolean;
  disabledReason?: string;
}

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
  tone: 'light' | 'serious' | 'romantic' | 'dramatic';
  isMeetArc: boolean;
}

export interface PlayerProgressDetail {
  affinity: number;
  meetArcComplete: boolean;
  activeArcId: string | null;
  unlockedVenueSlugs: string[];
  secretTrustPercent: number;
  canRevealSecret: boolean;
  canVisitCompanionHome: boolean;
  badges: ArcBadge[];
  quest: ActiveQuest | null;
}

export interface MapLocationPin {
  slug: string;
  name: string;
  shortName: string;
  mapX: number;
  mapY: number;
  zone: string;
  locked: boolean;
  current: boolean;
}

export interface ProgressPayload {
  progress: PlayerProgressDetail;
  actions: PlayerAction[];
  mapLocations: MapLocationPin[];
  currentVenueSlug: string | null;
}
