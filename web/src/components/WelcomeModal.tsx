import React from 'react'

export default function WelcomeModal({ open, onClose, onOpenSettings }: { open: boolean, onClose: () => void, onOpenSettings: () => void }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative glass rounded-lg p-5 w-[min(92vw,560px)] shadow-xl">
        <div className="mb-3">
          <div className="text-2xl font-semibold flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
            Welcome to Fern
          </div>
          <div className="text-slate-300 mt-1">A sleek, electron-powered chat UI with streaming, markdown, code blocks, and animated backgrounds.</div>
        </div>

        <div className="space-y-3 text-sm">
          <p>
            🔐 <span className="font-medium">Bring your own API keys.</span> Fern doesn’t include model keys. Open <span className="font-mono">Settings</span> to paste your keys
            for your provider(s): OpenAI, OpenRouter, Anthropic, Gemini, Azure, Ollama, Together, Fireworks, Perplexity, Mistral, DeepSeek, Cohere, LiteLLM, vLLM.
          </p>
          <p>
            ✨ <span className="font-medium">Highlights:</span> Live letter-by-letter streaming, KaTeX math, syntax-highlighted code blocks with copy/wrap, Mermaid diagrams,
            model-themed UI, and a beautiful animated background.
          </p>
          <p>
            💡 Tip: You can fine-tune visuals and density in Settings. Background animation intensity also adapts to theme.
          </p>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button className="ghost-btn" onClick={onClose}>Got it</button>
          <button className="btn-primary" onClick={()=>{ onOpenSettings(); onClose(); }}>Open Settings</button>
        </div>
      </div>
    </div>
  )
}
