import { useEffect, useState } from 'react'
import { Download, ExternalLink, FileText, Loader2, X } from 'lucide-react'
import { api } from '../api/client'
import Logo from './Logo'

/**
 * In-app PDF reader. The API uses an inline response, but we still fetch a
 * Blob here so the viewer also works with older deployments that mark PDFs as
 * attachments. The object URL is revoked whenever the dialog closes.
 */
export default function PdfViewerModal({ jobId, pdfUrl, onClose }) {
  const [viewerUrl, setViewerUrl] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    let objectUrl = null
    const controller = new AbortController()

    if (!pdfUrl) {
      setError('PDF URL is unavailable for this report.')
      return () => controller.abort()
    }

    const load = async () => {
      try {
        if (pdfUrl.startsWith('blob:')) {
          if (active) setViewerUrl(pdfUrl)
          return
        }
        const blob = await api.getPdf(jobId, { signal: controller.signal })
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setViewerUrl(objectUrl)
      } catch (loadError) {
        if (active && loadError.name !== 'AbortError') setError(loadError.message)
      }
    }

    setViewerUrl(null)
    setError(null)
    void load()
    return () => {
      active = false
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [jobId, pdfUrl])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="PDF report viewer"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className="flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#181a1f] shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#1e2026] px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Logo size={32} />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-white">ArthaAI research brief</p>
              <p className="text-[10.5px] font-mono text-[#9aa0a6]">Read inside the workspace · press Esc to close</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {viewerUrl && (
              <>
                <a
                  href={viewerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-[#f1f3f4] hover:bg-white/10"
                >
                  <ExternalLink size={13} /> New window
                </a>
                <a
                  href={viewerUrl}
                  download={`arthaai_${jobId}.pdf`}
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#4285f4] to-[#1a73e8] px-3 py-1.5 text-[11px] font-semibold text-white shadow-md"
                >
                  <Download size={13} /> Download
                </a>
              </>
            )}
            <button type="button" onClick={onClose} aria-label="Close PDF viewer" className="rounded-lg p-2 text-[#9aa0a6] hover:bg-white/10 hover:text-white">
              <X size={17} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-[#0f1117] p-2 sm:p-3">
          {viewerUrl ? (
            <iframe title="ArthaAI PDF research report" src={viewerUrl} className="h-full w-full rounded-lg bg-white" />
          ) : error ? (
            <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 text-center text-[13px] text-rose-300">
              <FileText size={30} />
              <p>Unable to open the PDF: {error}</p>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center gap-2 text-[13px] text-[#9aa0a6]">
              <Loader2 size={18} className="animate-spin text-[#8ab4f8]" /> Preparing your report…
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
