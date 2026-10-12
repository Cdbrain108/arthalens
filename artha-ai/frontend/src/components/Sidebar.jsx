import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  BookOpen,
  Compass,
  Download,
  ExternalLink,
  FileText,
  LogIn,
  LogOut,
  Plus,
  Shield,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
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

export default function Sidebar({
  open,
  onClose,
  user,
  onLogout,
  onOpenAuth,
  onNew,
  running,
  onNavSelect,
  history = [],
  onSelectHistory,
  onDeleteHistory,
  currentPage = 'landing',
}) {
  const ref = useRef(null)
  const [activeTab, setActiveTab] = useState('threads') // 'threads' | 'reports'

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    ref.current?.querySelector('button')?.focus()
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const items = [...ref.current.querySelectorAll('button:not(:disabled), a[href]')].filter((el) =>
        el.getClientRects().length
      )
      const first = items[0],
        last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      previous?.focus()
    }
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

  // Filter reports
  const reportItems = (history || []).filter(
    (item) => item && (item.pdfUrl || item.storagePdfUrl || item.status === 'succeeded')
  )

  return (
    <>
      {open && (
        <div
          className="sidebar-backdrop fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity animate-fade-in"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        ref={ref}
        id="workspace-navigation"
        aria-label="Workspace navigation"
        className={`app-sidebar ${open ? 'is-open' : ''}`}
      >
      {/* Brand Header */}
      <div className="sidebar-brand">
        <div className="flex items-center gap-2.5">
          <Logo size={32} />
          <div className="flex flex-col">
            <span className="font-semibold tracking-tight text-white flex items-center gap-1">
              Stock Research
              <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
            </span>
            <span className="text-[9.5px] font-mono tracking-wider text-emerald-400/90 uppercase">
              Financial Intelligence
            </span>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close navigation" className="mobile-close">
          <X size={20} />
        </button>
      </div>

      {/* New Research Action Button */}
      <button
        className="new-research"
        onClick={() => {
          onNew()
          onClose()
        }}
        disabled={running}
      >
        <Plus size={16} />
        <span>New research</span>
        <ArrowUpRight size={15} />
      </button>

      {/* Navigation Links */}
      <nav className="sidebar-nav">
        <p className="eyebrow">YOUR WORKSPACE</p>
        <button
          onClick={() => handleNav('chat')}
          className={`nav-link ${currentPage === 'chat' ? 'selected' : ''}`}
        >
          <Sparkles size={17} />
          <span>Research Workspace</span>
          {currentPage === 'chat' && <span className="nav-dot" />}
        </button>
        <button
          onClick={() => handleNav('landing')}
          className={`nav-link ${currentPage === 'landing' ? 'selected' : ''}`}
        >
          <Compass size={17} />
          <span>Platform Home</span>
          {currentPage === 'landing' && <span className="nav-dot" />}
        </button>
        <button onClick={() => handleNav('methodology')} className="nav-link">
          <BookOpen size={17} />
          <span>Multi-Agent Flow</span>
        </button>

        {/* Tab Switcher: Chat Threads vs PDF Dossiers */}
        <div className="mt-5 border-t border-white/5 pt-4">
          <div className="flex items-center gap-1 px-3 mb-2.5">
            <button
              type="button"
              onClick={() => setActiveTab('threads')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                activeTab === 'threads'
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Threads ({history.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('reports')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                activeTab === 'reports'
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Saved PDFs ({reportItems.length})
            </button>
          </div>

          {activeTab === 'threads' ? (
            history && history.length > 0 ? (
              <div className="space-y-1">
                {history.map((item, idx) => {
                  const isStr = typeof item === 'string'
                  const q = isStr ? item : item.query || 'Untitled Research'
                  const key = isStr ? `legacy-${idx}` : item.job_id || `${idx}`
                  const status = isStr ? 'chat' : item.status || 'chat'
                  const hasPdf = !isStr && (item.pdfUrl || item.storagePdfUrl)
                  const dot =
                    status === 'succeeded'
                      ? 'bg-emerald-400'
                      : status === 'failed'
                      ? 'bg-rose-400'
                      : status === 'chat'
                      ? 'bg-[#5f6368]'
                      : 'bg-[#4285f4] animate-pulse'

                  return (
                    <div
                      key={key}
                      className="group flex items-center gap-1 rounded-lg hover:bg-white/5 transition"
                    >
                      <button
                        onClick={() => {
                          onSelectHistory?.(item)
                          onClose()
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left transition"
                        title={q}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                        {hasPdf ? (
                          <FileText size={13} className="text-emerald-400 shrink-0" />
                        ) : (
                          <Sparkles size={13} className="text-[#4285f4] shrink-0" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11.5px] text-[#bdc1c6] group-hover:text-[#f1f3f4]">
                            {q}
                          </span>
                          <span className="block text-[9.5px] font-mono text-[#5f6368]">
                            {hasPdf ? 'Dossier Ready' : status}{' '}
                            {timeAgo(item.updatedAt) ? `· ${timeAgo(item.updatedAt)}` : ''}
                          </span>
                        </span>
                      </button>
                      {!isStr && onDeleteHistory && (
                        <button
                          onClick={() => onDeleteHistory(item.job_id)}
                          aria-label="Delete thread"
                          className="mr-1 hidden rounded p-1 text-[#5f6368] hover:text-rose-400 group-hover:block transition"
                          title="Delete thread"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="px-3 py-2">
                <p className="text-[11px] leading-relaxed text-[#5f6368]">
                  Your persistent research threads and questions will appear here automatically.
                </p>
              </div>
            )
          ) : (
            /* Saved PDF Dossiers Tab */
            reportItems.length > 0 ? (
              <div className="space-y-1">
                {reportItems.map((item, idx) => {
                  const q = item.query || 'Stock Research Report'
                  const url = item.storagePdfUrl || item.pdfUrl
                  return (
                    <div
                      key={item.job_id || idx}
                      className="group flex items-center justify-between gap-1 rounded-lg px-3 py-2 hover:bg-white/5 transition"
                    >
                      <button
                        onClick={() => {
                          onSelectHistory?.(item)
                          onClose()
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <FileText size={13} className="text-emerald-400 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11.5px] text-[#bdc1c6] group-hover:text-white">
                            {q}
                          </span>
                          <span className="block text-[9.5px] font-mono text-emerald-500/80">
                            PDF Dossier
                          </span>
                        </span>
                      </button>
                      {url && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={item.storagePdfUrl ? undefined : `research_${item.job_id}.pdf`}
                          className="p-1 text-slate-400 hover:text-emerald-400"
                          title="Open / Download PDF"
                        >
                          <Download size={13} />
                        </a>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="px-3 py-2">
                <p className="text-[11px] leading-relaxed text-[#5f6368]">
                  No PDF dossiers saved yet. Run an analysis to generate an institutional report.
                </p>
              </div>
            )
          )}
        </div>
      </nav>

      {/* Brand & Security Feature Note */}
      <div className="sidebar-note">
        <span className="note-icon">
          <Shield size={18} className="text-emerald-400" />
        </span>
        <h3 className="text-xs font-semibold text-white">
          Evidence-First.<br />100% Deterministic.
        </h3>
        <p className="text-[11px] text-slate-400 mt-1">
          Zero hallucinated price targets. Ratios are computed strictly from verified company filings.
        </p>
      </div>

      {/* Bottom Profile & Sign-in/Sign-out */}
      <div className="sidebar-bottom">
        <div className="px-3 mb-2 flex items-center justify-between">
          <span className="eyebrow">ACCOUNT STATUS</span>
          {user && !user.guest ? (
            <button
              className="flex items-center gap-1 text-[11px] text-rose-400 hover:underline"
              onClick={onLogout}
            >
              <LogOut size={13} /> Sign out
            </button>
          ) : (
            <button
              className="flex items-center gap-1 text-[11px] text-[#22c55e] hover:underline"
              onClick={() => {
                onClose()
                onOpenAuth?.()
              }}
            >
              <LogIn size={13} /> Sign in
            </button>
          )}
        </div>
        <UserProfile user={user} />
      </div>
    </aside>
    </>
  )
}
