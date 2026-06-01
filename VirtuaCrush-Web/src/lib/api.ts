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