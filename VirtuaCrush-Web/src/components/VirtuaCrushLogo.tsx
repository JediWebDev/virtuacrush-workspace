/** Brand mark: heart (hero), star top-right, rounded chat bubble bottom-left. */
export default function VirtuaCrushLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* Heart — largest, centered focal mark */}
      <path
        d="M20 33.2C20 33.2 7.5 21.8 7.5 13.8C7.5 9.4 11.2 5.8 15.8 5.8C18.2 5.8 19.4 6.9 20 8.4C20.6 6.9 21.8 5.8 24.2 5.8C28.8 5.8 32.5 9.4 32.5 13.8C32.5 21.8 20 33.2 20 33.2z"
        fill="currentColor"
      />

      {/* Star — top-right accent */}
      <path
        d="M33.5 2.8l1.45 3.05 3.35.5-2.45 2.35 0.6 3.35L33.5 10l-2.95 2.05 0.6-3.35-2.45-2.35 3.35-.5L33.5 2.8z"
        fill="currentColor"
        opacity={0.95}
      />

      {/* Chat bubble — bottom-left, rounded corners, tail points toward heart */}
      <path
        d="M4.5 28h10.5a3.5 3.5 0 0 1 3.5 3.5v5a3.5 3.5 0 0 1-3.5 3.5H4.5a3.5 3.5 0 0 1-3.5-3.5v-5a3.5 3.5 0 0 1 3.5-3.5z"
        fill="currentColor"
        opacity={0.92}
      />
      <path
        d="M16.2 29.8l3.6-3.2-2.4 5.2z"
        fill="currentColor"
        opacity={0.92}
      />
      <circle cx="7.6" cy="34.2" r="0.95" fill="white" opacity={0.9} />
      <circle cx="10.5" cy="34.2" r="0.95" fill="white" opacity={0.9} />
      <circle cx="13.4" cy="34.2" r="0.95" fill="white" opacity={0.9} />
    </svg>
  );
}
