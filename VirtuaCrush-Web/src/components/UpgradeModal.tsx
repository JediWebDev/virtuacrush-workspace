// Shown when a free user hits their daily cap or clicks any "premium" CTA.
// Calls /api/stripe/checkout and redirects to Stripe-hosted checkout.
import { useState } from 'react';
import { api } from '../lib/api';

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  reason?: 'quota' | 'premium-content';
}

export function UpgradeModal({ open, onClose, reason = 'quota' }: UpgradeModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleUpgrade = async () => {
    setError(null);
    setLoading(true);
    try {
      const { url } = await api<{ url: string }>('/api/stripe/checkout', { method: 'POST' });
      // Hard navigate to Stripe-hosted checkout.
      window.location.href = url;
    } catch (e) {
      console.error(e);
      setError('Could not start checkout. Try again in a moment.');
      setLoading(false);
    }
  };

  const headline =
    reason === 'quota'
      ? "You've used your 5 free messages today"
      : 'Unlock the full experience';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-zinc-900 p-6 shadow-2xl ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-zinc-400 hover:text-white"
          aria-label="Close"
        >
          ✕
        </button>

        <h2 className="text-2xl font-semibold text-white">{headline}</h2>
        <p className="mt-2 text-sm text-zinc-300">
          Upgrade to <span className="font-semibold text-pink-400">VirtuaCrush Premium</span> for
          unlimited daily messages with every companion.
        </p>

        <ul className="mt-4 space-y-2 text-sm text-zinc-200">
          <li>• Unlimited chats with all 10 companions</li>
          <li>• Persistent memory across devices</li>
          <li>• Priority response speed</li>
          <li>• Cancel anytime</li>
        </ul>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        <button
          onClick={handleUpgrade}
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-pink-500 px-4 py-3 font-semibold text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Redirecting…' : 'Upgrade Now'}
        </button>

        <button
          onClick={onClose}
          className="mt-2 w-full rounded-xl px-4 py-2 text-sm text-zinc-400 hover:text-white"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}