export function Logo({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 40 40" className="flex-shrink-0">
        <circle
          cx="20" cy="20" r="17"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2.5"
          strokeDasharray="10 5"
          strokeLinecap="round"
          className="logo-ring"
        />
        <circle cx="20" cy="20" r="9" fill="var(--color-accent)" />
      </svg>
      <span className="font-[var(--font-display)] text-xl font-bold tracking-tight">
        <span className="text-[var(--color-accent)]">R</span>
        <span>ooping</span>
      </span>
    </div>
  )
}
