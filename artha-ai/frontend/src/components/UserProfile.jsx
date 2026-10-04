export default function UserProfile({ user }) {
  const name = user?.name || 'Bullseye Researcher'
  const initial = name.trim().charAt(0).toUpperCase() || 'A'
  return (
    <div className="flex items-center gap-2.5 border-t border-line px-4 py-3">
      <div className="relative shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-accent to-violet text-[13px] font-semibold text-ink ring-1 ring-white/10">
          {initial}
        </div>
        <span
          title="Online"
          aria-label="Online"
          className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-side bg-[#34a853]"
        />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] text-primary">{name}</span>
          <span
            className={`shrink-0 rounded px-1 py-px text-[9px] font-bold tracking-wide ${
              user?.guest ? 'bg-muted/20 text-muted' : 'bg-violet/20 text-violet'
            }`}>
            {user?.guest ? 'GUEST' : 'PRO'}
          </span>
        </div>
        <span className="block truncate text-[11px] text-muted">
          {user?.email || 'Portfolio workspace'}
        </span>
      </div>
    </div>
  )
}
