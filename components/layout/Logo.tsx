export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="logo" aria-hidden>
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--accent)" />
            <stop offset="1" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>
        <rect x="1.5" y="1.5" width="29" height="29" rx="9" fill="url(#lg)" />
        <path d="M12.5 10.5v11l9-5.5-9-5.5Z" fill="#fff" fillOpacity=".95" />
        <circle cx="24.5" cy="9" r="2.4" fill="#fff" fillOpacity=".7" />
      </svg>
    </span>
  );
}
