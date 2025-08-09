import React, { useEffect, useState } from 'react'

export type AppSettings = {
  theme: 'dark'|'light'|'blackwhite'|'midnight'|'highcontrast'|'ruby'|'ocean'|'magma'|'seagreen'|'openai'|'gemini'|'anthropic'|'perplexity'|'ferndark'|'fernlight'
  density: 'comfortable'|'compact'
  fontScale: number
  defaultReasoning: boolean
  codeWrapDefault: boolean
}

const DEFAULTS: AppSettings = {
  theme: 'blackwhite',
  density: 'comfortable',
  fontScale: 1,
  defaultReasoning: false,
  codeWrapDefault: false,
}

export function getStoredSettings(): AppSettings {
  try { const raw = localStorage.getItem('appSettings'); if (raw) return { ...DEFAULTS, ...JSON.parse(raw) } } catch {}
  return DEFAULTS
}

export function applySettingsToDocument(s: AppSettings) {
  const body = document.body
  // Clear previous theme-* classes
  Array.from(body.classList)
    .filter(cls => cls.startsWith('theme-'))
    .forEach(cls => body.classList.remove(cls))
  // Apply new theme class
  const themeClass = `theme-${s.theme}`
  body.classList.add(themeClass)
  // Maintain dark/light base toggles for existing CSS
  const darkThemes = ['dark','blackwhite','midnight','highcontrast','ruby','ocean','magma','seagreen','openai','gemini','anthropic','perplexity','ferndark'] as const
  body.classList.toggle('theme-light', s.theme === 'light')
  body.classList.toggle('theme-dark', darkThemes.includes(s.theme as any))
  body.classList.toggle('density-compact', s.density === 'compact')
  body.style.setProperty('--font-scale', String(s.fontScale))
}

export default function SettingsModal({ open, onClose, onSave }: { open: boolean, onClose: ()=>void, onSave: (s: AppSettings)=>void }) {
  const [settings, setSettings] = useState<AppSettings>(getStoredSettings())
  const [server, setServer] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const cid = (()=>{ try { return localStorage.getItem('client_id') || '' } catch { return '' } })()
    const headers = new Headers(init?.headers || {})
    if (!headers.has('X-Client-ID') && cid) headers.set('X-Client-ID', cid)
    const res = await fetch(path, { ...init, headers })
    if (!res.ok) throw new Error(String(res.status))
    return res.json()
  }

  useEffect(()=>{
    if (!open) return
    setSettings(getStoredSettings())
    ;(async()=>{
      setLoading(true)
      try {
        const data = await api<any>('/api/settings')
        setServer(data || {})
      } catch {
        setServer({})
      } finally {
        setLoading(false)
      }
    })()
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg glass rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button className="px-2 py-1 rounded border border-white/10 hover:bg-white/10" onClick={onClose}>Close</button>
        </div>

        <div className="space-y-4 text-sm">
          {/* App appearance */}
          <div>
            <label className="block mb-1 text-slate-300">Theme</label>
            <select className="w-full bg-slate-800/60 border border-white/10 rounded px-2 py-1" value={settings.theme} onChange={e=>setSettings(s=>({...s, theme: e.target.value as any}))}>
              <optgroup label="Base">
                <option value="blackwhite">Black & White</option>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="ferndark">Fern Dark (Green/Black)</option>
                <option value="fernlight">Fern Light (Green/White)</option>
                <option value="midnight">Midnight</option>
                <option value="highcontrast">High Contrast</option>
                <option value="ruby">Ruby</option>
                <option value="ocean">Ocean</option>
                <option value="magma">Magma</option>
                <option value="seagreen">Sea Green</option>
              </optgroup>
              <optgroup label="AI Model Themed">
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
                <option value="anthropic">Anthropic</option>
                <option value="perplexity">Perplexity</option>
              </optgroup>
            </select>
          </div>
          <div>
            <label className="block mb-1 text-slate-300">Density</label>
            <select className="w-full bg-slate-800/60 border border-white/10 rounded px-2 py-1" value={settings.density} onChange={e=>setSettings(s=>({...s, density: e.target.value as any}))}>
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </div>
          <div>
            <label className="block mb-1 text-slate-300">Font scale</label>
            <input type="range" min={0.9} max={1.2} step={0.05} value={settings.fontScale} onChange={e=>setSettings(s=>({...s, fontScale: Number(e.target.value)}))} className="w-full" />
          </div>
          <div className="flex items-center gap-2">
            <input id="def-reason" type="checkbox" checked={settings.defaultReasoning} onChange={e=>setSettings(s=>({...s, defaultReasoning: e.target.checked}))} />
            <label htmlFor="def-reason">Enable reasoning by default</label>
          </div>
          <div className="flex items-center gap-2">
            <input id="code-wrap" type="checkbox" checked={settings.codeWrapDefault} onChange={e=>setSettings(s=>({...s, codeWrapDefault: e.target.checked}))} />
            <label htmlFor="code-wrap">Wrap code blocks by default</label>
          </div>

          <hr className="border-white/10" />

          {/* Backend defaults & API keys */}
          <div>
            <div className="mb-2 text-slate-300">Backend defaults</div>
            <label className="block mb-1">Default provider</label>
            <select className="w-full bg-slate-800/60 border border-white/10 rounded px-2 py-1" value={server.provider||''} onChange={e=>setServer(s=>({...s, provider: e.target.value}))}>
              {['','openai','openrouter','anthropic','gemini','azure','ollama','together','fireworks','perplexity','mistral','deepseek','cohere','litellm','vllm'].map(p=>(<option key={p} value={p}>{p||'—'}</option>))}
            </select>
          </div>
          <div>
            <label className="block mb-1">Default model</label>
            <input className="w-full bg-slate-800/60 border border-white/10 rounded px-2 py-1" placeholder="e.g. gpt-4o-mini" value={server.model||''} onChange={e=>setServer(s=>({...s, model: e.target.value}))} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              'OPENAI_API_KEY','OPENROUTER_API_KEY','ANTHROPIC_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY','AZURE_OPENAI_API_KEY','AZURE_OPENAI_ENDPOINT','TOGETHER_API_KEY','FIREWORKS_API_KEY','PERPLEXITY_API_KEY','MISTRAL_API_KEY','DEEPSEEK_API_KEY','COHERE_API_KEY','LITELLM_API_KEY','VLLM_API_KEY','LITELLM_BASE_URL','VLLM_BASE_URL'
            ].map(key=> (
              <div key={key}>
                <label className="block mb-1 text-slate-300">{key}</label>
                <input
                  className="w-full bg-slate-800/60 border border-white/10 rounded px-2 py-1"
                  type={key.endsWith('_BASE_URL') ? 'text' : 'password'}
                  placeholder={server[key]===true? 'Set (leave blank to keep)': 'Enter value or leave blank'}
                  value={typeof server[key]==='string'? server[key] : ''}
                  onChange={e=>setServer(s=>({...s, [key]: e.target.value}))}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button className="px-3 py-1.5 rounded border border-white/10 hover:bg-white/10" onClick={onClose}>Cancel</button>
          <button disabled={loading} className="btn-primary" onClick={async()=>{
            // Save UI settings locally
            localStorage.setItem('appSettings', JSON.stringify(settings));
            applySettingsToDocument(settings);
            onSave(settings)
            // Save server settings
            const toSend: Record<string, any> = {}
            Object.entries(server).forEach(([k,v])=>{
              if (typeof v === 'string') {
                // send as-is; backend merges and interprets empty string as clear
                toSend[k] = v
              } else if (['provider','model'].includes(k)) {
                toSend[k] = v
              }
            })
            try { await api('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toSend) }) } catch {}
            onClose()
          }}>Save</button>
        </div>
      </div>
    </div>
  )
}
