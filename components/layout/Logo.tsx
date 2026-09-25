export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="logo" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-icon.svg"
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, display: 'block', borderRadius: Math.round(size * 0.22) }}
      />
    </span>
  );
}
