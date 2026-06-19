import { Sparkles } from 'lucide-react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  className?: string;
}

const SIZES = {
  sm: { box: 'h-8 w-8', icon: 16, text: 'text-lg' },
  md: { box: 'h-10 w-10', icon: 20, text: 'text-2xl' },
  lg: { box: 'h-14 w-14', icon: 24, text: 'text-3xl' },
} as const;

export default function BrandLogo({ size = 'md', showWordmark = true, className = '' }: BrandLogoProps) {
  const s = SIZES[size];
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <div
        className={`${s.box} flex shrink-0 items-center justify-center rounded-xl bg-accent shadow-lg shadow-accent/30`}
      >
        <Sparkles className="text-white" size={s.icon} />
      </div>
      {showWordmark ? (
        <span className={`font-serif font-bold tracking-tight text-stone-900 dark:text-white ${s.text}`}>
          Virtua Crush
        </span>
      ) : null}
    </span>
  );
}
