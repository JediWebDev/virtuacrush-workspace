// Reads the current user's daily message quota from /api/usage.
// Subscribed users get { subscribed: true, used: 0, limit: null, remaining: null }.
// Free users get the actual count + remaining.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

export interface UsageState {
  subscribed: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
}

export function useUsage() {
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api<UsageState>('/api/usage');
      setUsage(data);
    } catch (e) {
      console.error('[useUsage] refresh failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { usage, loading, refresh };
}