import { useEffect, useRef, useState } from 'react'
import { Download, FileText, Loader2, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import { api } from '../api/client'
import Logo from './Logo'

// Configure PDF.js worker using official CDN matching pdfjs-dist version 3.11.174
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
}

function PdfPageItem({ pdfDoc, pageNum, scale = 1.0 }) {
  const canvasRef = useRef(null)
  const [rendering, setRendering] = useState(true)

  useEffect(() => {
    let active = true
    let renderTask = null

    const render = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum)
        if (!active) return

        const canvas = canvasRef.current
        if (!canvas) return
        const context = canvas.getContext('2d')

        // Render at 1.5x of current scale for crisp text on retina/mobile screens
        const viewport = page.getViewport({ scale: scale * 1.5 })
        canvas.height = viewport.height
        canvas.width = viewport.width

        renderTask = page.render({
          canvasContext: context,
          viewport,
        })
        await renderTask.promise
        if (active) setRendering(false)
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error(`Page ${pageNum} render error:`, err)
        }
      }
    }

    render()

    return () => {
      active = false
      if (renderTask) {
        try {
          renderTask.cancel()
        } catch {}
      }
    }
  }, [pdfDoc, pageNum, scale])

  return (
    <div className="flex flex-col items-center mb-6 last:mb-2 w-full">
      <div className="relative shadow-2xl rounded-lg overflow-hidden border border-white/10 bg-white max-w-full">
        {rendering && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs">
            <Loader2 size={24} className="animate-spin text-emerald-400" />
          </div>
        )}
        <canvas ref={canvasRef} className="max-w-full h-auto block" />
      </div>
      <div className="mt-2 text-center text-[11px] font-mono text-slate-400">
        Page {pageNum} of {pdfDoc.numPages}
      </div>
    </div>
  )
}

export default function PdfViewerModal({ jobId, pdfUrl, onClose }) {
  const [pdfDoc, setPdfDoc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [scale, setScale] = useState(1.0)
  const [rawBlobUrl, setRawBlobUrl] = useState(null)
  const [useNativeEmbed, setUseNativeEmbed] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let active = true
    let blobObjectUrl = null
    const controller = new AbortController()

    const loadPdf = async () => {
      setLoading(true)
      setError(null)
      try {
        let arrayBuffer = null

        if (pdfUrl && pdfUrl.startsWith('blob:')) {
          const resp = await fetch(pdfUrl, { signal: controller.signal })
          arrayBuffer = await resp.arrayBuffer()
          blobObjectUrl = pdfUrl
        } else if (jobId && !jobId.startsWith('chat_')) {
          let blob = null
          try {
            blob = await api.getPdf(jobId, { signal: controller.signal })
          } catch (firstErr) {
            // Retry with / without research_ prefix
            const altId = jobId.startsWith('research_')
              ? jobId.replace('research_', '')
              : `research_${jobId}`
            try {
              blob = await api.getPdf(altId, { signal: controller.signal })
            } catch {
              throw firstErr
            }
          }
          arrayBuffer = await blob.arrayBuffer()
          blobObjectUrl = URL.createObjectURL(blob)
        } else if (pdfUrl) {
          const resp = await fetch(pdfUrl, { signal: controller.signal })
          if (!resp.ok) throw new Error(`Could not fetch PDF: ${resp.status}`)
          const blob = await resp.blob()
          arrayBuffer = await blob.arrayBuffer()
          blobObjectUrl = URL.createObjectURL(blob)
        } else {
          throw new Error('No PDF dossier is available for this session yet. Complete an equity audit first.')
        }

        if (!active) return
        setRawBlobUrl(blobObjectUrl)

        // Attempt PDF.js canvas rendering
        try {
          const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(arrayBuffer),
            cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
            cMapPacked: true,
          })

          const doc = await loadingTask.promise
          if (active) {
            setPdfDoc(doc)
            setLoading(false)
          }
        } catch (pdfErr) {
          console.warn('PDF.js canvas rendering fallback to native embed:', pdfErr)
          if (active) {
            setUseNativeEmbed(true)
            setLoading(false)
          }
        }
      } catch (err) {
        if (active && err?.name !== 'AbortError') {
          console.error('Failed to load PDF in-app:', err)
          setError(err.message || 'Unable to open PDF document.')
          setLoading(false)
        }
      }
    }

    void loadPdf()

    return () => {
      active = false
      controller.abort()
      if (blobObjectUrl && blobObjectUrl !== pdfUrl) {
        URL.revokeObjectURL(blobObjectUrl)
      }
    }
  }, [jobId, pdfUrl, retryCount])

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const zoomIn = () => setScale((s) => Math.min(2.0, s + 0.15))
  const zoomOut = () => setScale((s) => Math.max(0.65, s - 0.15))
  const zoomReset = () => setScale(1.0)

  const cleanJobId = (jobId || 'dossier').replace('research_', '')

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-0 sm:p-5 backdrop-blur-md animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="PDF report viewer"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className="flex h-full sm:h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-none sm:rounded-2xl border-0 sm:border border-white/15 bg-[#181a1f] shadow-2xl">
        {/* Modal Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-white/10 bg-[#1e2026] px-3.5 py-2.5 sm:px-6 sm:py-3 shrink-0">
          <div className="flex min-w-0 items-center gap-2.5">
            <Logo size={24} />
            <div className="min-w-0">
              <p className="truncate text-[13px] sm:text-[14px] font-bold text-white">
                ArthaLens AI Institutional Dossier
              </p>
              <p className="text-[10px] font-mono text-[#9aa0a6] hidden sm:block">
                In-App Evidence Dossier · Press Esc to close
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {pdfDoc && !useNativeEmbed && (
              <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-slate-300">
                <button
                  type="button"
                  onClick={zoomOut}
                  className="rounded p-1 hover:bg-white/10 hover:text-white transition cursor-pointer"
                  title="Zoom Out"
                  aria-label="Zoom Out"
                >
                  <ZoomOut size={13} />
                </button>
                <button
                  type="button"
                  onClick={zoomReset}
                  className="px-1 text-[11px] font-mono hover:text-emerald-400 transition cursor-pointer"
                  title="Reset Zoom"
                >
                  {Math.round(scale * 100)}%
                </button>
                <button
                  type="button"
                  onClick={zoomIn}
                  className="rounded p-1 hover:bg-white/10 hover:text-white transition cursor-pointer"
                  title="Zoom In"
                  aria-label="Zoom In"
                >
                  <ZoomIn size={13} />
                </button>
              </div>
            )}

            {rawBlobUrl && (
              <>
                <button
                  type="button"
                  onClick={() => setUseNativeEmbed((v) => !v)}
                  className="hidden md:inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
                  title="Toggle between Canvas & Native viewer"
                >
                  <RotateCcw size={12} />
                  <span>{useNativeEmbed ? 'Canvas Mode' : 'Native View'}</span>
                </button>

                <a
                  href={rawBlobUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hidden sm:inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/20 transition cursor-pointer"
                  title="Open in new browser tab"
                >
                  <span>Tab ↗</span>
                </a>

                <a
                  href={rawBlobUrl}
                  download={`arthalens_research_${cleanJobId}.pdf`}
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#22c55e] to-[#16a34a] px-3 py-1.5 text-[11.5px] font-bold text-black shadow transition hover:brightness-110 cursor-pointer"
                  title="Download PDF file"
                >
                  <Download size={13} />
                  <span>Download</span>
                </a>
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close PDF viewer"
              className="rounded-lg p-1.5 text-[#9aa0a6] hover:bg-white/10 hover:text-white transition cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* PDF Viewport */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#0d0e12] p-2 sm:p-6 scroll-slim flex flex-col items-center">
          {loading ? (
            <div className="my-auto flex flex-col items-center justify-center gap-3 py-12 text-center text-[#9aa0a6]">
              <Loader2 size={28} className="animate-spin text-emerald-400" />
              <p className="text-[13.5px] font-medium text-slate-200">
                Preparing your report… Rendering institutional PDF dossier
              </p>
              <p className="text-[11px] text-slate-400">
                Assembling high-resolution pages for your device
              </p>
            </div>
          ) : error && !rawBlobUrl ? (
            <div role="alert" className="my-auto flex flex-col items-center justify-center gap-3 py-10 text-center max-w-md px-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-lg">
                <FileText size={24} />
              </div>
              <p className="text-[15px] font-bold text-white">Institutional PDF Dossier</p>
              <p className="text-[12px] text-slate-300 leading-relaxed max-w-sm">
                {error.includes('No PDF dossier is available')
                  ? 'Your institutional research dossier is ready to compile from verified evidence.'
                  : error}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRetryCount((c) => c + 1)}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-xs font-bold text-black shadow-md hover:brightness-110 cursor-pointer"
                >
                  <RotateCcw size={13} />
                  <span>Retry In-App View</span>
                </button>
                {jobId && !jobId.startsWith('chat_') && (
                  <a
                    href={api.pdfUrl(jobId)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 cursor-pointer"
                  >
                    <span>Open Direct Link ↗</span>
                  </a>
                )}
              </div>
            </div>
          ) : useNativeEmbed || (!pdfDoc && rawBlobUrl) ? (
            <div className="w-full h-full flex flex-col flex-1 min-h-[560px]">
              <object
                data={rawBlobUrl}
                type="application/pdf"
                className="w-full flex-1 min-h-[560px] rounded-xl border border-white/10 bg-[#16181e]"
              >
                <div className="flex flex-col items-center justify-center p-8 text-center text-slate-300 gap-3 my-auto">
                  <FileText size={36} className="text-emerald-400" />
                  <p className="font-semibold text-sm">Institutional PDF Dossier Ready</p>
                  <p className="text-xs text-slate-400 max-w-sm">
                    Your device web engine handles PDFs directly via download or dedicated viewer.
                  </p>
                  <div className="flex gap-2.5 mt-2">
                    <a
                      href={rawBlobUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 rounded-xl bg-emerald-500 text-black font-bold text-xs shadow-md hover:brightness-110"
                    >
                      Open in New Tab
                    </a>
                    <a
                      href={rawBlobUrl}
                      download={`arthalens_research_${cleanJobId}.pdf`}
                      className="px-4 py-2 rounded-xl bg-white/10 border border-white/15 text-white font-medium text-xs hover:bg-white/15"
                    >
                      Download PDF
                    </a>
                  </div>
                </div>
              </object>
            </div>
          ) : pdfDoc ? (
            <div className="w-full flex flex-col items-center max-w-4xl">
              {Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1).map((pageNum) => (
                <PdfPageItem
                  key={pageNum}
                  pdfDoc={pdfDoc}
                  pageNum={pageNum}
                  scale={scale}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
