// Client API for the living-world activity feed.
export interface ActivityItem { kind: string; actors: string[]; text: string }
export interface LoggedEvent extends ActivityItem { id: string; atMin: number; createdAt: string }
export interface WorldFeed { events: LoggedEvent[]; summary: ActivityItem[] }

export function fetchWorld(): Promise<WorldFeed> {
  return fetch('/api/world', { credentials: 'include' }).then((r) => {
    if (!r.ok) throw new Error('http_' + r.status);
    return r.json();
  });
}
