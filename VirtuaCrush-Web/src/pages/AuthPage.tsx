// Login / signup gate. Shown by App whenever there is no active session.
// Uses the existing Better Auth client (email + password). On success, the
// session updates and App's useSession() re-renders into the real app.
import { useState, type FormEvent } from 'react';
import { signIn, signUp } from '../lib/auth-client';

type Mode = 'signin' | 'signup';

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      const res =
        mode === 'signup'
          ? await signUp.email({ email, password, name: name.trim() || email.split('@')[0] })
          : await signIn.email({ email, password });

      // Better Auth returns { data, error } rather than throwing on bad creds.
      if ((res as { error?: { message?: string } })?.error) {
        setError((res as { error?: { message?: string } }).error?.message || 'Something went wrong.');
      }
      // On success there is nothing to do: App's useSession() picks up the new
      // session and swaps this page out for the app.
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const isSignup = mode === 'signup';

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4 dark:bg-surface">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-1/4 top-0 h-[800px] w-[800px] rounded-full bg-accent/10 blur-[120px]" />
        <div className="absolute -right-1/4 bottom-0 h-[600px] w-[600px] rounded-full bg-violet-warm/10 blur-[100px]" />
      </div>

      <div className="w-full max-w-md rounded-3xl border border-black/10 glass p-8 shadow-2xl dark:border-white/10">
        <h1 className="mb-2 text-center font-serif text-3xl text-stone-900 dark:text-stone-50">
          {isSignup ? 'Create your account' : 'Welcome back'}
        </h1>
        <p className="mb-8 text-center text-sm text-stone-500 dark:text-stone-400">
          {isSignup ? 'Sign up to start chatting with your companions.' : 'Sign in to continue.'}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {isSignup ? (
            <input
              type="text"
              autoComplete="name"
              placeholder="Display name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-2xl border border-black/10 bg-black/[0.04] px-5 py-3.5 text-stone-800 outline-none transition-colors placeholder:text-stone-500 focus:border-accent/40 focus:ring-2 focus:ring-accent/15 dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-100"
            />
          ) : null}

          <input
            type="email"
            required
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-2xl border border-black/10 bg-black/[0.04] px-5 py-3.5 text-stone-800 outline-none transition-colors placeholder:text-stone-500 focus:border-accent/40 focus:ring-2 focus:ring-accent/15 dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-100"
          />

          <input
            type="password"
            required
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            placeholder="Password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-2xl border border-black/10 bg-black/[0.04] px-5 py-3.5 text-stone-800 outline-none transition-colors placeholder:text-stone-500 focus:border-accent/40 focus:ring-2 focus:ring-accent/15 dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-100"
          />

          {error ? (
            <p className="rounded-xl bg-red-500/10 px-4 py-2.5 text-sm text-red-500">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-2xl bg-accent py-3.5 font-semibold text-white shadow-lg shadow-accent/25 transition-all hover:bg-accent-deep active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-stone-500 dark:text-stone-400">
          {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            type="button"
            onClick={() => {
              setMode(isSignup ? 'signin' : 'signup');
              setError(null);
            }}
            className="font-semibold text-accent transition-colors hover:text-accent-deep"
          >
            {isSignup ? 'Sign in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  );
}
