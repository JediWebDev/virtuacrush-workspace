/**
 * NPC schema — friends, enemies, and bystanders for free roam, arcs, and CYOA.
 *
 * Single source of truth for stance/role metadata the backend retrieves and
 * injects into director prompts. Chaos-engine hooks: `chaosWeight` and
 * `canDisrupt` on each archetype (used later for disruptive selection).
 */
import type { NarrativeTag } from './arcs';
import type { SceneCastMember } from '../sim/scene_composer';

// ---------------------------------------------------------------------------
// Stances & bystander roles
// ---------------------------------------------------------------------------

export const NPC_STANCES = ['friend', 'enemy', 'bystander'] as const;
export type NpcStance = (typeof NPC_STANCES)[number];

export const BYSTANDER_ROLE_IDS = [
  'waiter',
  'bartender',
  'barista',
  'security_guard',
  'shop_clerk',
  'receptionist',
  'bouncer',
  'rideshare_driver',
  'valet',
  'concierge',
  'nurse',
  'stranger',
] as const;
export type BystanderRoleId = (typeof BYSTANDER_ROLE_IDS)[number];

export interface BystanderRoleDefinition {
  id: BystanderRoleId;
  label: string;
  /** Venue/setting keywords this role fits (restaurant, mall, cafe, …). */
  settingTags: readonly string[];
}

export const BYSTANDER_ROLES: Record<BystanderRoleId, BystanderRoleDefinition> = {
  waiter: { id: 'waiter', label: 'Waiter', settingTags: ['restaurant', 'diner', 'bistro', 'eatery'] },
  bartender: { id: 'bartender', label: 'Bartender', settingTags: ['bar', 'club', 'lounge', 'pub'] },
  barista: { id: 'barista', label: 'Barista', settingTags: ['cafe', 'coffee', 'bakery'] },
  security_guard: { id: 'security_guard', label: 'Security guard', settingTags: ['mall', 'museum', 'office', 'venue', 'store'] },
  shop_clerk: { id: 'shop_clerk', label: 'Shop clerk', settingTags: ['store', 'shop', 'boutique', 'market'] },
  receptionist: { id: 'receptionist', label: 'Receptionist', settingTags: ['hotel', 'office', 'clinic', 'lobby'] },
  bouncer: { id: 'bouncer', label: 'Bouncer', settingTags: ['club', 'bar', 'venue', 'line'] },
  rideshare_driver: { id: 'rideshare_driver', label: 'Rideshare driver', settingTags: ['car', 'ride', 'street', 'airport', 'drive'] },
  valet: { id: 'valet', label: 'Valet', settingTags: ['hotel', 'restaurant', 'garage', 'parking'] },
  concierge: { id: 'concierge', label: 'Concierge', settingTags: ['hotel', 'lobby', 'resort'] },
  nurse: { id: 'nurse', label: 'Nurse / medic', settingTags: ['hospital', 'clinic', 'emergency'] },
  stranger: { id: 'stranger', label: 'Passerby / stranger', settingTags: ['street', 'park', 'public', 'crowd', 'mall', 'store', 'shopping', 'gym', 'bookstore', 'comic_shop'] },
};

// ---------------------------------------------------------------------------
// Archetype catalog (starter pool — grow over time)
// ---------------------------------------------------------------------------

export interface NpcArchetypeDefinition {
  id: string;
  label: string;
  stance: NpcStance;
  /** Bystander-only role id. */
  roleId?: BystanderRoleId;
  /** Default behavior injected when no custom description is provided. */
  brief: string;
  settingTags?: readonly string[];
  narrativeTags?: readonly NarrativeTag[];
  /** 0–1 — higher = more likely to be picked as a chaos disruption later. */
  chaosWeight: number;
  /** When true, chaos engine may use this NPC as an active disruptor. */
  canDisrupt: boolean;
}

export const NPC_ARCHETYPES: NpcArchetypeDefinition[] = [
  {
    id: 'companion_best_friend',
    label: "Companion's best friend",
    stance: 'friend',
    brief: 'Protective, opinionated, zero filter — sizes the player up and backs the companion up (or teases them).',
    narrativeTags: ['friendship', 'social'],
    chaosWeight: 0.35,
    canDisrupt: true,
  },
  {
    id: 'wingman',
    label: 'Wingman / hype friend',
    stance: 'friend',
    brief: 'Encourages flirtation, makes jokes, tries to help the moment land — sometimes too hard.',
    narrativeTags: ['romance', 'friendship', 'social'],
    chaosWeight: 0.4,
    canDisrupt: true,
  },
  {
    id: 'loyal_sidekick',
    label: 'Loyal sidekick',
    stance: 'friend',
    brief: 'Follows the companion’s lead, chimes in with supportive one-liners, stays in the background unless asked.',
    narrativeTags: ['friendship'],
    chaosWeight: 0.2,
    canDisrupt: false,
  },
  {
    id: 'rival',
    label: 'Rival',
    stance: 'enemy',
    brief: 'Competitive, smug, tries to one-up the player or steal the companion’s attention.',
    narrativeTags: ['conflict', 'jealousy', 'romance'],
    chaosWeight: 0.75,
    canDisrupt: true,
  },
  {
    id: 'jealous_ex',
    label: 'Jealous ex',
    stance: 'enemy',
    brief: 'Still hung up on the companion; passive-aggressive, possessive, bad at boundaries.',
    narrativeTags: ['conflict', 'jealousy', 'romance'],
    chaosWeight: 0.8,
    canDisrupt: true,
  },
  {
    id: 'pushy_stranger',
    label: 'Pushy stranger',
    stance: 'enemy',
    brief: 'Ignores social cues, escalates quickly, creates friction the companion must react to.',
    narrativeTags: ['conflict', 'chaos', 'social'],
    chaosWeight: 0.85,
    canDisrupt: true,
  },
  {
    id: 'corporate_antagonist',
    label: 'Corporate antagonist',
    stance: 'enemy',
    brief: 'Cold, transactional, uses authority or bureaucracy to pressure the scene.',
    narrativeTags: ['work', 'conflict', 'stress'],
    chaosWeight: 0.55,
    canDisrupt: true,
  },
  {
    id: 'waiter_default',
    label: 'Waiter',
    stance: 'bystander',
    roleId: 'waiter',
    brief: 'Professional but human — takes orders, checks in, may overhear tension at the table.',
    settingTags: ['restaurant', 'diner', 'bistro'],
    narrativeTags: ['social'],
    chaosWeight: 0.25,
    canDisrupt: false,
  },
  {
    id: 'bartender_default',
    label: 'Bartender',
    stance: 'bystander',
    roleId: 'bartender',
    brief: 'Busy, dry wit, cuts off drunk patrons and eavesdrops just enough to matter.',
    settingTags: ['bar', 'club', 'pub'],
    narrativeTags: ['social', 'chaos'],
    chaosWeight: 0.45,
    canDisrupt: true,
  },
  {
    id: 'barista_default',
    label: 'Barista',
    stance: 'bystander',
    roleId: 'barista',
    brief: 'Rushed but friendly; remembers regulars, mishears names, creates small public moments.',
    settingTags: ['cafe', 'coffee'],
    narrativeTags: ['social'],
    chaosWeight: 0.2,
    canDisrupt: false,
  },
  {
    id: 'security_guard_default',
    label: 'Security guard',
    stance: 'bystander',
    roleId: 'security_guard',
    brief: 'By-the-book; watches for trouble, may intervene if the scene gets loud or suspicious.',
    settingTags: ['mall', 'museum', 'venue', 'store'],
    narrativeTags: ['conflict', 'chaos'],
    chaosWeight: 0.7,
    canDisrupt: true,
  },
  {
    id: 'rideshare_driver_default',
    label: 'Rideshare driver',
    stance: 'bystander',
    roleId: 'rideshare_driver',
    brief: 'Focused on the road; may comment on the vibe in the back seat or pull over if things escalate.',
    settingTags: ['car', 'ride', 'drive'],
    narrativeTags: ['social'],
    chaosWeight: 0.35,
    canDisrupt: true,
  },
  {
    id: 'shop_clerk_default',
    label: 'Shop clerk',
    stance: 'bystander',
    roleId: 'shop_clerk',
    brief: 'Helpful sales energy or dead-eyed retail — either way, a witness to awkward moments.',
    settingTags: ['store', 'shop', 'boutique'],
    narrativeTags: ['social', 'money'],
    chaosWeight: 0.3,
    canDisrupt: false,
  },
  {
    id: 'bouncer_default',
    label: 'Bouncer',
    stance: 'bystander',
    roleId: 'bouncer',
    brief: 'Controls access; can end a confrontation by removing someone from the venue.',
    settingTags: ['club', 'bar', 'line'],
    narrativeTags: ['conflict', 'chaos'],
    chaosWeight: 0.65,
    canDisrupt: true,
  },
  {
    id: 'passerby',
    label: 'Passerby',
    stance: 'bystander',
    roleId: 'stranger',
    brief: 'Ambient witness — may stare, comment, or accidentally insert themselves.',
    settingTags: ['street', 'park', 'public'],
    narrativeTags: ['social', 'chaos'],
    chaosWeight: 0.5,
    canDisrupt: true,
  },
];

const ARCHETYPE_BY_ID = new Map(NPC_ARCHETYPES.map((a) => [a.id, a]));

// ---------------------------------------------------------------------------
// Scene references (stored on arcs/packs; resolved at runtime)
// ---------------------------------------------------------------------------

/** Authoring shape — stored in user arc/pack specs or composed at runtime. */
export interface SceneNpcRef {
  name: string;
  stance: NpcStance;
  archetypeId?: string;
  roleId?: BystanderRoleId;
  /** Custom behavior; overrides archetype brief when present. */
  description?: string;
}

export interface ResolvedSceneNpc extends SceneNpcRef {
  label: string;
  roleLabel: string;
  promptBrief: string;
  narrativeTags: NarrativeTag[];
  chaosWeight: number;
  canDisrupt: boolean;
  speakerTag: string;
}

// ---------------------------------------------------------------------------
// Lookup & resolution
// ---------------------------------------------------------------------------

export function isNpcStance(v: unknown): v is NpcStance {
  return typeof v === 'string' && (NPC_STANCES as readonly string[]).includes(v);
}

export function isBystanderRoleId(v: unknown): v is BystanderRoleId {
  return typeof v === 'string' && (BYSTANDER_ROLE_IDS as readonly string[]).includes(v);
}

export function getNpcArchetype(id: string): NpcArchetypeDefinition | undefined {
  return ARCHETYPE_BY_ID.get(id);
}

export function listNpcArchetypes(opts?: {
  stance?: NpcStance;
  roleId?: BystanderRoleId;
  settingTag?: string;
}): NpcArchetypeDefinition[] {
  let pool = NPC_ARCHETYPES;
  if (opts?.stance) pool = pool.filter((a) => a.stance === opts.stance);
  if (opts?.roleId) pool = pool.filter((a) => a.roleId === opts.roleId);
  if (opts?.settingTag) {
    const tag = opts.settingTag.toLowerCase();
    pool = pool.filter(
      (a) => a.settingTags?.some((t) => tag.includes(t) || t.includes(tag)),
    );
  }
  return pool;
}

function roleLabelFor(ref: SceneNpcRef): string {
  if (ref.roleId && BYSTANDER_ROLES[ref.roleId]) return BYSTANDER_ROLES[ref.roleId].label;
  if (ref.stance === 'friend') return 'friend';
  if (ref.stance === 'enemy') return 'antagonist';
  return 'bystander';
}

/** Merge archetype defaults with an authored ref into a director-ready NPC. */
export function resolveSceneNpc(ref: SceneNpcRef): ResolvedSceneNpc {
  const archetype = ref.archetypeId ? getNpcArchetype(ref.archetypeId) : undefined;
  const custom = ref.description?.trim();
  const brief = custom || archetype?.brief || `${ref.name} is present in the scene.`;
  const roleLabel = roleLabelFor(ref);
  return {
    ...ref,
    stance: ref.stance ?? archetype?.stance ?? 'bystander',
    roleId: ref.roleId ?? archetype?.roleId,
    label: archetype?.label ?? roleLabel,
    roleLabel,
    promptBrief: brief,
    narrativeTags: [...(archetype?.narrativeTags ?? [])],
    chaosWeight: archetype?.chaosWeight ?? (ref.stance === 'enemy' ? 0.6 : 0.25),
    canDisrupt: archetype?.canDisrupt ?? ref.stance === 'enemy',
    speakerTag: ref.name.trim().toUpperCase(),
  };
}

export function resolveSceneNpcs(refs: SceneNpcRef[]): ResolvedSceneNpc[] {
  return refs.filter((r) => r.name?.trim()).map(resolveSceneNpc);
}

/** Maps free-roam scene composer cast (companion's friend) into the NPC schema. */
export function sceneCastToNpcRefs(cast: SceneCastMember[]): SceneNpcRef[] {
  return cast.map((m) => ({
    name: m.name,
    stance: 'friend' as const,
    archetypeId: 'companion_best_friend',
    description: `${m.role} — ${m.vibe}. Right now: ${m.agenda}`,
  }));
}

/** Pick a bystander archetype whose setting tags match the scene text. */
export function suggestBystanderForSetting(
  settingText: string,
  r: () => number = Math.random,
): ResolvedSceneNpc | null {
  const lower = settingText.toLowerCase();
  const matches = listNpcArchetypes({ stance: 'bystander' }).filter((a) =>
    a.settingTags?.some((t) => lower.includes(t)),
  );
  if (!matches.length) return null;
  const pick = matches[Math.floor(r() * matches.length)]!;
  const role = pick.roleId ? BYSTANDER_ROLES[pick.roleId] : null;
  return resolveSceneNpc({
    name: role?.label ?? pick.label,
    stance: 'bystander',
    archetypeId: pick.id,
    roleId: pick.roleId,
  });
}

/** NPCs eligible for chaos-engine disruption (canDisrupt + optional tag filter). */
export function disruptiveNpcs(
  npcs: ResolvedSceneNpc[],
  tags?: NarrativeTag[],
): ResolvedSceneNpc[] {
  let pool = npcs.filter((n) => n.canDisrupt);
  if (tags?.length) {
    pool = pool.filter((n) => n.narrativeTags.some((t) => tags.includes(t)));
  }
  return pool.sort((a, b) => b.chaosWeight - a.chaosWeight);
}

// ---------------------------------------------------------------------------
// Prompt injection (free roam, arcs, CYOA)
// ---------------------------------------------------------------------------

const STANCE_DIRECTIVE: Record<NpcStance, string> = {
  friend: 'Allied with the companion — may tease the player but is not hostile to them by default.',
  enemy: 'Antagonistic — creates friction, rivalry, or pressure; the companion should react in character.',
  bystander: 'Neutral venue staff or ambient cast — professional unless provoked; may witness or lightly intervene.',
};

/** Engine block listing who else is in the scene and how to voice them. */
export function formatSceneNpcBlock(npcs: ResolvedSceneNpc[]): string {
  if (!npcs.length) return '';
  const lines = npcs.map((n) => {
    const rolePart = n.roleId ? `${n.roleLabel} (${n.roleId})` : n.roleLabel;
    const chaos = n.canDisrupt ? ` chaos=${n.chaosWeight.toFixed(2)}` : '';
    return (
      `- ${n.name} [${n.speakerTag}] — stance: ${n.stance.toUpperCase()} (${rolePart}). ` +
      `${STANCE_DIRECTIVE[n.stance]} ${n.promptBrief}${chaos ? ` ·${chaos}` : ''}`
    );
  });
  return (
    `\n\n=== SCENE NPCs (engine — voice via tagged lines; do not rename or drop without a narrator transition) ===\n` +
    lines.join('\n') +
    `\nUse [${npcs.map((n) => n.speakerTag).join('] / [')}] for their spoken dialogue; narrator owns all actions.`
  );
}

/** Compact speaker roster for director actor lists. */
export function npcsToSpeakerBriefs(npcs: ResolvedSceneNpc[]): string[] {
  return npcs.map(
    (n) => `- "${n.name}" — ${n.promptBrief} Speaks only their own words; actions are narrated by "narrator".`,
  );
}

/** Payload for Studio vocabulary API and future authoring UI. */
export function npcVocabularyPayload() {
  return {
    stances: NPC_STANCES.map((s) => ({
      id: s,
      label: s.charAt(0).toUpperCase() + s.slice(1),
    })),
    bystanderRoles: BYSTANDER_ROLE_IDS.map((id) => ({
      id,
      label: BYSTANDER_ROLES[id].label,
      settingTags: [...BYSTANDER_ROLES[id].settingTags],
    })),
    archetypes: NPC_ARCHETYPES.map((a) => ({
      id: a.id,
      label: a.label,
      stance: a.stance,
      roleId: a.roleId ?? null,
      brief: a.brief,
      settingTags: a.settingTags ? [...a.settingTags] : [],
      narrativeTags: a.narrativeTags ? [...a.narrativeTags] : [],
      chaosWeight: a.chaosWeight,
      canDisrupt: a.canDisrupt,
    })),
  };
}

/** Parse raw JSON npc entries from user-authored specs. */
export function parseSceneNpcRefs(raw: unknown, max = 8): SceneNpcRef[] {
  if (!Array.isArray(raw)) return [];
  const out: SceneNpcRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, 40) : '';
    if (!name) continue;
    const stanceRaw = typeof o.stance === 'string' ? o.stance.trim() : '';
    const stance: NpcStance = isNpcStance(stanceRaw) ? stanceRaw : 'bystander';
    const roleId = isBystanderRoleId(o.roleId) ? o.roleId : undefined;
    const archetypeId = typeof o.archetypeId === 'string' ? o.archetypeId.trim().slice(0, 48) : undefined;
    const description = typeof o.description === 'string' ? o.description.trim().slice(0, 600) : undefined;
    out.push({
      name,
      stance,
      ...(archetypeId ? { archetypeId } : {}),
      ...(roleId ? { roleId } : {}),
      ...(description ? { description } : {}),
    });
    if (out.length >= max) break;
  }
  return out;
}

/** Legacy pack npc { name, description } → structured ref. */
export function legacyPackNpcToRef(raw: {
  name: string;
  description: string;
  stance?: NpcStance;
  archetypeId?: string;
  roleId?: BystanderRoleId;
}): SceneNpcRef {
  const desc = raw.description?.trim() ?? '';
  const hostile = /\b(jealous|rival|pushy|antagon|enemy|hostile|confront|crush|ex\b|toxic|threat)/i.test(desc);
  return {
    name: raw.name.trim(),
    stance: raw.stance ?? (hostile ? 'enemy' : 'bystander'),
    ...(raw.archetypeId ? { archetypeId: raw.archetypeId } : hostile ? { archetypeId: 'rival' } : {}),
    ...(raw.roleId ? { roleId: raw.roleId } : {}),
    description: desc,
  };
}

/** Merge cast + authored + setting-suggested NPCs (deduped by name). */
export function mergeSceneNpcs(
  parts: ResolvedSceneNpc[][],
): ResolvedSceneNpc[] {
  const seen = new Set<string>();
  const out: ResolvedSceneNpc[] = [];
  for (const list of parts) {
    for (const n of list) {
      const key = n.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(n);
    }
  }
  return out;
}

/** Resolve StoryPack.npcs (built-in JSON or user pack) for prompts. */
export function resolvePackNpcsFromStory(pack: { npcs?: Array<{ name: string; description: string; stance?: NpcStance; archetypeId?: string; roleId?: BystanderRoleId }> }): ResolvedSceneNpc[] {
  if (!pack.npcs?.length) return [];
  return resolveSceneNpcs(pack.npcs.map(legacyPackNpcToRef));
}
