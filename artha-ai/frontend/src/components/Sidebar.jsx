import { useEffect, useRef } from 'react'
import { ArrowUpRight, BookOpen, Compass, FileText, LogOut, Plus, Sparkles, X } from 'lucide-react'
import UserProfile from './UserProfile'
import Logo from './Logo'

function timeAgo(iso) {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const s = Math.floor((Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}

export default function Sidebar({ open, onClose, user, onLogout, onNew, running, onNavSelect, history = [], onSelectHistory, onDeleteHistory, currentPage = 'landing' }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    ref.current?.querySelector('button')?.focus()
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const items = [...ref.current.querySelectorAll('button:not(:disabled), a[href]')].filter(el => el.getClientRects().length)
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('keydown', handleKey); previous?.focus() }
  }, [open, onClose])

  const handleNav = (section) => {
    onClose()
    if (onNavSelect) {
      onNavSelect(section)
    } else {
      const el = document.getElementById(section)
      if (el) el.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <aside ref={ref} id="workspace-navigation" aria-label="Workspace navigation" className={`app-sidebar ${open ? 'is-open' : ''}`}>
      <div className="sidebar-brand">
        <Logo size={28} />
        <span>ArthaAI<span className="brand-dot">.</span></span>
        <span className="beta-tag">INSTITUTIONAL</span>
        <button onClick={onClose} aria-label="Close navigation" className="mobile-close"><X size={20} /></button>
      </div>

      <button className="new-research" onClick={() => { onNew(); onClose() }} disabled={running}>
        <Plus size={16} />
        <span>New research</span>
        <ArrowUpRight size={15} />
      </button>

      <nav className="sidebar-nav">
        <p className="eyebrow">YOUR WORKSPACE</p>
        <button onClick={() => handleNav('chat')} className={`nav-link ${currentPage === 'chat' ? 'selected' : ''}`}>
          <Sparkles size={17} />
          <span>Research Chat</span>
          {currentPage === 'chat' && <span className="nav-dot" />}
        </button>
        <button onClick={() => handleNav('landing')} className={`nav-link ${currentPage === 'landing' ? 'selected' : ''}`}>
          <Compass size={17} />
          <span>Explore & Home</span>
          {currentPage === 'landing' && <span className="nav-dot" />}
        </button>
        <button onClick={() => handleNav('methodology')} className="nav-link">
          <BookOpen size={17} />
          <span>How it works</span>
        </button>

        {history && history.length > 0 ? (
          <div className="mt-5 border-t border-white/5 pt-4">
            <p className="eyebrow px-3 mb-2">RECENT THREADS · {history.length}</p>
            <div className="space-y-1">
              {history.map((item, idx) => {
                const isStr = typeof item === 'string'
                const q = isStr ? item : (item.query || 'Untitled')
                const key = isStr ? `legacy-${idx}` : (item.job_id || `${idx}`)
                const status = isStr ? 'chat' : (item.status || 'chat')
                const isReport = !isStr && status !== 'chat' && item.job_id && !String(item.job_id).startsWith('chat_')
                const dot = status === 'succeeded' ? 'bg-emerald-400'
                  : status === 'failed' ? 'bg-red-400'
                  : status === 'chat' ? 'bg-[#5f6368]'
                  : 'bg-[#4285f4] animate-pulse'
                return (
                  <div key={key} className="group flex items-center gap-1 rounded-lg hover:bg-white/5 transition">
                    <button
                      onClick={() => { onSelectHistory?.(item); onClose() }}
                      className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left transition"
                      title={q}
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                      {isReport
                        ? <FileText size={12} className="text-[#8ab4f8] shrink-0" />
                        : <Sparkles size={12} className="text-[#4285f4] shrink-0" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11.5px] text-[#bdc1c6] group-hover:text-[#f1f3f4]">{q}</span>
                        <span className="block text-[9.5px] font-mono text-[#5f6368]">
                          {isReport ? 'report · pdf' : status} {timeAgo(item.updatedAt) ? `· ${timeAgo(item.updatedAt)}` : ''}
                        </span>
                      </span>
                    </button>
                    {!isStr && onDeleteHistory && (
                      <button
                        onClick={() => onDeleteHistory(item.job_id)}
                        aria-label="Delete thread"
                        className="mr-1 hidden rounded p-1 text-[#5f6368] hover:text-white group-hover:block"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="mt-5 border-t border-white/5 pt-4 px-3">
            <p className="eyebrow mb-1">RECENT THREADS</p>
            <p className="text-[11px] leading-relaxed text-[#5f6368]">
              Finished analyses (e.g. TCS summary) stay here with their report + PDF.
            </p>
          </div>
        )}
      </nav>

      <div className="sidebar-note">
        <span className="note-icon"><Sparkles size={18} /></span>
        <h3>A little curiosity.<br />A clearer perspective.</h3>
        <p>Turn your next investment question into verified evidence you can explore.</p>
        <button onClick={() => handleNav('explore')} className="flex items-center gap-1.5 text-[11px] font-medium text-[#8ab4f8] hover:underline mt-4">
          <span>Find your starting point</span>
          <ArrowUpRight size={14} />
        </button>
      </div>

      <div className="sidebar-bottom">
        <span className="eyebrow">RESEARCH BEYOND THE NOISE</span>
        <button className="nav-link" onClick={onLogout}><LogOut size={16} /> Sign out</button>
        <UserProfile user={user} />
      </div>
    </aside>
  )
}

