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

/** Joins the VIP interest list ("notify me when it launches"). */
export async function joinInterestList(email: string): Promise<void> {
  await api('/api/interest', { method: 'POST', body: JSON.stringify({ email, source: 'vip_waitlist' }) });
}

// --- Travel ------------------------------------------------------------------

export interface TravelLocation {
  slug: string;
  name: string;
  shortName: string;
  type: 'player_home' | 'public' | 'character_home';
  characterId?: string;
  affinityRequired?: number;
}

export interface TravelResult {
  location: TravelLocation;
  sceneHeader?: string;
}

/**
 * Moves the player (in the context of their conversation with characterId) to
 * the given location. Throws ApiError on affinity gate or unknown slug.
 */
export async function travel(
  characterId: string,
  locationSlug: string,
): Promise<TravelResult> {
  return api<TravelResult>('/api/travel', {
    method: 'POST',
    body: JSON.stringify({ characterId, locationSlug }),
  });
}

/**
 * Reads the player's current location for this character from the state
 * endpoint (scene_location field). Returns null when at home.
 */
export async function getPlayerLocation(characterId: string): Promise<string | null> {
  const state = await fetchCharacterState(characterId);
  return state.sceneLocation ?? null;
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
