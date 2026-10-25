import { useEffect, useState } from 'react'
import { FileText, Download, RotateCcw, Eye, EyeOff, CloudCheck, CheckCircle2, ShieldCheck } from 'lucide-react'
import { api } from '../api/client'
import { persistReportPdfToStorage } from '../storage/chatSessions'
import ReportPreview from './ReportPreview'
import PdfViewerModal from './PdfViewerModal'

// Report-ready state — the control room's terminal action: view / download PDF / interactive preview.
export default function ReportReady({ job, onReset, user }) {
  const jobId = job?.status === 'succeeded' ? job.job_id : null
  const [pdfState, setPdfState] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [showPreview, setShowPreview] = useState(true)
  const [cloudSynced, setCloudSynced] = useState(false)
  const [showPdfModal, setShowPdfModal] = useState(false)

  useEffect(() => {
    if (!jobId) return
    const controller = new AbortController()
    let active = true
    let url
    setPdfState({ jobId })
    setCloudSynced(false)

    // Fetch via getPdfData (JSON base64) so browser download managers like IDM never intercept in-app reports
    const fetchPdf = async () => {
      try {
        const data = await api.getPdfData(jobId, { signal: controller.signal })
        if (!active) return
        if (!data?.base64) throw new Error('PDF payload was empty')
        
        const binaryString = atob(data.base64)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        const blob = new Blob([bytes], { type: 'application/pdf' })
        url = URL.createObjectURL(blob)
        setPdfState({ jobId, url, blob, rawBytes: bytes })

        // Persist to Firebase Cloud Storage if user is signed in
        if (user?.uid && !user.guest) {
          persistReportPdfToStorage(user.uid, jobId, blob, {
            title: job.query || 'Stock Research Report',
            query: job.query || '',
            conversationId: jobId,
          }).then((res) => {
            if (active && res?.downloadUrl) {
              setCloudSynced(true)
            }
          }).catch(() => {})
        }
      } catch (err) {
        if (!active) return
        // Resilient fallback to binary getPdf if pdf-data isn't supported
        try {
          const blob = await api.getPdf(jobId, { signal: controller.signal })
          if (!active) return
          url = URL.createObjectURL(blob)
          setPdfState({ jobId, url, blob })
        } catch (fallbackErr) {
          if (active) setPdfState({ jobId, error: err.message || fallbackErr.message })
        }
      }
    }

    fetchPdf()

    return () => {
      active = false
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [jobId, attempt, user?.uid, user?.guest])

  if (!jobId) return null
  const pdf = pdfState?.jobId === jobId ? pdfState : null
  const selected = job.selected_agents || []

  return (
    <div className="w-full max-w-4xl space-y-3">
      <div className="card card-success animate-pop-in relative w-full overflow-hidden rounded-2xl p-4 shadow-xl border border-white/10 sm:p-5 bg-[#1e2026]">
        {/* Soft success wash */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#22c55e]/10 blur-3xl" aria-hidden />

        <div className="relative flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#22c55e]/15 text-[#22c55e]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  className="check-draw"
                  d="M5 13l4 4L19 7"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[13px] font-semibold text-[#22c55e]">Research Complete</h3>
                {cloudSynced && (
                  <span className="flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono text-emerald-400">
                    <CheckCircle2 size={11} /> Saved to Firebase Cloud
                  </span>
                )}
              </div>
              <p className="mt-1 text-[15px] font-medium leading-snug text-white">{job.query}</p>
              <p className="mt-1 text-[12px] text-slate-400">
                {pdf?.url ? 'Your multi-agent dossier & verified financial models are ready below.' : 'Research finished. Rendering PDF report…'}
              </p>
            </div>
          </div>
        </div>

        {selected.length > 0 && (
          <div className="relative mt-3 flex flex-wrap gap-1.5">
            {selected.map((a) => (
              <span key={a} className="rounded-full border border-white/10 bg-black/30 px-2.5 py-0.5 text-[10.5px] text-slate-300">
                {a}
              </span>
            ))}
          </div>
        )}

        <div className="relative mt-4 flex flex-wrap items-center gap-2">
          {pdf?.url ? (
            <>
              <button
                onClick={() => setShowPreview((v) => !v)}
                className="btn-press flex items-center gap-1.5 rounded-full border border-[#22c55e]/40 bg-[#22c55e]/10 px-4 py-2 text-[13px] font-medium text-emerald-400 hover:bg-[#22c55e]/20"
              >
                {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                {showPreview ? 'Hide Interactive Preview' : 'Show Interactive Preview'}
              </button>
              <button
                type="button"
                onClick={() => setShowPdfModal(true)}
                className="btn-press flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[13px] text-white hover:bg-white/10 cursor-pointer"
              >
                <FileText size={14} className="text-emerald-400" /> View PDF In-App
              </button>
              <a
                href={pdf.url}
                download={`arthalens_research_${jobId}.pdf`}
                className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#22c55e] to-[#16a34a] px-4 py-2 text-[13px] font-semibold text-black shadow-md hover:brightness-110"
              >
                <Download size={14} /> Download PDF
              </a>
            </>
          ) : pdf?.error ? (
            <div role="alert" className="text-[13px] text-rose-300">
              PDF unavailable: {pdf.error}
              <button onClick={() => setAttempt((value) => value + 1)} className="ml-2 text-emerald-400 hover:underline">Retry PDF</button>
            </div>
          ) : (
            <span role="status" className="text-[13px] text-slate-400">Loading PDF…</span>
          )}
          <button
            onClick={onReset}
            className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-2 text-[12px] text-slate-400 hover:text-white"
          >
            <RotateCcw size={13} /> New research
          </button>
        </div>
      </div>

      {/* Interactive In-Browser Report Preview with KPI Cards & Charts */}
      {showPreview && (
        <ReportPreview jobId={jobId} job={job} pdfUrl={pdf?.url} />
      )}

      {showPdfModal && (
        <PdfViewerModal
          jobId={jobId}
          pdfUrl={pdf?.url}
          pdfBytes={pdf?.rawBytes}
          pdfBlob={pdf?.blob}
          onClose={() => setShowPdfModal(false)}
          onSwitchToReport={() => {
            setShowPdfModal(false)
            setShowPreview(true)
          }}
        />
      )}
    </div>
  )
}
