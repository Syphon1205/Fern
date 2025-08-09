import React from 'react'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.min.css'
import mermaid from 'mermaid'

type Props = {
  lang: string
  code: string
  defaultWrap?: boolean
}

function useMermaid(svgCode: string | null, deps: any[]) {
  const [svg, setSvg] = React.useState<string | null>(null)
  React.useEffect(() => {
    let mounted = true
    if (!svgCode) { setSvg(null); return }
    (async () => {
      try {
        const { svg } = await mermaid.render(`m-${Math.random().toString(36).slice(2)}`, svgCode)
        if (mounted) setSvg(svg)
      } catch {
        if (mounted) setSvg(null)
      }
    })()
    return () => { mounted = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return svg
}

export default function CodeBlock({ lang, code, defaultWrap }: Props) {
  const [wrap, setWrap] = React.useState(!!defaultWrap)
  const [copied, setCopied] = React.useState(false)

  const isMermaid = (lang || '').toLowerCase() === 'mermaid'
  const svg = useMermaid(isMermaid ? code : null, [isMermaid, code])

  const onCopy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(()=>setCopied(false), 800) } catch {}
  }

  const highlighted = React.useMemo(() => {
    try {
      if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value
      return hljs.highlightAuto(code).value
    } catch { return code }
  }, [code, lang])

  return (
    <div className="rounded-lg border border-white/10 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 text-xs bg-slate-800/60 border-b border-white/10">
        <div className="uppercase tracking-wide text-slate-300">{lang || 'text'}</div>
        <div className="flex items-center gap-2">
          <button className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/15" onClick={()=>setWrap(v=>!v)}>{wrap?'No wrap':'Wrap'}</button>
          <button className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/15" onClick={onCopy}>{copied?'Copied':'Copy'}</button>
        </div>
      </div>

      {isMermaid ? (
        svg ? (
          <div className="bg-slate-900 p-3 overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <pre className={`text-sm p-3 ${wrap? 'whitespace-pre-wrap break-words':'whitespace-pre overflow-x-auto'}`}><code>{code}</code></pre>
        )
      ) : (
        <pre className={`text-sm p-3 ${wrap? 'whitespace-pre-wrap break-words':'whitespace-pre overflow-x-auto'}`}>
          <code dangerouslySetInnerHTML={{ __html: highlighted }} />
        </pre>
      )}
    </div>
  )
}
