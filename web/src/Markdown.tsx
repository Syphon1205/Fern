import React, { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.min.css'
import 'katex/dist/katex.min.css'

import CodeBlock from './components/CodeBlock'

type Block = { type: 'code', lang: string, code: string } | { type: 'text', text: string }

function parse(input: string): Block[] {
  const lines = input.split(/\r?\n/)
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const m = line.match(/^```\s*([\w+-]*)\s*$/)
    if (m) {
      const lang = m[1] || ''
      i++
      const code: string[] = []
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i])
        i++
      }
      // skip closing fence
      if (i < lines.length && /^```\s*$/.test(lines[i])) i++
      blocks.push({ type: 'code', lang, code: code.join('\n') })
      continue
    }
    // accumulate text until next fence
    const text: string[] = []
    while (i < lines.length && !/^```/.test(lines[i])) {
      text.push(lines[i])
      i++
    }
    if (text.length) blocks.push({ type: 'text', text: text.join('\n') })
  }
  return blocks
}

// Configure marked for syntax highlighting
marked.setOptions({
  gfm: true,
  breaks: true,
  highlight(code: string, lang?: string) {
    try {
      if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value
      return hljs.highlightAuto(code).value
    } catch {
      return code
    }
  }
})

export default function Markdown({ content, wrapDefault }: { content: string, wrapDefault?: boolean }) {
  const cleaned = useMemo(()=> content.replace(/\r/g, '').replace(/^\uFEFF/, ''), [content])
  const blocks = useMemo(()=> parse(cleaned), [cleaned])
  return (
    <div className="prose prose-invert max-w-none">
      {blocks.map((b, idx) => b.type === 'text' ? (
        <MarkdownHTML key={idx} markdown={b.text} />
      ) : (
        <CodeBlock key={idx} lang={b.lang} code={b.code} defaultWrap={!!wrapDefault} />
      ))}
    </div>
  )
}

function MarkdownHTML({ markdown }: { markdown: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(markdown) as string
    return DOMPurify.sanitize(raw)
  }, [markdown])

  // KaTeX auto-render (dynamic import to avoid TS type issues)
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    (async () => {
      try {
        const mod: any = await import('katex/contrib/auto-render')
        const renderMathInElement = mod.default || mod.renderMathInElement || mod
        if (ref.current && typeof renderMathInElement === 'function') {
          renderMathInElement(ref.current, {
            delimiters: [
              { left: '$$', right: '$$', display: true },
              { left: '$', right: '$', display: false },
              { left: '\\(', right: '\\)', display: false },
              { left: '\\[', right: '\\]', display: true }
            ]
          })
        }
      } catch {}
    })()
  }, [html])

  return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
}

// CodeBlock moved to ./components/CodeBlock
