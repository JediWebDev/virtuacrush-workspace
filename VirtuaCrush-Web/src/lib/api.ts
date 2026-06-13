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
export type ScenePhase = "home" | "on_date" | "jailed";

export interface SceneInfo {
  mode: "apart" | "together";
  location: string | null;
  billPending: boolean;
  jailedUntil?: string | null;
  bailCallUsed?: boolean;
}

export interface CharacterState {
  characterId: string;
  activity: string;
  mood: string;
  headline: string;
  goalProgress: number;
  goal: string;
  scene?: SceneInfo;
  phase?: ScenePhase;
  sceneLabel?: string | null;
  secret?: { label: string; discovered: boolean; reveal: string | null; progress?: number };
  drives?: { key: string; label: string; value: number }[];
  pendingEvent?: { drive: string; prompt: string; options: { id: string; label: string }[] } | null;
}

// Current story-engine state (what the character is "doing" today) for the
// status strip above the chat. Lazily generated server-side on a new day.
export async function fetchCharacterState(characterId: string): Promise<CharacterState> {
  return api<CharacterState>(`/api/state/${encodeURIComponent(characterId)}`);
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

export interface BailResult {
  ok: boolean;
  accepted?: boolean;
  reaction?: string;
  error?: string;
}

/** Spends the user's one phone call from jail to ask the date for bail. */
export async function requestBail(characterId: string): Promise<BailResult> {
  return api<BailResult>(`/api/jail/${encodeURIComponent(characterId)}/bail`, { method: 'POST' });
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
