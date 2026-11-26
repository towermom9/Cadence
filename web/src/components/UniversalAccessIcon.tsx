export function UniversalAccessIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10.25"
        stroke="currentColor"
        strokeWidth="1.9"
      />
      <circle cx="12" cy="6.6" r="1.5" fill="currentColor" />
      <path
        d="M6.4 9.65h11.2M12 9.65v4.15m0 0-2.65 4.45M12 13.8l2.65 4.45"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
