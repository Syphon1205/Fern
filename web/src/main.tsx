import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// Pre-apply theme/density before React mounts to prevent flash
(() => {
  // Ensure we have a persistent client_id for backend security guard
  try {
    let cid = localStorage.getItem('client_id')
    if (!cid) {
      if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        // @ts-ignore
        cid = crypto.randomUUID()
      } else {
        cid = String(Math.random()).slice(2) + '-' + Date.now()
      }
      localStorage.setItem('client_id', cid)
    }
  } catch {}

  try {
    const raw = localStorage.getItem('appSettings')
    let theme: 'dark'|'light' = 'dark'
    let density: 'comfortable'|'compact' = 'comfortable'
    let fontScale = 1
    if (raw) {
      const s = JSON.parse(raw)
      if (s && (s.theme === 'dark' || s.theme === 'light')) theme = s.theme
      if (s && (s.density === 'comfortable' || s.density === 'compact')) density = s.density
      if (s && typeof s.fontScale === 'number') fontScale = s.fontScale
    } else {
      // fall back to OS preference
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) theme = 'light'
    }
    const body = document.body
    body.classList.toggle('theme-light', theme === 'light')
    body.classList.toggle('theme-dark', theme === 'dark')
    body.classList.toggle('density-compact', density === 'compact')
    body.style.setProperty('--font-scale', String(fontScale))
  } catch {}
})()

const container = document.getElementById('root')!
createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
