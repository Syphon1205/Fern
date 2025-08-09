import React, { useEffect, useMemo, useRef, useState } from 'react'
import { modelIcon, providerIcon } from './icons'
import Markdown from './Markdown'
import SettingsModal, { applySettingsToDocument, getStoredSettings, type AppSettings } from './components/SettingsModal'
import { applyModelTheme } from './theme'
import BackgroundGradient from './components/BackgroundGradient'
import WelcomeModal from './components/WelcomeModal'
 

// Types
type Message = { role: 'system'|'user'|'assistant', content: string, reasoning?: string, created_at?: string }
interface Conversation { id: string; title: string; updated_at?: string; pinned?: boolean }

// Helpers
function dayLabel(d: Date) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 24*60*60*1000
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  if (t === startOfToday) return 'Today'
  if (t === startOfYesterday) return 'Yesterday'
  return d.toLocaleDateString()
}
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

export default function App() {
  const [convs, setConvs] = useState<Conversation[]>([])
  const [filter, setFilter] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([{ role: 'system', content: 'You are a helpful assistant.' }])
  const [input, setInput] = useState('')
  const [provider, setProvider] = useState('openai')
  const [model, setModel] = useState('')
  const [models, setModels] = useState<{id:string,name:string}[]>([])
  const [streaming, setStreaming] = useState(false)
  const [reasoning, setReasoning] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [streamReason, setStreamReason] = useState('')
  const wsRef = useRef<WebSocket|null>(null)
  const [streamStart, setStreamStart] = useState<number|undefined>(undefined)
  const [streamChars, setStreamChars] = useState(0)
  const [tokensPerSec, setTokensPerSec] = useState(0)
  // Typewriter rendering buffer/loop
  const renderBufRef = useRef('')
  const typerTimerRef = useRef<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const endReceivedRef = useRef(false)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [appSettings, setAppSettings] = useState<AppSettings>(getStoredSettings())

  // Apply persisted UI theme/density/font on load and whenever settings change
  useEffect(() => {
    applySettingsToDocument(appSettings)
  }, [appSettings])

  // Auto-scroll to bottom when messages or streaming text update
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // If user is near bottom or we are streaming, keep sticking to bottom
    const nearBottom = el.scrollTop + el.clientHeight > el.scrollHeight - 200
    if (nearBottom || streaming) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, streamText, streamReason, streaming])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typerTimerRef.current) {
        window.clearInterval(typerTimerRef.current)
        typerTimerRef.current = null
      }
      try { wsRef.current?.close() } catch {}
      wsRef.current = null
    }
  }, [])

  function startTyper() {
    if (typerTimerRef.current) return
    // Reveal 1 char per frame @ ~60fps for true letter-by-letter
    typerTimerRef.current = window.setInterval(() => {
      const buf = renderBufRef.current
      if (!buf) {
        // When buffer is empty and streaming ended, finalize pending message
        if (!streaming) {
          if (endReceivedRef.current) {
            endReceivedRef.current = false
            setMessages(prev => [...prev, { role: 'assistant', content: streamText, reasoning: streamReason || undefined }])
            setStreamText('')
            setStreamReason('')
          }
          if (typerTimerRef.current) {
            window.clearInterval(typerTimerRef.current)
            typerTimerRef.current = null
          }
        }
        return
      }
      const take = buf.slice(0, 1)
      renderBufRef.current = buf.slice(1)
      setStreamText(prev => prev + take)
    }, 16)
  }

  function queueText(t: string) {
    if (!t) return
    renderBufRef.current += t
    startTyper()
  }

  // Apply accent colors based on provider/model selection for non-branded themes
  useEffect(() => {
    const themed = ['openai','gemini','anthropic','perplexity']
    if (!themed.includes(appSettings.theme as any)) {
      applyModelTheme(provider, model)
    }
  }, [provider, model, appSettings.theme])

  const filtered = useMemo(() => convs.filter(c => (c.title||'').toLowerCase().includes(filter.toLowerCase())), [convs, filter])
  const grouped = useMemo(() => {
    const pinned = filtered.filter(c => c.pinned)
    const others = filtered.filter(c => !c.pinned)
    const byDay: Record<string, Conversation[]> = { Today: [], Yesterday: [], Earlier: [] }
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const startOfYesterday = startOfToday - 24*60*60*1000
    for (const c of others) {
      const t = c.updated_at ? new Date(c.updated_at).getTime() : 0
      if (t >= startOfToday) byDay['Today'].push(c)
      else if (t >= startOfYesterday) byDay['Yesterday'].push(c)
      else byDay['Earlier'].push(c)
    }

  function dayLabel(d: Date) {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const startOfYesterday = startOfToday - 24*60*60*1000
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    if (t === startOfToday) return 'Today'
    if (t === startOfYesterday) return 'Yesterday'
    return d.toLocaleDateString()
  }
    return { pinned, byDay }
  }, [filtered])

  async function deleteConversation(id: string) {
    try {
      await api(`/api/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' })
    } catch {}
    await refreshConvos()
    if (activeId === id) {
      setActiveId(null)
      setMessages([{ role: 'system', content: 'You are a helpful assistant.' }])
    }
  }

  useEffect(() => { (async () => {
    await refreshConvos()
    await loadSettings()
    applySettingsToDocument(appSettings)
    // One-time welcome modal
    try {
      const seen = localStorage.getItem('fern.welcome.v1')
      if (!seen) setShowWelcome(true)
    } catch {}
  })() }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      setShowScrollBtn(el.scrollTop + el.clientHeight < el.scrollHeight - 200)
    }
    el.addEventListener('scroll', onScroll)
    onScroll()
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(()=>{
    const s = getStoredSettings()
    setAppSettings(s)
    applySettingsToDocument(s)
    setReasoning(!!s.defaultReasoning)
  }, [])

  useEffect(()=>{
    applyModelTheme(provider, model)
  }, [provider, model])

  useEffect(() => {
    // auto scroll on new content unless user scrolled up
    const el = scrollRef.current
    if (!el || showScrollBtn) return
    el.scrollTop = el.scrollHeight
  }, [messages, streamText])

  async function refreshConvos() {
    const data = await api<{conversations: Conversation[]}>('/api/conversations')
    setConvs(data.conversations || [])
    if (!activeId && data.conversations?.[0]) {
      await selectConversation(data.conversations[0].id)
    }
  }

  async function selectConversation(id: string) {
    setActiveId(id)
    const conv = await api<any>(`/api/conversations/${encodeURIComponent(id)}`)
    setMessages(conv.messages || [{ role: 'system', content: 'You are a helpful assistant.' }])
  }

  async function newConversation() {
    const conv = await api<any>('/api/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    setActiveId(conv.id)
    await refreshConvos()
    await selectConversation(conv.id)
  }

  async function togglePin(c: Conversation) {
    await api(`/api/conversations/${encodeURIComponent(c.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pinned: !c.pinned }) })
    await refreshConvos()
  }

  async function loadSettings() {
    const s = await api<any>('/api/settings')
    if (s.provider) setProvider(s.provider)
    await populateModels(s.provider || provider)
    if (s.model) setModel(s.model)
  }

  async function persistMessages(newMessages: Message[]) {
    if (!activeId) return
    await api(`/api/conversations/${encodeURIComponent(activeId)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: newMessages })
    })
    setMessages(newMessages)
    await refreshConvos()
  }

  async function populateModels(prov: string) {
    try {
      const d = await api<any>(`/api/models/${encodeURIComponent(prov)}`)
      setModels(d.models || [])
    } catch { setModels([]) }
  }

  async function send() {
    const text = input.trim()
    if (!text) return
    if (!activeId) {
      await newConversation()
    }
    setInput('')
    const userMsg: Message = { role: 'user', content: text }
    const msgs = [...messages, userMsg]
    setMessages(msgs)

    // WebSocket stream
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${scheme}://${window.location.host}/ws/chat`)
    wsRef.current = ws
    setStreaming(true)
    let accum = ''
    let phase: 'unknown'|'reason'|'answer' = 'unknown'
    setStreamText('')
    setStreamReason('')
    setStreamStart(Date.now())
    setStreamChars(0)
    setTokensPerSec(0)
    renderBufRef.current = ''
    if (typerTimerRef.current) { window.clearInterval(typerTimerRef.current); typerTimerRef.current = null }
    ws.onopen = () => {
      const cid = activeId
      // Strip non-standard fields (e.g., reasoning) before sending to provider
      const cleanMsgs = msgs.map(m => ({ role: m.role, content: m.content }))
      ws.send(JSON.stringify({ messages: cleanMsgs, provider, model, conversation_id: cid, reasoning }))
    }
    ws.onmessage = async (e) => {
      // Normalize incoming data to string (handles Blob/Text)
      const t = typeof e.data === 'string' ? e.data : (e.data instanceof Blob ? await e.data.text() : String(e.data))
      if (t === '[END]') {
        // End streaming but let the typewriter drain at 1 char/tick
        setStreaming(false)
        endReceivedRef.current = true
        try { wsRef.current?.close() } catch {}
        wsRef.current = null
        // If labels were present and we buffered into accum (no streaming), push it into the typewriter buffer to render progressively
        if (phase === 'unknown' && accum) {
          renderBufRef.current += accum
          startTyper()
        }
        return
      }
      accum += t
      // Always enqueue chunk for typewriter rendering
      queueText(t)
      // update speed stats
      setStreamChars(c => {
        const next = c + (typeof t === 'string' ? t.length : 0)
        const start = streamStart || Date.now()
        const elapsed = Math.max(0.001, (Date.now() - start) / 1000)
        // rough token estimate: 4 chars per token
        setTokensPerSec(Math.round((next / 4) / elapsed))
        return next
      })
      // Detect and split Reasoning / Answer sections on the fly
      if (phase === 'unknown') {
        const idx = accum.indexOf('Reasoning:')
        const ai = accum.indexOf('Answer:')
        if (idx !== -1 && ai !== -1 && ai > idx) {
          const reason = accum.slice(idx + 'Reasoning:'.length, ai).trim()
          const ans = accum.slice(ai + 'Answer:'.length)
          setStreamReason(reason)
          phase = 'answer'
          // (We already enqueued full chunk above; no early return)
        }
        if (idx !== -1 && ai === -1) {
          // still in reasoning only
          const reason = accum.slice(idx + 'Reasoning:'.length)
          setStreamReason(reason.trim())
          // continue; do not block streaming
        }
      }
      if (phase === 'reason') {
        const aidx = accum.indexOf('Answer:')
        const ridx = accum.indexOf('Reasoning:')
        if (aidx >= 0) {
          // Move to answer phase; compute reason up to Answer: and rest as answer
          const afterReason = accum.slice(ridx + 'Reasoning:'.length)
          const r = afterReason.slice(0, aidx - (ridx + 'Reasoning:'.length))
          const a = accum.slice(aidx + 'Answer:'.length)
          setStreamReason(r)
          phase = 'answer'
        } else {
          // If a blank line after Reasoning appears, switch to answer
          const afterReason = accum.slice(ridx + 'Reasoning:'.length)
          const blank = afterReason.indexOf('\n\n')
          if (blank >= 0) {
            const r = afterReason.slice(0, blank)
            const a = afterReason.slice(blank + 2)
            setStreamReason(r)
            phase = 'answer'
          } else {
            // Keep appending to reasoning
            setStreamReason(afterReason)
          }
        }
        // continue; do not block streaming
      }
      // Default: nothing else to do
    }
    ws.onerror = () => { setStreaming(false); wsRef.current = null }
    ws.onclose = () => { setStreaming(false); wsRef.current = null }
  }

  function stopStreaming() {
    try { wsRef.current?.close() } catch {}
    wsRef.current = null
    if (typerTimerRef.current) { window.clearInterval(typerTimerRef.current); typerTimerRef.current = null }
    // flush remaining render buffer into text
    if (renderBufRef.current) {
      const rest = renderBufRef.current
      renderBufRef.current = ''
      setStreamText(prev => prev + rest)
    }
    setStreaming(false)
    // Append whatever we have so far (if any)
    const content = streamText.trim()
    if (content) {
      setMessages(prev => [...prev, { role: 'assistant', content, reasoning: streamReason || undefined }])
    }
    setStreamText('')
    setStreamReason('')
  }

  function MessageBubble({ m, idx }: { m: Message, idx: number }) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(m.content)
    const canEdit = m.role === 'user'
    const onCopy = async () => { try { await navigator.clipboard.writeText(m.content) } catch {} }
    const onDelete = async () => {
      const next = messages.filter((_, i) => i !== idx)
      await persistMessages(next)
    }
    const onSave = async () => {
      const next = messages.map((mm, i) => i===idx? { ...mm, content: draft }: mm)
      await persistMessages(next)
      setEditing(false)
    }
    const onRegenerate = async () => {
      // find the last user message prior to this assistant
      let lastUser: string | null = null
      for (let i = idx - 1; i >= 0; i--) {
        if (messages[i].role === 'user') { lastUser = messages[i].content; break }
      }
      if (!lastUser) return
      setInput(lastUser)
      await send()
    }
    return (
      <div className={`flex gap-3 ${m.role==='user'?'justify-end':''}`}>
        {m.role==='assistant' && <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center">{modelIcon(model, 16)}</div>}
        <div className={`group rounded-2xl px-3 py-2 border relative ${m.role==='user'?'bg-slate-800/60 border-white/10':'bg-slate-900/60 border-white/10'} shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]`} style={{maxWidth:'80%'}}>
          <div className="absolute -top-2 right-1 opacity-0 group-hover:opacity-100 transition text-xs flex gap-2">
            <button className="ghost-btn" onClick={onCopy}>Copy</button>
            {m.role==='assistant' && <button className="ghost-btn" onClick={onRegenerate}>Regenerate</button>}
            {canEdit && !editing && <button className="ghost-btn" onClick={()=>setEditing(true)}>Edit</button>}
            <button className="ghost-btn ghost-btn--danger" onClick={onDelete}>Delete</button>
            {editing && (
              <>
                <button className="btn-primary px-3 py-0.5 rounded" onClick={onSave}>Save</button>
                <button className="ghost-btn" onClick={()=>{setEditing(false); setDraft(m.content)}}>Cancel</button>
              </>
            )}
          </div>
          {!editing ? (
            <div className="text-slate-100 text-sm">
              {m.role==='assistant' ? (
                <>
                  {m.reasoning && (
                    <div className="mb-2 rounded-lg border border-amber-300/20 bg-amber-900/10 p-2 text-amber-200 text-xs">{m.reasoning}</div>
                  )}
                  <Markdown content={m.content} wrapDefault={appSettings.codeWrapDefault} />
                </>
              ) : (
                <div className="whitespace-pre-wrap">{m.content}</div>
              )}
            </div>
          ) : (
            <textarea className="w-full bg-slate-800/60 border border-white/10 rounded p-2 text-sm" rows={Math.min(10, Math.max(3, m.content.split('\n').length))} value={draft} onChange={e=>setDraft(e.target.value)} />
          )}
        </div>
        {m.role==='user' && <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">U</div>}
      </div>
    )
  }

  async function saveConvSettings(sp?: string, temperature?: number|null, top_p?: number|null) {
    if (!activeId) return
    await api(`/api/conversations/${encodeURIComponent(activeId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system_prompt: sp ?? '', temperature, top_p }) })
  }

  return (
    <div className="relative z-10 h-screen grid grid-cols-[300px_1fr] gap-0">
      <BackgroundGradient />
      <WelcomeModal
        open={showWelcome}
        onClose={() => { try { localStorage.setItem('fern.welcome.v1', '1') } catch {} ; setShowWelcome(false) }}
        onOpenSettings={() => setShowSettings(true)}
      />
      {/* Sidebar */}
      <aside className="glass border-r">
        <div className="p-3 flex items-center gap-2">
          <button className="btn-primary" onClick={newConversation}>New</button>
          <input className="ml-auto bg-slate-800/60 border border-white/10 rounded px-2 py-1 w-full" placeholder="Search" value={filter} onChange={e=>setFilter(e.target.value)} />
        </div>
        <div className="overflow-y-auto min-h-0 p-2 space-y-2">
          {/* Pinned */}
          {grouped.pinned.length>0 && (
            <div>
              <div className="sidebar-title">Pinned</div>
              <div className="space-y-1">{grouped.pinned.map(c => (
                <div key={c.id} className={`sidebar-item ${activeId===c.id? 'sidebar-item--active':''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <button className="flex-1 text-left truncate" onClick={()=>selectConversation(c.id)}>{c.title||'Untitled'}</button>
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <button className="ghost-btn" onClick={(e)=>{e.stopPropagation(); togglePin(c)}}>Unpin</button>
                      <button className="ghost-btn ghost-btn--danger" onClick={(e)=>{e.stopPropagation(); deleteConversation(c.id)}}>Delete</button>
                    </div>
                  </div>
                </div>
              ))}</div>
            </div>
          )}
          {/* Dated groups */}
          {Object.entries(grouped.byDay).map(([label, items]) => items.length? (
            <div key={label}>
              <div className="sidebar-title">{label}</div>
              <div className="space-y-1">{items.map(c => (
                <div key={c.id} className={`sidebar-item ${activeId===c.id? 'sidebar-item--active':''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <button className="flex-1 text-left truncate" onClick={()=>selectConversation(c.id)}>{c.title||'Untitled'}</button>
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <button className="ghost-btn" onClick={(e)=>{e.stopPropagation(); togglePin(c)}}>Pin</button>
                      <button className="ghost-btn ghost-btn--danger" onClick={(e)=>{e.stopPropagation(); deleteConversation(c.id)}}>Delete</button>
                    </div>
                  </div>
                </div>
              ))}</div>
            </div>
          ): null)}
        </div>
      </aside>

        <main className="flex flex-col min-h-0">
        {/* Header: classic full-width toolbar (left design), flush to sidebar edge */}
        <header className="glass rounded-none border-b px-0 py-2">
          <div className="w-full grid grid-cols-[1fr_auto_1fr] items-center">
            {/* Left spacer to balance right controls */}
            <div className="h-0" />
            {/* Centered logo/title */}
            <div className="flex items-center justify-center gap-2">
              <img
                src="/assets/Logo/fern.svg"
                alt="Fern"
                className="h-6 w-6 object-contain"
              />
              <h1 className="font-semibold title-gradient">Fern</h1>
            </div>
            {/* Right controls */}
            <div className="flex items-center justify-end gap-2 pr-3 sm:pr-4">
              <div className="flex items-center gap-1 text-sm text-slate-300 shrink-0">{providerIcon(provider, 16)}</div>
              <select className="shrink-0 w-[8.25rem] sm:w-[10.5rem] md:w-[12.5rem]" value={provider} onChange={async e=>{ const p=e.target.value; setProvider(p); await populateModels(p); }}>
                {['openai','openrouter','anthropic','gemini','azure','ollama','together','fireworks','perplexity','mistral','deepseek','cohere','litellm','vllm'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select className="shrink-0 w-[10.5rem] md:w-[15rem] lg:w-[19rem]" value={model} onChange={e=>setModel(e.target.value)}>
                <option value="">Select a model</option>
                {models.map(m => <option key={m.id} value={m.id}>{m.name||m.id}</option>)}
              </select>
              <label className="switch inline-flex items-center gap-1 shrink-0"><input type="checkbox" checked={reasoning} onChange={e=>setReasoning(e.target.checked)} /> <span className="hidden sm:inline">Reasoning</span></label>
              <button className="ghost-btn shrink-0" onClick={()=>setShowSettings(true)}>Settings</button>
            </div>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
          {/* App Logo: show only when there are no messages yet */}
          {messages.filter(m=>m.role!=='system').length===0 && (
            <div className="max-w-2xl mx-auto flex justify-center mb-6">
              <img
                src="/assets/Logo/fern.svg"
                alt="Fern"
                className="h-20 md:h-28 lg:h-32 opacity-95 drop-shadow"
                onError={(e)=>{ const t=e.currentTarget; t.style.display='none'; (t.nextSibling as HTMLElement)?.classList.remove('hidden') }}
              />
              <div className="hidden text-3xl md:text-4xl font-extrabold tracking-wide">Fern</div>
            </div>
          )}
          {/* Welcome */}
          {messages.filter(m=>m.role!=='system').length===0 && (
            <div className="max-w-2xl mx-auto p-4 rounded-lg border border-white/10 bg-slate-900/60">
              <div className="mb-2 text-slate-300">Try one of these</div>
              <div className="flex flex-wrap gap-2">
                {['Summarize an article','Write Python','Explain a concept','Create a plan'].map((t,i)=>(
                  <button key={i} className="px-3 py-1 rounded border border-white/10 hover:bg-white/5" onClick={()=>setInput(t)}>{t}</button>
                ))}
              </div>
            </div>
          )}

          {/* Chat */}
          <div className="w-full px-0 space-y-3 max-w-3xl mx-auto">
            {(() => {
              const items: React.ReactNode[] = []
              let lastDay: string | null = null
              const list = messages.filter(m=>m.role!=='system')
              list.forEach((m, idx) => {
                if (m.created_at) {
                  const d = new Date(m.created_at)
                  const label = dayLabel(d)
                  if (label !== lastDay) {
                    lastDay = label
                    items.push(
                      <div key={`sep-${idx}`} className="sticky top-2 z-10 flex justify-center">
                        <div className="px-3 py-1 text-xs text-slate-300 border border-white/10 rounded-full bg-slate-900/70 backdrop-blur">{label}</div>
                      </div>
                    )
                  }
                }
                items.push(<MessageBubble key={idx} m={m} idx={idx} />)
              })
              return items
            })()}
            {(streamText || streamReason) && (
              <div className={`flex gap-3`}>
                <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">{modelIcon(model, 16)}</div>
                <div className={`rounded-2xl px-3 py-2 border bg-slate-900/60 border-white/10 space-y-2`} style={{maxWidth:'80%'}}>
                  {streamReason && (
                    <div className="rounded-lg border border-amber-300/20 bg-amber-900/10 p-2 text-amber-200 text-xs whitespace-pre-wrap">{streamReason}</div>
                  )}
                  {streamText && (
                    <div className="text-slate-100 text-sm space-y-2">
                      <Markdown content={streamText} wrapDefault={appSettings.codeWrapDefault} />
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="inline-block w-2 h-4 align-baseline bg-slate-300/80 animate-pulse" />
                        <span>{tokensPerSec} tok/s</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {streaming && !streamText && (
              <div className="flex items-center gap-2 text-slate-300 text-sm">
                <span className="w-2 h-2 bg-slate-500 rounded-full animate-pulse"></span>
                Generating…
              </div>
            )}
          </div>
        </div>

        {showScrollBtn && (
          <button className="fixed right-6 bottom-24 px-3 py-1.5 rounded-full bg-accent text-white shadow hover:bg-accent-dark z-30" onClick={()=>{ const el=scrollRef.current; if(el){ el.scrollTop = el.scrollHeight } }}>Jump to latest</button>
        )}

        {/* Center dock removed */}

        {/* Composer: centered */}
        <form className="glass border-t px-0 py-3 flex items-center gap-2 max-w-3xl mx-auto w-full" onSubmit={e=>{e.preventDefault(); streaming ? stopStreaming() : send()}}>
          <div className="flex-1">
            <textarea className="w-full bg-slate-800/60 border border-white/10 rounded-full px-4 py-2 h-11 resize-none" placeholder="Ask something..." value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send(); } }} />
          </div>
          {!streaming ? (
            <button className="btn-primary rounded-full h-11 px-5" disabled={!input.trim()} type="submit">Send</button>
          ) : (
            <button type="button" onClick={stopStreaming} className="rounded-full h-11 px-5 bg-red-600 hover:bg-red-500 text-white">Stop</button>
          )}
        </form>
      </main>
      <SettingsModal open={showSettings} onClose={()=>setShowSettings(false)} onSave={(s)=>{ setAppSettings(s); setShowSettings(false) }} />

      {/* GitHub button (bottom-left) */}
      <a
        href="https://github.com/Syphon1205/Fern"
        target="_blank"
        rel="noreferrer"
        className="fixed left-6 bottom-6 z-30 inline-flex items-center gap-2 px-3 py-2 rounded-full bg-slate-800/70 border border-white/10 text-slate-100 hover:bg-slate-700/70 backdrop-blur"
        title="Open Fern on GitHub"
      >
        <img src="/assets/Icons/github.svg" width={16} height={16} alt="GitHub" />
        <span className="hidden sm:inline">GitHub</span>
      </a>
    </div>
  )
}
