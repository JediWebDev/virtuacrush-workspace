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
      {/* Star — top crown, scaled up with headroom */}
      <path
        d="M20 2.2l1.45 3.05 3.35.5-2.45 2.35 0.6 3.35L20 9.4l-2.95 2.05 0.6-3.35-2.45-2.35 3.35-.5L20 2.2z"
        fill="currentColor"
        opacity={0.95}
      />
      {/* Heart — center focal mark, sized to clear star + bubble */}
      <path
        d="M20 26.8C20 26.8 11.8 20.2 11.8 15.4C11.8 12.6 14.1 10.5 16.9 10.5C18.6 10.5 19.9 11.4 20 12.6C20.1 11.4 21.4 10.5 23.1 10.5C25.9 10.5 28.2 12.6 28.2 15.4C28.2 20.2 20 26.8 20 26.8z"
        fill="currentColor"
      />
      {/* Chat bubble — bottom-right accent, separated from heart */}
      <path
        d="M25.8 28.8h9.4a2.4 2.4 0 0 1 2.4 2.4v3.2a2.4 2.4 0 0 1-2.4 2.4h-6.6l-2.6 2.4v-2.4h-2.8a2.4 2.4 0 0 1-2.4-2.4v-3.2a2.4 2.4 0 0 1 2.4-2.4z"
        fill="currentColor"
        opacity={0.92}
      />
      <circle cx="28.4" cy="33.2" r="0.85" fill="white" opacity={0.9} />
      <circle cx="30.5" cy="33.2" r="0.85" fill="white" opacity={0.9} />
      <circle cx="32.6" cy="33.2" r="0.85" fill="white" opacity={0.9} />
    </svg>
  );
}
