export function applyModelTheme(provider: string, model: string) {
  const p = (provider || '').toLowerCase()
  const m = (model || '').toLowerCase()

  // Basic brand palette per provider/model family
  // Colors chosen for recognizability and adequate contrast in dark/light themes
  const palettes: Record<string, { accent: string; accentDark: string }> = {
    openai: { accent: '#00A67E', accentDark: '#008F6C' }, // ChatGPT green
    openrouter: { accent: '#7c3aed', accentDark: '#6d28d9' }, // violet
    anthropic: { accent: '#C15F3C', accentDark: '#9E4B30' }, // Claude rust
    gemini: { accent: '#4B79F7', accentDark: '#3A64D6' }, // Gemini blue
    azure: { accent: '#2563eb', accentDark: '#1d4ed8' }, // blue
    ollama: { accent: '#10b981', accentDark: '#059669' }, // emerald
    together: { accent: '#ec4899', accentDark: '#db2777' }, // pink
    fireworks: { accent: '#f97316', accentDark: '#ea580c' }, // orange
    perplexity: { accent: '#00B3FF', accentDark: '#008FCC' }, // cyan
    mistral: { accent: '#eab308', accentDark: '#ca8a04' }, // amber
    deepseek: { accent: '#06b6d4', accentDark: '#0891b2' }, // cyan
    cohere: { accent: '#f59e0b', accentDark: '#d97706' }, // amber-ish
  }

  // Optional model-specific overrides
  const byModel: Array<{ test: (m: string) => boolean; accent: string; accentDark: string }> = [
    { test: id => id.includes('gpt-4o') || id.includes('gpt-5'), accent: '#00A67E', accentDark: '#008F6C' },
    { test: id => id.includes('sonnet') || id.includes('opus') || id.includes('claude'), accent: '#C15F3C', accentDark: '#9E4B30' },
    { test: id => id.includes('mixtral') || id.includes('mistral'), accent: '#eab308', accentDark: '#ca8a04' },
    { test: id => id.includes('llama') || id.includes('llama-3'), accent: '#4B79F7', accentDark: '#3A64D6' },
  ]

  let palette = palettes[p] || { accent: '#3b82f6', accentDark: '#2563eb' } // default blue
  for (const rule of byModel) {
    if (m && rule.test(m)) { palette = { accent: rule.accent, accentDark: rule.accentDark }; break }
  }

  const body = document.body
  body.style.setProperty('--accent', palette.accent)
  body.style.setProperty('--accent-dark', palette.accentDark)
  body.setAttribute('data-model-theme', `${p}:${m}`)
}
