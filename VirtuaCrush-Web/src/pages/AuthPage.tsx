// Login / signup gate. Shown by App whenever there is no active session.
// Email + password via Better Auth, plus optional social sign-in (providers
// listed in VITE_OAUTH_PROVIDERS, e.g. "google,discord", and configured
// server-side with matching client IDs/secrets). Signup requires confirming
// 18+ and agreeing to the Terms of Use.
import { useState, type FormEvent } from 'react';
import { signIn, signUp } from '../lib/auth-client';

type Mode = 'signin' | 'signup';

// Social providers the build was configured for (must also be configured on
// the server or the redirect will fail).
const SOCIAL_PROVIDERS = (import.meta.env.VITE_OAUTH_PROVIDERS ?? '')
  .split(',')
  .map((p: string) => p.trim().toLowerCase())
  .filter((p: string) => p === 'google' || p === 'discord');

const PROVIDER_LABEL: Record<string, string> = { google: 'Google', discord: 'Discord' };

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (mode === 'signup' && !agree) {
      setError('You must confirm you are 18 or older and accept the Terms of Use.');
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

  async function handleSocial(provider: string) {
    setError(null);
    try {
      await signIn.social({ provider: provider as 'google' | 'discord', callbackURL: '/' });
    } catch {
      setError('Could not start social sign-in. Please try again.');
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

          {isSignup ? (
            <label className="flex items-start gap-3 rounded-xl border border-black/10 bg-black/[0.03] px-4 py-3 text-left dark:border-white/10 dark:bg-white/[0.03]">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent,#c9717d)]"
              />
              <span className="text-xs leading-relaxed text-stone-600 dark:text-stone-300">
                I confirm that I am <strong>18 years of age or older</strong> and I agree to the{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:underline">
                  Terms of Use
                </a>{' '}
                and{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:underline">
                  Privacy Statement
                </a>
                .
              </span>
            </label>
          ) : null}

          {error ? (
            <p className="rounded-xl bg-red-500/10 px-4 py-2.5 text-sm text-red-500">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={loading || (isSignup && !agree)}
            className="mt-2 rounded-2xl bg-accent py-3.5 font-semibold text-white shadow-lg shadow-accent/25 transition-all hover:bg-accent-deep active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
          </button>
        </form>

        {SOCIAL_PROVIDERS.length > 0 ? (
          <>
            <div className="my-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
              <span className="text-xs uppercase tracking-wide text-stone-400">or continue with</span>
              <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
            </div>
            <div className="flex flex-col gap-3">
              {SOCIAL_PROVIDERS.map((provider: string) => (
                <button
                  key={provider}
                  type="button"
                  onClick={() => handleSocial(provider)}
                  className="rounded-2xl border border-black/10 bg-black/[0.04] py-3 font-semibold text-stone-700 transition-colors hover:bg-black/[0.08] dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-200 dark:hover:bg-white/[0.08]"
                >
                  Continue with {PROVIDER_LABEL[provider] ?? provider}
                </button>
              ))}
              {isSignup ? (
                <p className="text-center text-[11px] leading-relaxed text-stone-500">
                  By continuing with a social account you confirm you are 18+ and accept the{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Terms of Use</a>.
                </p>
              ) : null}
            </div>
          </>
        ) : null}

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
