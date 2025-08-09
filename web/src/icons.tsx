import React from 'react'

function svg(path: React.ReactNode, size: number, title: string) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label={title} role="img">
      <title>{title}</title>
      {path}
    </svg>
  )
}

// Wrapper to apply common stroke styles
const G = ({ children }: { children: React.ReactNode }) => (
  <g fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">{children}</g>
)

function imgIcon(src: string, title: string, size: number) {
  return <img src={src} width={size} height={size} alt={title} title={title} style={{ display: 'inline-block' }} />
}

export function modelIcon(modelId: string | undefined, size = 16) {
  const id = (modelId || '').toLowerCase()
  // GPT/OpenAI
  if (id.includes('gpt') || id.includes('o4') || id.startsWith('openai')) {
    return imgIcon('/assets/Icons/openai.svg', 'GPT', size)
  }
  // Claude (Anthropic)
  if (id.includes('claude')) {
    return imgIcon('/assets/Icons/claude-color.svg', 'Claude', size)
  }
  // Gemini
  if (id.includes('gemini')) {
    return imgIcon('/assets/Icons/gemini-color.svg', 'Gemini', size)
  }
  // Llama
  if (id.includes('llama')) {
    return svg(
      <G>
        <path d="M6 17c3 1 9 1 12 0"/>
        <path d="M8 17V9l2-2 2 2v8"/>
        <path d="M10 7l1-2 1 2"/>
      </G>, size, 'Llama')
  }
  // Mistral (wind)
  if (id.includes('mistral') || id.includes('mixtral')) {
    return svg(
      <G>
        <path d="M3 9h10c2 0 2-3 0-3"/>
        <path d="M3 15h14c3 0 3-4 0-4"/>
      </G>, size, 'Mistral')
  }
  // Qwen (dragon curve)
  if (id.includes('qwen')) {
    return svg(
      <G>
        <path d="M6 12a6 6 0 1 1 6 6"/>
        <path d="M12 18l3-3"/>
      </G>, size, 'Qwen')
  }
  // DeepSeek
  if (id.includes('deepseek')) {
    return svg(
      <G>
        <path d="M4 12l8-8 8 8-8 8z"/>
        <path d="M8 12l4-4 4 4-4 4z"/>
      </G>, size, 'DeepSeek')
  }
  // Phi
  if (id.includes('phi')) {
    return svg(
      <G>
        <circle cx="12" cy="12" r="7"/>
        <path d="M12 5v14M8 10h8"/>
      </G>, size, 'Phi')
  }
  return svg(<G><circle cx="12" cy="12" r="8" /></G>, size, 'Model')
}

export function providerIcon(provider: string | undefined, size = 16) {
  const p = (provider || '').toLowerCase()
  // OpenRouter (sail)
  if (p.includes('openrouter')) {
    return imgIcon('/assets/Icons/openrouter.svg', 'OpenRouter', size)
  }
  // OpenAI (knot)
  if (p.includes('openai')) {
    return imgIcon('/assets/Icons/openai.svg', 'OpenAI', size)
  }
  // Anthropic (A)
  if (p.includes('anthropic')) {
    return imgIcon('/assets/Icons/anthropic.svg', 'Anthropic', size)
  }
  // Google/Gemini
  if (p.includes('gemini') || p.includes('google')) {
    return imgIcon('/assets/Icons/gemini-color.svg', 'Google', size)
  }
  // Azure
  if (p.includes('azure')) {
    return imgIcon('/assets/Icons/azure-color.svg', 'Azure', size)
  }
  // Ollama (ram)
  if (p.includes('ollama')) {
    return svg(
      <G>
        <path d="M7 14a3 3 0 0 1 6 0v3H7z"/>
        <path d="M13 14a3 3 0 1 1 3 3"/>
      </G>, size, 'Ollama')
  }
  // Together
  if (p.includes('together')) {
    return imgIcon('/assets/Icons/together-color.svg', 'Together', size)
  }
  // Fireworks
  if (p.includes('fireworks')) {
    return imgIcon('/assets/Icons/fireworks-color.svg', 'Fireworks', size)
  }
  // Perplexity
  if (p.includes('perplexity')) {
    return imgIcon('/assets/Icons/perplexity-color.svg', 'Perplexity', size)
  }
  // Mistral
  if (p.includes('mistral')) {
    return imgIcon('/assets/Icons/mistral-color.svg', 'Mistral', size)
  }
  // DeepSeek
  if (p.includes('deepseek')) {
    return imgIcon('/assets/Icons/deepseek-color.svg', 'DeepSeek', size)
  }
  // Cohere
  if (p.includes('cohere')) {
    return imgIcon('/assets/Icons/cohere-color.svg', 'Cohere', size)
  }
  // LiteLLM (no dedicated icon; use OpenAI as generic)
  if (p.includes('litellm')) {
    return imgIcon('/assets/Icons/openai.svg', 'LiteLLM', size)
  }
  // vLLM
  if (p.includes('vllm')) {
    return imgIcon('/assets/Icons/vllm-color.svg', 'vLLM', size)
  }
  return svg(<G><rect x="5" y="5" width="14" height="14" rx="3" /></G>, size, 'Provider')
}
