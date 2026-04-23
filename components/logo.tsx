export function MerchivaLogo({ size = 24, fg = "currentColor", bg, rounded, className }: { size?: number; fg?: string; bg?: string; rounded?: boolean; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      style={{ borderRadius: rounded ? size * 0.12 : undefined, background: bg, flexShrink: 0 }}
    >
      <path
        d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z"
        fill={fg}
      />
    </svg>
  );
}
