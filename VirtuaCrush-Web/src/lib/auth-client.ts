// Client-only Better Auth helpers. Safe to import from any React component.
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? '',
});

export const { useSession, signIn, signUp, signOut } = authClient;