import React from 'react'

export function formatInlineMarkdown(text = '') {
  if (!text) return ''
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="text-slate-300 italic">$1</em>')
    .replace(/`([^`]+)`/g, '<code class="rounded bg-white/10 px-1 py-0.5 text-[11.5px] font-mono text-emerald-300">$1</code>')
}

export default function CopilotMarkdown({ content }) {
  if (!content) return null

  // Ensure every bullet mark or capitalized section starts on a brand-new line
  const normalized = String(content)
    .replace(/\s*•\s*/g, '\n• ')
    .replace(/\s*\*\s*([A-Z][A-Z\s]{2,}:)/g, '\n• $1')
    .replace(/\s*(WHAT\s+(?:EXISTING|NEW)\s+[^:]+:)/g, '\n• $1')
    .replace(/\s*(TIME\s+HORIZON\s+[^:]+:)/g, '\n• $1')
    .replace(/\s*(EXACT\s+RULES\s+[^:]+:)/g, '\n• $1')

  const lines = normalized.split('\n')
  const elements = []
  let tableRows = []
  let inTable = false

  const flushTable = () => {
    if (tableRows.length > 0) {
      const header = tableRows[0]
      const rows = tableRows.slice(1).filter(r => !r.every(c => /^[-:| ]+$/.test(c)))
      elements.push(
        <div key={`table-${elements.length}`} className="my-3 overflow-x-auto rounded-xl border border-white/10 bg-black/20">
          <table className="w-full text-left text-[12px] text-[#e8eaed]">
            {header && (
              <thead className="border-b border-white/10 bg-white/5 font-semibold text-white">
                <tr>
                  {header.map((cell, cIdx) => (
                    <th key={cIdx} className="px-3 py-2">{cell}</th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody className="divide-y divide-white/5">
              {rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-white/[0.02]">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-3 py-2 text-[#cbd5e1]">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      tableRows = []
    }
    inTable = false
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const trimmed = rawLine.trim()

    // Table row detection (| ... |)
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true
      const cells = trimmed.split('|').slice(1, -1).map(c => c.trim())
      tableRows.push(cells)
      continue
    } else if (inTable) {
      flushTable()
    }

    if (!trimmed) {
      elements.push(<div key={`space-${i}`} className="h-1.5" />)
      continue
    }

    // Horizontal divider
    if (trimmed === '---') {
      elements.push(<hr key={`hr-${i}`} className="border-white/10 my-3" />)
      continue
    }

    // Formula callout ($$...$$ or lines with Formula:)
    if ((trimmed.startsWith('$$') && trimmed.endsWith('$$')) || trimmed.toLowerCase().startsWith('**formula:**')) {
      const cleanFormula = trimmed
        .replace(/^\$\$/, '')
        .replace(/\$\$$/, '')
        .replace(/^\*\*formula:\*\*\s*/i, '')
        .replace(/\\text\{([^}]+)\}/g, '$1')
        .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1 ÷ $2')
        .replace(/\\times/g, '×')
        .replace(/[{}]/g, '')
        .replace(/^`|`$/g, '')
        .trim()
      elements.push(
        <div key={`formula-${i}`} className="my-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center font-mono text-[13px] text-emerald-300 font-semibold shadow-inner">
          <span className="text-[10px] font-sans uppercase tracking-wider text-emerald-400/80 block mb-0.5">🧮 Formula</span>
          <span>{cleanFormula}</span>
        </div>
      )
      continue
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h3 key={`h3-${i}`} className="text-[14.5px] font-bold text-white mt-3.5 mb-1.5 flex items-center gap-1.5">
          {trimmed.replace(/^###\s+/, '')}
        </h3>
      )
      continue
    }

    if (trimmed.startsWith('#### ')) {
      elements.push(
        <h4 key={`h4-${i}`} className="text-[13px] font-semibold text-emerald-400 mt-2.5 mb-1">
          {trimmed.replace(/^####\s+/, '')}
        </h4>
      )
      continue
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      const quote = trimmed.replace(/^>\s+/, '')
      const formattedQuote = formatInlineMarkdown(quote)
      elements.push(
        <blockquote
          key={`quote-${i}`}
          className="border-l-2 border-emerald-500/60 bg-emerald-500/5 pl-3 py-1.5 my-2 text-[12px] italic text-[#cbd5e1] rounded-r-lg"
          dangerouslySetInnerHTML={{ __html: formattedQuote }}
        />
      )
      continue
    }

    // Bullet points
    if (trimmed.startsWith('* ') || trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      let bulletText = trimmed.replace(/^([*-•])\s+/, '')
      const colonIdx = bulletText.indexOf(':')
      if (colonIdx !== -1 && colonIdx < 60) {
        const potentialHeading = bulletText.substring(0, colonIdx).trim()
        const rest = bulletText.substring(colonIdx + 1).trim()
        if (!potentialHeading.startsWith('**')) {
          bulletText = `**${potentialHeading}:** ${rest}`
        }
      }
      const formatted = formatInlineMarkdown(bulletText)
      elements.push(
        <div key={`bullet-${i}`} className="flex items-start gap-2 pl-1.5 text-[13px] text-[#e8eaed] leading-relaxed my-1">
          <span className="text-emerald-400 font-bold text-sm leading-none mt-1 select-none">•</span>
          <span dangerouslySetInnerHTML={{ __html: formatted }} />
        </div>
      )
      continue
    }

    // Regular paragraph — auto-bold leading section headings like "Plain English Executive Summary:"
    let paraText = trimmed
    const colonIdx = paraText.indexOf(':')
    if (colonIdx !== -1 && colonIdx < 50) {
      const potentialHeading = paraText.substring(0, colonIdx).trim()
      const rest = paraText.substring(colonIdx + 1).trim()
      if (!potentialHeading.startsWith('**') && (potentialHeading === potentialHeading.toUpperCase() || /^[A-Z][a-zA-Z\s]+$/.test(potentialHeading))) {
        paraText = `**${potentialHeading}:** ${rest}`
      }
    }
    const formatted = formatInlineMarkdown(paraText)
    elements.push(
      <p
        key={`p-${i}`}
        className="text-[13px] leading-relaxed text-[#e8eaed]"
        dangerouslySetInnerHTML={{ __html: formatted }}
      />
    )
  }

  if (inTable) {
    flushTable()
  }

  return <div className="space-y-1">{elements}</div>
}
