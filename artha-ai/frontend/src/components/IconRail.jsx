import { Sparkles, FolderOpen, FlaskConical, MoreHorizontal } from 'lucide-react'
import Logo from './Logo'

const items = [
  { icon: Sparkles, label: 'Research', active: true },
  { icon: FolderOpen, label: 'Projects' },
  { icon: FlaskConical, label: 'Experiments' },
]

// Slim leftmost utility rail (mimics the reference UI's narrow vertical bar).
export default function IconRail() {
  return (
    <div className="hidden w-12 flex-col items-center gap-1 border-r border-line bg-rail py-3 md:flex">
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-b from-panel to-transparent ring-1 ring-white/5">
        <Logo size={19} />
      </div>
      {items.map(({ icon: Icon, label, active }) => (
        <button
          key={label}
          title={label}
          aria-label={label}
          className={`group relative rounded-xl p-2.5 transition-all duration-200 ${
            active
              ? 'bg-panel text-primary shadow-inner-line'
              : 'text-muted hover:scale-105 hover:bg-panel hover:text-primary'
          }`}>
          <Icon size={18} strokeWidth={1.8} />
          {active && (
            <span className="absolute -left-[13px] top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-full bg-gradient-to-b from-accent to-violet" />
          )}
        </button>
      ))}
      <div className="mt-auto">
        <button
          title="More"
          aria-label="More"
          className="rounded-xl p-2.5 text-muted transition-all duration-200 hover:scale-105 hover:bg-panel hover:text-primary">
          <MoreHorizontal size={18} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  )
}
