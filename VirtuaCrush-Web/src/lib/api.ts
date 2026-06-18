// Thin fetch wrapper that includes credentials (for Better Auth cookies)
// and throws structured errors the UI can switch on.
const BASE = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(public status: number, public body: any) {
    super(typeof body === 'string' ? body : body?.error ?? 'api error');
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
  const body = res.headers.get('content-type')?.includes('application/json')
    ? await res.json()
    : await res.text();
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export async function fetchGreeting(
  characterId: string,
): Promise<{
  hasHistory: boolean;
  greeting?: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  /** VN-style opening narration composed by the scene engine. */
  sceneHeader?: string;
}> {
  const res = await fetch('/api/chat/greet', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ characterId }),
  });
  if (!res.ok) throw new Error('greet_failed');
  return res.json();
}

export interface ChatHistoryDay {
  id: string;
  day: string; // YYYY-MM-DD
  title: string | null;
  lastRole: 'user' | 'assistant';
  lastMessage: string;
  messageCount: number;
}

export function fetchChatHistory(characterId: string): Promise<{ days: ChatHistoryDay[] }> {
  return api<{ days: ChatHistoryDay[] }>(`/api/chat/history/${characterId}`);
}

/**
 * URL for an image/media object served from the R2 bucket via the server's
 * asset proxy (falls back to bundled /public files when the object is
 * missing). Example: assetUrl('scenes/coffee_shop.jpg')
 */
export function assetUrl(key: string): string {
  return `${BASE}/api/assets/${key.replace(/^\/+/, '')}`;
}
export interface CharacterState {
  characterId: string;
  activity: string;
  mood: string;
  headline: string;
  goalProgress: number;
  goal: string;
  secret?: { label: string; discovered: boolean; reveal: string | null; progress?: number };
  drives?: { key: string; label: string; value: number }[];
  pendingEvent?: { drive: string; prompt: string; options: { id: string; label: string }[] } | null;
  /** Current travel location slug (null = player is at home / remote chat). */
  sceneLocation?: string | null;
}

// Current story-engine state (what the character is "doing" today) for the
// status strip above the chat. Lazily generated server-side on a new day.
export async function fetchCharacterState(characterId: string): Promise<CharacterState> {
  return api<CharacterState>(`/api/state/${encodeURIComponent(characterId)}`);
}

/** The persisted affinity score (0-100) for this character. Loaded on chat open
 *  so the bar shows real progress immediately instead of 0 until the first reply. */
export async function fetchAffinity(characterId: string): Promise<number> {
  const res = await api<{ characterId: string; score: number }>(
    `/api/affinity/${encodeURIComponent(characterId)}`,
  );
  return typeof res.score === 'number' ? res.score : 0;
}

// Respond to a surfaced desire event (encourage / redirect / decline).
export async function respondToDesire(
  characterId: string,
  choice: 'encourage' | 'redirect' | 'decline',
): Promise<{ ok: boolean; affinity?: number; moodHint?: string }> {
  return api(`/api/desire/${encodeURIComponent(characterId)}/respond`, {
    method: 'POST',
    body: JSON.stringify({ choice }),
  });
}

// --- Dynamic social posts ----------------------------------------------------

export interface DynamicPost {
  id: string;
  text: string;
  createdAt: string;
  /** Curated posts (synced from the R2 bucket) carry an image. */
  imageUrl?: string | null;
}

export async function fetchDynamicPosts(characterId: string): Promise<DynamicPost[]> {
  const res = await api<{ posts: DynamicPost[] }>(`/api/posts/${encodeURIComponent(characterId)}`);
  return res.posts;
}

// --- Chat diary ----------------------------------------------------------------

export interface DiaryEntry {
  id: string;
  beat: string;
  createdAt: string;
}

/** Story-so-far beats for this user/character (newest first). */
export async function fetchDiary(characterId: string): Promise<DiaryEntry[]> {
  const res = await api<{ entries: DiaryEntry[] }>(`/api/diary/${encodeURIComponent(characterId)}`);
  return res.entries;
}

// --- Usage / subscription -------------------------------------------------------

export interface UsageInfo {
  subscribed: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
}

/** Daily message usage + subscription state for the signed-in user. */
export function fetchUsage(): Promise<UsageInfo> {
  return api<UsageInfo>('/api/usage');
}
// ============================================================================
// Story Packs
// ============================================================================

export interface PackMeta {
  id: string;
  characterId: string;
  title: string;
  blurb: string;
  tags: string[];
  mood:
    | 'romantic'
    | 'dramatic'
    | 'comedic'
    | 'thriller'
    | 'mystery'
    | 'playful'
    | 'cozy'
    | 'gothic'
    | 'tense';
  estimatedMinutes: number;
  coverGradient: [string, string];
}

export interface PackChoice {
  id: string;
  label: string;
  next: string;
  userMessage: string;
}

export interface PackSession {
  sessionId: number;
  packId: string;
  characterId: string;
  currentNode: string;
  choices: PackChoice[] | null;
  pack: PackMeta | null;
}

export interface PackGreetResult {
  hasHistory: boolean;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  introNarrative?: string | null;
  choices: PackChoice[] | null;
  currentNode: string;
  pack: PackMeta;
}

export async function listPacks(characterId: string): Promise<PackMeta[]> {
  const res = await api<{ packs: PackMeta[] }>(`/api/packs?characterId=${encodeURIComponent(characterId)}`);
  return res.packs;
}

export async function startPack(packId: string): Promise<PackSession & { introNarrative?: string | null }> {
  return api<PackSession & { introNarrative?: string | null }>(`/api/packs/${encodeURIComponent(packId)}/start`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function getPackSession(sessionId: number): Promise<PackSession> {
  return api<PackSession>(`/api/packs/session/${sessionId}`);
}

export async function greetPackSession(sessionId: number): Promise<PackGreetResult> {
  return api<PackGreetResult>(`/api/packs/session/${sessionId}/greet`);
}

export async function getActivePackSession(characterId: string): Promise<PackSession | null> {
  const res = await api<{ session: PackSession | null }>(`/api/packs/active?characterId=${encodeURIComponent(characterId)}`);
  return res.session;
}

export async function abandonPackSession(sessionId: number): Promise<void> {
  await api<{ ok: boolean }>(`/api/packs/session/${sessionId}/abandon`, { method: 'POST', body: JSON.stringify({}) });
}

export interface PackStory {
  sessionId: number;
  packId: string;
  title: string;
  blurb: string | null;
  completedAt: string | null;
  lastLine: string | null;
}

/** Completed story sessions for the chat-history panel. */
export async function fetchPackStories(characterId: string): Promise<PackStory[]> {
  const res = await api<{ stories: PackStory[] }>(`/api/packs/history?characterId=${encodeURIComponent(characterId)}`);
  return res.stories;
}

/** Full message transcript for a story session (read-only viewing). */
export async function fetchPackTranscript(
  sessionId: number,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const res = await api<{ messages: Array<{ role: 'user' | 'assistant'; content: string }> }>(
    `/api/packs/session/${sessionId}/transcript`,
  );
  return res.messages;
}

// ============================================================================
// Story Studio (user-authored arcs)
// ============================================================================

export interface StudioStory {
  id: string;
  characterId: string;
  title: string;
  blurb: string;
  format: 'arc' | 'pack';
  spec: Record<string, unknown>;
  visibility: 'private' | 'public';
  moderationStatus: 'pending' | 'approved' | 'rejected';
  moderationReason?: string | null;
  creatorName?: string | null;
  copyCount?: number;
  createdAt: string;
}

export interface StudioArcInput {
  characterId: string;
  title: string;
  blurb?: string;
  setting: string;
  situation: string;
  coPresent?: boolean;
  playerSituation?: string;
  introNarrative?: string;
  npcInstruction: string;
  /** Optional act-specific companion behavior. */
  beginningInstruction?: string;
  middleInstruction?: string;
  endInstruction?: string;
  completionCriteria: string;
  completionExamples?: string[];
  tone?: 'light' | 'serious' | 'romantic' | 'dramatic';
  arcTags?: string[];
}

export async function createStudioStory(input: StudioArcInput): Promise<StudioStory> {
  const res = await api<{ story: StudioStory }>(`/api/studio/stories`, {
    method: 'POST',
    body: JSON.stringify({ format: 'arc', ...input }),
  });
  return res.story;
}

export async function listStudioStories(characterId?: string): Promise<StudioStory[]> {
  const q = characterId ? `?characterId=${encodeURIComponent(characterId)}` : '';
  const res = await api<{ stories: StudioStory[] }>(`/api/studio/stories${q}`);
  return res.stories;
}

export async function deleteStudioStory(id: string): Promise<void> {
  await api<{ ok: boolean }>(`/api/studio/stories/${id}`, { method: 'DELETE' });
}

/** Activates a user arc for its character's chat; returns the character + intro. */
export async function playStudioStory(id: string): Promise<{ characterId: string; introNarrative: string }> {
  const res = await api<{ ok: boolean; characterId: string; introNarrative: string }>(
    `/api/studio/stories/${id}/play`,
    { method: 'POST', body: JSON.stringify({}) },
  );
  return { characterId: res.characterId, introNarrative: res.introNarrative };
}

// --- Custom characters (Phase 2) -------------------------------------------

export interface StudioCharacter {
  id: string;            // DB id (string number); chat ref is `user:<id>`
  displayName: string;
  core: string;
  greeting: string;
  secret: string | null;
  tone: string | null;
  visibility: 'private' | 'public';
  moderationStatus: 'pending' | 'approved' | 'rejected';
  moderationReason?: string | null;
  creatorName?: string | null;
  copyCount?: number;
  imageKey?: string | null;
  createdAt: string;
}

export interface StudioCharacterInput {
  displayName: string;
  core: string;
  greeting?: string;
  secret?: string;
  tone?: string;
}

/** The chat/route id for a custom character. */
export function customCharacterRef(dbId: string): string {
  return `user:${dbId}`;
}

export async function createStudioCharacter(input: StudioCharacterInput): Promise<StudioCharacter> {
  const res = await api<{ character: StudioCharacter }>(`/api/studio/characters`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.character;
}

export async function listStudioCharacters(): Promise<StudioCharacter[]> {
  const res = await api<{ characters: StudioCharacter[] }>(`/api/studio/characters`);
  return res.characters;
}

export async function deleteStudioCharacter(dbId: string): Promise<void> {
  await api<{ ok: boolean }>(`/api/studio/characters/${dbId}`, { method: 'DELETE' });
}

/** Fetch one custom character by its chat ref ("user:<id>") or raw DB id. */
export async function getStudioCharacter(refOrId: string): Promise<StudioCharacter> {
  const dbId = refOrId.startsWith('user:') ? refOrId.slice('user:'.length) : refOrId;
  const res = await api<{ character: StudioCharacter }>(`/api/studio/characters/${dbId}`);
  return res.character;
}

// --- Custom-character avatar images ----------------------------------------

/** Uploads an avatar (base64 data URL) for a custom character. */
export async function uploadStudioCharacterImage(id: string, dataUrl: string): Promise<string> {
  const r = await api<{ imageKey: string }>(`/api/studio/characters/${id}/image`, {
    method: 'POST',
    body: JSON.stringify({ dataUrl }),
  });
  return r.imageKey;
}

/** Generates an avatar via FLUX (Pro only). Throws ApiError(403) for free users. */
export async function generateStudioCharacterImage(
  id: string,
  opts: { appearance?: string; style?: string } = {},
): Promise<string> {
  const r = await api<{ imageKey: string }>(`/api/studio/characters/${id}/image/generate`, {
    method: 'POST',
    body: JSON.stringify(opts),
  });
  return r.imageKey;
}

export async function deleteStudioCharacterImage(id: string): Promise<void> {
  await api(`/api/studio/characters/${id}/image`, { method: 'DELETE' });
}

// --- Custom CYOA adventures (Phase 3) --------------------------------------

export type StudioMood =
  | 'romantic' | 'dramatic' | 'comedic' | 'thriller' | 'mystery'
  | 'playful' | 'cozy' | 'gothic' | 'tense';

export interface StudioPackChoice {
  id?: string;
  label: string;        // short button text
  userMessage: string;  // first-person line/action if the player picks it
  next: string;         // target node id, or 'end'
}

export type StudioStoryAct = 'beginning' | 'middle' | 'end';

export interface StudioPackNode {
  npcInstruction: string;            // the dramatic intent of this beat
  introNarrative?: string;           // optional opening narration for the node
  /** Three-act phase: setup, confrontation, or resolution. */
  act?: StudioStoryAct;
  choices: StudioPackChoice[] | null; // null = terminal/ending beat
}

export interface StudioPackSpec {
  title: string;
  blurb: string;
  mood: StudioMood;
  setting: string;
  situation: string;
  coPresent: boolean;
  systemInstruction: string;
  nodes: Record<string, StudioPackNode>;
}

/** A stored adventure (user_stories row with format='pack'). */
export interface StudioPack {
  id: string;
  characterId: string;
  title: string;
  blurb: string;
  format: 'arc' | 'pack';
  spec: StudioPackSpec;
  visibility?: 'private' | 'public';
  moderationStatus?: 'pending' | 'approved' | 'rejected';
  moderationReason?: string | null;
  creatorName?: string | null;
  copyCount?: number;
  createdAt: string;
}

export interface StudioPackInput {
  characterId: string;
  title: string;
  blurb?: string;
  mood?: StudioMood;
  setting?: string;
  situation: string;
  coPresent?: boolean;
  systemInstruction: string;
  nodes: Record<string, StudioPackNode>;
}

export async function createStudioPack(input: StudioPackInput): Promise<StudioPack> {
  const res = await api<{ pack: StudioPack }>(`/api/studio/packs`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.pack;
}

export async function listStudioPacks(characterId?: string): Promise<StudioPack[]> {
  const q = characterId ? `?characterId=${encodeURIComponent(characterId)}` : '';
  const res = await api<{ packs: StudioPack[] }>(`/api/studio/packs${q}`);
  return res.packs;
}

export async function getStudioPack(id: string): Promise<StudioPack> {
  const res = await api<{ pack: StudioPack }>(`/api/studio/packs/${id}`);
  return res.pack;
}

export async function deleteStudioPack(id: string): Promise<void> {
  await api<{ ok: boolean }>(`/api/studio/packs/${id}`, { method: 'DELETE' });
}

// --- Publishing (Phase 4) --------------------------------------------------

export interface PublishResult {
  allowed: boolean;
  reason: string;
}

export async function publishStudioCharacter(id: string): Promise<PublishResult> {
  const r = await api<{ allowed: boolean; reason: string }>(`/api/studio/characters/${id}/publish`, { method: 'POST', body: JSON.stringify({}) });
  return { allowed: r.allowed, reason: r.reason };
}
export async function unpublishStudioCharacter(id: string): Promise<void> {
  await api(`/api/studio/characters/${id}/unpublish`, { method: 'POST', body: JSON.stringify({}) });
}
export async function publishStudioStory(id: string): Promise<PublishResult> {
  const r = await api<{ allowed: boolean; reason: string }>(`/api/studio/stories/${id}/publish`, { method: 'POST', body: JSON.stringify({}) });
  return { allowed: r.allowed, reason: r.reason };
}
export async function unpublishStudioStory(id: string): Promise<void> {
  await api(`/api/studio/stories/${id}/unpublish`, { method: 'POST', body: JSON.stringify({}) });
}
export async function publishStudioPack(id: string): Promise<PublishResult> {
  const r = await api<{ allowed: boolean; reason: string }>(`/api/studio/packs/${id}/publish`, { method: 'POST', body: JSON.stringify({}) });
  return { allowed: r.allowed, reason: r.reason };
}
export async function unpublishStudioPack(id: string): Promise<void> {
  await api(`/api/studio/packs/${id}/unpublish`, { method: 'POST', body: JSON.stringify({}) });
}

// --- Community browse + copy (Phase 4) -------------------------------------

export interface CommunityCharacter {
  id: string;
  displayName: string;
  blurb: string;
  tone: string | null;
  creatorName: string | null;
  copyCount: number;
}
export interface CommunityAdventure {
  id: string;
  title: string;
  blurb: string;
  companion: string;
  mood: string | null;
  beats: number;
  creatorName: string | null;
  copyCount: number;
}
export interface CommunityArc {
  id: string;
  title: string;
  blurb: string;
  companion: string;
  setting: string | null;
  creatorName: string | null;
  copyCount: number;
}

export async function listCommunityCharacters(): Promise<CommunityCharacter[]> {
  const r = await api<{ characters: CommunityCharacter[] }>(`/api/community/characters`);
  return r.characters;
}
export async function listCommunityAdventures(): Promise<CommunityAdventure[]> {
  const r = await api<{ adventures: CommunityAdventure[] }>(`/api/community/adventures`);
  return r.adventures;
}
export async function listCommunityArcs(): Promise<CommunityArc[]> {
  const r = await api<{ arcs: CommunityArc[] }>(`/api/community/arcs`);
  return r.arcs;
}

/** Copies a public character into my library; returns the new chat ref. */
export async function copyCommunityCharacter(id: string): Promise<{ id: string; ref: string; displayName: string }> {
  return api<{ id: string; ref: string; displayName: string }>(`/api/community/characters/${id}/copy`, { method: 'POST', body: JSON.stringify({}) });
}
export async function copyCommunityAdventure(id: string): Promise<{ id: string; characterId: string; title: string }> {
  return api<{ id: string; characterId: string; title: string }>(`/api/community/adventures/${id}/copy`, { method: 'POST', body: JSON.stringify({}) });
}
export async function copyCommunityArc(id: string): Promise<{ id: string; characterId: string; title: string }> {
  return api<{ id: string; characterId: string; title: string }>(`/api/community/arcs/${id}/copy`, { method: 'POST', body: JSON.stringify({}) });
}
