/** Brand mark: sparkle crown, heart center, chat bubble accent — dating-sim identity. */
export default function VirtuaCrushLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* Small star at the top */}
      <path
        d="M20 5.5l1.1 2.35 2.55.35-1.85 1.75.45 2.5L20 11.4l-2.25 1.55.45-2.5-1.85-1.75 2.55-.35L20 5.5z"
        fill="currentColor"
        opacity={0.95}
      />
      {/* Heart — primary focal mark */}
      <path
        d="M20 31.5s-8.5-5.6-8.5-10.2c0-3.05 2.45-5.2 5.35-5.2 1.65 0 3.15.85 4.15 2.15 1-1.3 2.5-2.15 4.15-2.15 2.9 0 5.35 2.15 5.35 5.2 0 4.6-8.5 10.2-8.5 10.2z"
        fill="currentColor"
      />
      {/* Small chat bubble — bottom-right accent */}
      <path
        d="M29.5 27.5c1.65 0 3 1.2 3 2.7s-1.35 2.7-3 2.7h-2.1l-2.4 2.1v-2.1c-1.65 0-3-1.2-3-2.7s1.35-2.7 3-2.7h4.5z"
        fill="currentColor"
        opacity={0.92}
      />
      <circle cx="27.2" cy="30.2" r="0.65" fill="white" opacity={0.85} />
      <circle cx="29.5" cy="30.2" r="0.65" fill="white" opacity={0.85} />
      <circle cx="31.8" cy="30.2" r="0.65" fill="white" opacity={0.85} />
    </svg>
  );
}
