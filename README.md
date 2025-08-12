<div align="center">

# 🌿 Fern — AI Chat Desktop

Elegant, streaming chat UI for multiple AI providers. Built with FastAPI (backend), React + Tailwind (web), and Electron (desktop). Features beautiful animated backgrounds, syntax-highlighted code blocks, KaTeX math, and Mermaid diagrams.

<br/>

![status](https://img.shields.io/badge/status-alpha-10b981)
![framework](https://img.shields.io/badge/web-React%20%2B%20Tailwind-38bdf8)
![electron](https://img.shields.io/badge/desktop-Electron-6c59ff)
![backend](https://img.shields.io/badge/backend-FastAPI-059669)

</div>

<img width="1402" height="757" alt="Screenshot 2025-08-10 063251" src="https://github.com/user-attachments/assets/7417a79f-3326-4726-b432-e1ba450e6066" />


---

## ✨ Highlights
- __Letter‑by‑letter streaming__ via WebSocket with a smooth typewriter effect.
- __Markdown rendering__ with KaTeX math and Mermaid diagram support.
- __Code blocks__ with syntax highlighting (highlight.js), copy, and wrap toggle.
- __Animated backgrounds__ with theme‑aware accent glow.
- __Multi‑provider ready__: OpenAI, OpenRouter, Anthropic, Gemini, Azure, Ollama, Together, Fireworks, Perplexity, Mistral, DeepSeek, Cohere, LiteLLM, vLLM.

> Note: Fern requires you to bring your own API keys. A Welcome popup appears on first launch to guide you to Settings.

---

## 🧰 Prerequisites
- Python 3.10+
- Node.js 18+
- Windows/macOS/Linux

---

## 🚀 Quick Start (Dev)

1) Create and activate a Python virtual environment

```powershell
python -m venv .venv
. .venv\Scripts\Activate.ps1   # PowerShell on Windows
```

2) Install backend deps

```powershell
pip install -r requirements.txt
```

3) Build web UI

```powershell
cd web
npm install
npm run build    # outputs to web/dist
```

4) Run Electron (spawns FastAPI automatically)

```powershell
cd ../electron
npm install
npm start
```

The app will open at http://127.0.0.1:8000 in an Electron window. On first launch, the __Welcome__ modal will prompt you to open __Settings__ and paste your API keys.

---

## 🔑 API Keys
Set environment variables before launching (any that apply):

```powershell
$Env:OPENAI_API_KEY = "sk-..."
$Env:ANTHROPIC_API_KEY = "sk-ant-..."
$Env:GOOGLE_API_KEY = "AIza..."           # Gemini
$Env:OPENROUTER_API_KEY = "sk-or-..."
# ...and so on for the providers you use
```

You can also paste keys in the __Settings__ dialog in the app.

---

## 📦 Package Desktop App (Electron)
Fern uses `electron-builder` for packaging.

1) Ensure the web UI is built:
```powershell
cd web
npm run build
```

2) Build installers with electron-builder:
```powershell
cd ../electron
npm install
npm run dist
```

Artifacts are written to `electron/dist/` (NSIS on Windows, DMG on macOS, AppImage on Linux). Icons are sourced from `Assets/Logo`.

---

## 🖌️ Theming & Visuals
- Choose themes in Settings; animated background intensity adapts per theme.
- “Glass” UI lets the glow shine through; adjust in `web/src/index.css` if desired.

---

## 🛠️ Tech Stack
- Backend: `FastAPI`, `Uvicorn`
- Web: `React`, `Tailwind`, `marked`, `highlight.js`, `katex`, `mermaid`
- Desktop: `Electron`, `electron-builder`

---

## 🤝 Contributing
PRs welcome! Please open issues for bugs/requests. Ensure `web` builds and the Electron app starts before submitting changes.

---

## 📄 License
MIT
