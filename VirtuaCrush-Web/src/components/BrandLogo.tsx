import { LOGO_PATH } from '../lib/brand';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  className?: string;
}

const SIZES = {
  sm: { img: 'h-8 w-8', text: 'text-lg' },
  md: { img: 'h-10 w-10', text: 'text-2xl' },
  lg: { img: 'h-14 w-14', text: 'text-3xl' },
} as const;

export default function BrandLogo({ size = 'md', showWordmark = true, className = '' }: BrandLogoProps) {
  const s = SIZES[size];
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <img
        src={LOGO_PATH}
        alt=""
        className={`${s.img} shrink-0 rounded-xl object-cover shadow-lg shadow-accent/30`}
      />
      {showWordmark ? (
        <span className={`font-serif font-bold tracking-tight text-stone-900 dark:text-white ${s.text}`}>
          Virtua Crush
        </span>
      ) : null}
    </span>
  );
}
