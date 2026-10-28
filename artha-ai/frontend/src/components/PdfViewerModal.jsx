import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, FileText, Loader2, X, ZoomIn, ZoomOut, RotateCcw, Maximize2, Minimize2 } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.js?url'
import { api } from '../api/client'
import Logo from './Logo'

// Configure PDF.js worker using local Vite asset URL with resilient CDN fallback
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  try {
    const localWorker = typeof pdfjsWorker === 'string' && pdfjsWorker ? pdfjsWorker : null
    const cdnWorker = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '3.11.174'}/pdf.worker.min.js`
    pdfjsLib.GlobalWorkerOptions.workerSrc = localWorker || cdnWorker
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
  }
}

/** Max comfortable reading width for fit-width mode (A4 page rendered in CSS pixels). */
const MAX_READING_WIDTH = 1040

/**
 * Measures the usable content box of the PDF scroll viewport (excluding padding
 * and the scrollbar). Using the real box avoids pages that are a few pixels too
 * wide, which is what pushes a "fit width" page off-centre and clips its right edge.
 */
function measureViewport(el) {
  if (!el) {
    return {
      width: Math.max((typeof window !== 'undefined' ? window.innerWidth : 900) - 32, 280),
      height: Math.max((typeof window !== 'undefined' ? window.innerHeight : 800) - 160, 360),
    }
  }
  const styles = window.getComputedStyle(el)
  const paddingX = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0)
  const paddingY = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0)
  const width = (el.clientWidth || el.getBoundingClientRect().width || 0) - paddingX
  const height = (el.clientHeight || el.getBoundingClientRect().height || 0) - paddingY
  return {
    width: Math.max(width, 280),
    height: Math.max(height, 360),
  }
}

function PdfPageItem({ pdfDoc, pageNum, scale = 1.0, fitMode = 'width', viewportRef }) {
  const canvasRef = useRef(null)
  const [rendering, setRendering] = useState(true)
  const [layoutTick, setLayoutTick] = useState(0)

  // Re-render on window resize and on any real viewport size change. Debounced
  // through requestAnimationFrame so a scrollbar appearing/disappearing cannot
  // cause a render/measure feedback loop.
  useEffect(() => {
    let frame = 0
    const schedule = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setLayoutTick((t) => t + 1))
    }
    window.addEventListener('resize', schedule)
    let observer = null
    if (typeof ResizeObserver !== 'undefined' && viewportRef?.current) {
      observer = new ResizeObserver(schedule)
      observer.observe(viewportRef.current)
    }
    return () => {
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
      if (observer) observer.disconnect()
    }
  }, [viewportRef])

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

        const box = measureViewport(viewportRef?.current)
        const baseViewport = page.getViewport({ scale: 1.0 })
        // The sheet has a 1px border on each side; reserve it so a fitted page
        // never creates a 2px horizontal overflow (and a stray scrollbar).
        const usableWidth = Math.max(box.width - 2, 200)

        // Both fit modes are computed from the *same* measured box. Fit Page
        // fits width and height; Fit Width caps at a comfortable reading width.
        // Zoom multiplies the fitted size, which allows real panning.
        let targetCssWidth
        if (fitMode === 'page') {
          // Reserve room for the page caption under each sheet so the complete
          // page (not just its top) is visible without scrolling.
          const usableHeight = Math.max(box.height - 42, 320)
          const fitScale = Math.min(usableWidth / baseViewport.width, usableHeight / baseViewport.height)
          targetCssWidth = baseViewport.width * fitScale * scale
        } else {
          const fittedWidth = Math.min(usableWidth, MAX_READING_WIDTH)
          targetCssWidth = fittedWidth * scale
        }
        // Never overflow sideways at the default 100% zoom; higher zoom is
        // deliberately pannable.
        if (scale <= 1) targetCssWidth = Math.min(targetCssWidth, usableWidth)

        const dpr = Math.min(window.devicePixelRatio || 1, 3)
        const targetScale = targetCssWidth / baseViewport.width
        const viewport = page.getViewport({ scale: targetScale * dpr })

        const cssWidth = Math.round(viewport.width / dpr)
        const cssHeight = Math.round(viewport.height / dpr)

        canvas.width = Math.round(viewport.width)
        canvas.height = Math.round(viewport.height)
        canvas.style.width = `${cssWidth}px`
        canvas.style.height = `${cssHeight}px`

        renderTask = page.render({ canvasContext: context, viewport })
        await renderTask.promise
        if (active) setRendering(false)
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error(`Page ${pageNum} render error:`, err)
          if (active) setRendering(false)
        }
      }
    }

    render()

    return () => {
      active = false
      if (renderTask) {
        try { renderTask.cancel() } catch { /* already finished */ }
      }
    }
  }, [pdfDoc, pageNum, scale, fitMode, layoutTick, viewportRef])

  return (
    <div className="flex w-full flex-col items-center">
      <div className="relative shrink-0 overflow-hidden rounded-sm border border-slate-700/50 bg-white shadow-[0_8px_36px_rgba(0,0,0,0.75)]">
        {rendering && (
          <div className="absolute inset-0 flex min-h-[120px] min-w-[120px] items-center justify-center bg-slate-900/60 backdrop-blur-xs">
            <Loader2 size={24} className="animate-spin text-emerald-400" />
          </div>
        )}
        {/* Canvas display size is set explicitly via style in JS — do NOT use w-full/h-auto here */}
        <canvas ref={canvasRef} style={{ display: 'block', margin: '0 auto' }} />
      </div>
      <div className="mt-1.5 text-center text-[11px] font-mono text-slate-400">
        Page {pageNum} of {pdfDoc.numPages}
      </div>
    </div>
  )
}

export default function PdfViewerModal({ jobId, pdfUrl, pdfBytes, pdfBlob, onClose, onSwitchToReport, hasReport = true }) {
  const [pdfDoc, setPdfDoc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [scale, setScale] = useState(1.0)
  const [rawBlobUrl, setRawBlobUrl] = useState(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let active = true
    let blobObjectUrl = null
    const controller = new AbortController()

    const loadPdf = async () => {
      setLoading(true)
      setError(null)
      try {
        let uint8Data = null

        // 1. If bytes were already decoded in memory, clone them so PDF.js worker transfer never detaches the caller's ArrayBuffer
        if (pdfBytes && pdfBytes.byteLength > 0) {
          uint8Data = new Uint8Array(pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength))
          if (pdfBlob) {
            blobObjectUrl = URL.createObjectURL(pdfBlob)
          } else {
            blobObjectUrl = URL.createObjectURL(new Blob([uint8Data], { type: 'application/pdf' }))
          }
        } else if (pdfBlob) {
          const buf = await pdfBlob.arrayBuffer()
          uint8Data = new Uint8Array(buf)
          blobObjectUrl = URL.createObjectURL(pdfBlob)
        } else if (pdfUrl && pdfUrl.startsWith('blob:')) {
          const resp = await fetch(pdfUrl, { signal: controller.signal })
          const buf = await resp.arrayBuffer()
          uint8Data = new Uint8Array(buf)
          blobObjectUrl = pdfUrl
        }

        if (!uint8Data && jobId && !jobId.startsWith('chat_')) {
          // 2. Fetch via getPdfData (Base64 JSON) so download managers like IDM never intercept
          try {
            const data = await api.getPdfData(jobId, { signal: controller.signal })
            if (data?.base64) {
              const binaryString = atob(data.base64)
              uint8Data = new Uint8Array(binaryString.length)
              for (let i = 0; i < binaryString.length; i++) {
                uint8Data[i] = binaryString.charCodeAt(i)
              }
              blobObjectUrl = URL.createObjectURL(new Blob([uint8Data], { type: 'application/pdf' }))
            }
          } catch {
            // Fallback: try alternate ID without research_ prefix
            const altId = jobId.startsWith('research_')
              ? jobId.replace('research_', '')
              : `research_${jobId}`
            try {
              const data = await api.getPdfData(altId, { signal: controller.signal })
              if (data?.base64) {
                const binaryString = atob(data.base64)
                uint8Data = new Uint8Array(binaryString.length)
                for (let i = 0; i < binaryString.length; i++) {
                  uint8Data[i] = binaryString.charCodeAt(i)
                }
                blobObjectUrl = URL.createObjectURL(new Blob([uint8Data], { type: 'application/pdf' }))
              }
            } catch {
              try {
                // Fallback to binary getPdf
                const blob = await api.getPdf(jobId, { signal: controller.signal })
                const buf = await blob.arrayBuffer()
                uint8Data = new Uint8Array(buf)
                blobObjectUrl = URL.createObjectURL(blob)
              } catch (pdfFetchErr) {
                if (!pdfUrl) throw pdfFetchErr
              }
            }
          }
        }

        if (!uint8Data && pdfUrl) {
          const resp = await fetch(pdfUrl, { signal: controller.signal })
          if (!resp.ok) throw new Error(`Could not fetch PDF: ${resp.status}`)
          const blob = await resp.blob()
          const buf = await blob.arrayBuffer()
          uint8Data = new Uint8Array(buf)
          blobObjectUrl = URL.createObjectURL(blob)
        }

        if (!uint8Data) {
          throw new Error('No PDF dossier is available for this session yet. Complete an equity audit first.')
        }

        if (!active || !uint8Data) return
        setRawBlobUrl(blobObjectUrl)

        // Attempt PDF.js canvas rendering (with main-thread fallback if worker is blocked)
        const cMapUrl = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '3.11.174'}/cmaps/`
        try {
          let doc
          try {
            const loadingTask = pdfjsLib.getDocument({
              data: uint8Data.slice(),
              cMapUrl,
              cMapPacked: true,
            })
            doc = await loadingTask.promise
          } catch {
            const fallbackTask = pdfjsLib.getDocument({
              data: uint8Data.slice(),
              cMapUrl,
              cMapPacked: true,
              disableWorker: true,
            })
            doc = await fallbackTask.promise
          }
          if (active) {
            setPdfDoc(doc)
            setLoading(false)
          }
        } catch (pdfErr) {
          console.warn('PDF.js canvas rendering fallback to in-app view:', pdfErr)
          if (active) {
            setError('Canvas rendering could not display this PDF on your device. You can explore the full interactive report in-app, or download the PDF file directly.')
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
  }, [jobId, pdfUrl, pdfBytes, pdfBlob, retryCount])


  const [fitMode, setFitMode] = useState('width')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const viewportRef = useRef(null)

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {})
      setIsFullscreen(true)
    } else {
      document.exitFullscreen?.().catch(() => {})
      setIsFullscreen(false)
    }
  }

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

  const handleClose = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {})
    }
    onClose?.()
  }

  const handleSwitchToReport = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {})
    }
    onSwitchToReport?.()
    onClose?.()
  }

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const zoomIn = () => setScale((s) => Math.min(2.5, s + 0.15))
  const zoomOut = () => setScale((s) => Math.max(0.5, s - 0.15))
  const zoomReset = () => setScale(1.0)

  const cleanJobId = (jobId || 'dossier').replace('research_', '')

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-[#0b0e14] h-full w-full overflow-hidden animate-fade-in select-none"
      role="dialog"
      aria-modal="true"
      aria-label="PDF report viewer"
    >
      {/* Edge-to-Edge Navigation Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#14171f] px-3 py-2 sm:px-6 sm:py-2.5 shrink-0 z-10 shadow-lg">
        {/* Left: Branding & Meta */}
        <div className="flex min-w-0 items-center gap-2.5">
          <Logo size={24} />
          {/* Long title takes a full row on phones — logo alone identifies it there */}
          <div className="hidden sm:block min-w-0">
            <p className="truncate text-[13px] sm:text-[14px] font-bold text-white flex items-center gap-2">
              <span>ArthaLens AI Institutional Dossier</span>
              {pdfDoc && (
                <span className="hidden md:inline-flex items-center text-[10.5px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {pdfDoc.numPages} {pdfDoc.numPages === 1 ? 'Page' : 'Pages'} · Audit Grade
                </span>
              )}
            </p>
            <p className="text-[10px] font-mono text-[#9aa0a6] hidden sm:block">
              In-App Evidence Dossier · Press Esc to close
            </p>
          </div>
        </div>

        {/* Center: Full-Page, Fit Width & Zoom Controls */}
        {pdfDoc && (
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1 shadow-inner">
            <button
              type="button"
              onClick={() => { setFitMode('page'); setScale(1.0); }}
              className={`px-2.5 py-1.5 sm:py-1 text-xs rounded-lg font-medium transition cursor-pointer ${
                fitMode === 'page'
                  ? 'bg-emerald-500/25 text-emerald-300 font-bold border border-emerald-500/40 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
              title="Full Page: fit entire page in screen height without scrolling"
            >
              Fit Page
            </button>
            <button
              type="button"
              onClick={() => { setFitMode('width'); setScale(1.0); }}
              className={`px-2.5 py-1.5 sm:py-1 text-xs rounded-lg font-medium transition cursor-pointer ${
                fitMode === 'width'
                  ? 'bg-emerald-500/25 text-emerald-300 font-bold border border-emerald-500/40 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
              title="Fit Width: expand report for comfortable full reading width"
            >
              Fit Width
            </button>

            <div className="h-4 w-px bg-white/15 mx-1" />

            <button
              type="button"
              onClick={zoomOut}
              className="rounded-lg p-1.5 sm:p-1 text-slate-300 hover:bg-white/10 hover:text-white transition cursor-pointer"
              title="Zoom Out"
              aria-label="Zoom Out"
            >
              <ZoomOut size={13} />
            </button>
            <button
              type="button"
              onClick={zoomReset}
              className="px-1 text-[11px] font-mono text-slate-300 hover:text-emerald-400 transition cursor-pointer"
              title="Reset Zoom to 100%"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              type="button"
              onClick={zoomIn}
              className="rounded-lg p-1.5 sm:p-1 text-slate-300 hover:bg-white/10 hover:text-white transition cursor-pointer"
              title="Zoom In"
              aria-label="Zoom In"
            >
              <ZoomIn size={13} />
            </button>

            <div className="h-4 w-px bg-white/15 mx-1 hidden sm:block" />

            <button
              type="button"
              onClick={toggleFullscreen}
              className="hidden sm:flex rounded-lg p-1 text-slate-300 hover:bg-white/10 hover:text-white transition cursor-pointer"
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          </div>
        )}

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={handleSwitchToReport}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition shadow-sm active:scale-95 cursor-pointer"
            style={{ backgroundColor: '#34d399', color: '#04120c' }}
            title="Return to the in-app interactive report"
          >
            <FileText size={13} />
            <span className="sm:hidden">Report</span>
            <span className="hidden sm:inline">Back to Report Page</span>
          </button>

          {rawBlobUrl && (
            <>
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
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#22c55e] to-[#16a34a] px-3 py-1.5 text-[11.5px] font-extrabold text-slate-950 shadow transition hover:brightness-110 cursor-pointer"
                title="Download PDF file"
              >
                <Download size={13} />
                <span>Download</span>
              </a>
            </>
          )}

          <button
            type="button"
            onClick={handleClose}
            aria-label="Close PDF viewer"
            className="rounded-lg p-2 sm:p-1.5 text-[#9aa0a6] hover:bg-white/10 hover:text-white transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* PDF Viewport - scrollable canvas with a self-centring stage. The stage
          uses w-max/min-w-full so a page narrower than the screen is centred with
          equal margins, while a zoomed page stays fully reachable by scrolling
          (a plain flex items-center container would clip its left edge). */}
      <div
        ref={viewportRef}
        className="scroll-slim min-h-0 w-full flex-1 overflow-auto bg-[#0a0c10] px-3 py-4 sm:px-6"
        style={{ scrollbarGutter: 'stable both-edges' }}
      >
        {loading ? (
          <div className="flex min-h-full flex-col items-center justify-center gap-3 py-12 text-center text-[#9aa0a6]">
            <Loader2 size={28} className="animate-spin text-emerald-400" />
            <p className="text-[13.5px] font-medium text-slate-200">
              Preparing your report… Rendering institutional PDF dossier
            </p>
            <p className="text-[11px] text-slate-400">
              Assembling high-resolution pages for your device
            </p>
          </div>
        ) : error || !pdfDoc ? (
          <div role="alert" className="flex min-h-full flex-col items-center justify-center gap-3.5 px-4 py-10 text-center max-w-md mx-auto animate-fade-in">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-lg">
              <FileText size={24} />
            </div>
            <p className="text-[15px] font-bold text-white">Institutional Research Dossier</p>
            <p className="text-[12px] text-slate-300 leading-relaxed max-w-sm">
              {error && error.includes('No PDF dossier is available')
                ? 'Your institutional research dossier is ready to view.'
                : error && error.includes('backend did not return a PDF')
                ? 'The static PDF file compilation is pending, but your full interactive research dossier is ready to view right now.'
                : error || 'Your full interactive research dossier is ready to view in-app.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleSwitchToReport}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#22c55e] to-[#16a34a] px-4 py-2.5 text-xs font-extrabold text-slate-950 shadow-lg shadow-emerald-500/25 hover:brightness-110 cursor-pointer active:scale-95"
                style={{ backgroundColor: '#34d399', color: '#04120c' }}
              >
                <FileText size={14} />
                <span>Open Interactive Report</span>
              </button>
              {rawBlobUrl && (
                <a
                  href={rawBlobUrl}
                  download={`arthalens_research_${cleanJobId}.pdf`}
                  className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 cursor-pointer"
                >
                  <Download size={13} />
                  <span>Download PDF</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => setRetryCount((c) => c + 1)}
                className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 cursor-pointer"
              >
                <RotateCcw size={13} />
                <span>Retry PDF</span>
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-transparent px-3 py-2 text-xs font-medium text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={13} />
                <span>Close</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex w-max min-w-full flex-col items-center gap-5 py-1">
            {Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1).map((pageNum) => (
              <PdfPageItem
                key={pageNum}
                pdfDoc={pdfDoc}
                pageNum={pageNum}
                scale={scale}
                fitMode={fitMode}
                viewportRef={viewportRef}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body)
  }

  return modalContent
}
