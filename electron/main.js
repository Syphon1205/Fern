const { app, BrowserWindow, dialog } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const http = require('http')
const fs = require('fs')

let pyProc = null
let mainWindow = null
let shuttingDown = false
const DEBUG = !!process.env.FERN_DEBUG

function getLogPath() {
  try {
    return path.join(app.getPath('userData'), 'fern.log')
  } catch {
    return path.join(process.cwd(), 'fern.log')
  }
}

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`
  try { fs.appendFileSync(getLogPath(), line) } catch {}
  try { console.log(...args) } catch {}
}

function waitForServer(url, timeoutMs = 15000) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(url, res => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve()
        } else {
          setTimeout(next, 300)
        }
        res.resume()
      })
      req.on('error', () => setTimeout(next, 300))
      const next = () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error('Server start timeout'))
        } else {
          tryOnce()
        }
      }
    }
    tryOnce()
  })
}

function getAppRoot() {
  // In dev, main.js is in electron/, web/ and Assets/ are at ../
  // In production, code is inside app.asar; large folders (backend, .venv) are unpacked next to it
  if (!app.isPackaged) return path.join(__dirname, '..')
  const resDir = path.dirname(__dirname) // .../resources
  const portableApp = path.join(resDir, 'app')
  const unpacked = path.join(resDir, 'app.asar.unpacked')
  try {
    if (fs.existsSync(portableApp)) return portableApp
  } catch {}
  return unpacked
}

function getAsarRoot() {
  if (!app.isPackaged) return path.join(__dirname, '..')
  const resDir = path.dirname(__dirname) // .../resources
  return path.join(resDir, 'app.asar')
}

function resolveDistDir() {
  // Prefer unpacked dist if present, otherwise fall back to asar-packed dist, else dev path
  const resPath = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..')
  const candidates = [
    // unpacked
    path.join(resPath, 'app.asar.unpacked', 'web', 'dist'),
    // inside asar
    path.join(resPath, 'app.asar', 'web', 'dist'),
    // plain app dir (portable target extracts to resources/app)
    path.join(resPath, 'app', 'web', 'dist'),
    // dev
    path.join(__dirname, '..', 'web', 'dist'),
  ]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p
    } catch {}
  }
  return candidates[0]
}

async function tryLoadOffline(win) {
  const resPath = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..')
  const dirs = [
    path.join(resPath, 'app.asar.unpacked', 'web', 'dist'),
    path.join(resPath, 'app.asar', 'web', 'dist'),
    path.join(resPath, 'app', 'web', 'dist'),
    path.join(__dirname, '..', 'web', 'dist'),
  ]
  const errors = []
  for (const d of dirs) {
    const indexPath = path.join(d, 'index.html')
    try {
      await win.loadFile(indexPath)
      // Map /static/* to this dir
      try {
        const filters = [ { urls: ['file:///static/*'] }, { urls: ['file://*/static/*'] } ]
        const handler = (details, cb) => {
          const rel = details.url.replace(/file:\/\/(?:[^/]+)?\/static\//, '')
          const target = path.join(d, rel)
          const redirectURL = 'file://' + target.replace(/\\/g, '/')
          cb({ redirectURL })
        }
        filters.forEach(f => win.webContents.session.webRequest.onBeforeRequest(f, handler))
      } catch {}
      log('Loaded offline UI from', indexPath)
      return true
    } catch (e) {
      errors.push({ indexPath, error: e?.message || String(e) })
    }
  }
  log('Failed to load offline UI', { errors })
  return false
}

function createWindow(offline = false) {
  const appRoot = getAppRoot()
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b0f18',
    title: 'Fern',
    icon: path.join(appRoot, 'Assets', 'Logo', 'fern-logo.ico'),
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.once('ready-to-show', () => win.show())
  win.on('closed', () => { /* no-op */ })
  if (process.env.FERN_DEBUG) {
    win.webContents.openDevTools({ mode: 'detach' })
  }
  mainWindow = win
  if (offline) {
    tryLoadOffline(win).then(ok => {
      if (!ok) {
        dialog.showErrorBox('Fern', 'Failed to load UI from disk. Please rebuild the web UI (web/npm run build).')
      }
    })
  } else {
    win.loadURL('http://127.0.0.1:8000')
  }
  return win
}

function resolveBackendBinary() {
  // Look for a bundled backend binary built by PyInstaller
  const resPath = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..')
  const candidates = [
    path.join(resPath, 'app', 'backend', 'bin', 'backend.exe'),
    path.join(resPath, 'app.asar.unpacked', 'backend', 'bin', 'backend.exe'),
    path.join(__dirname, '..', 'backend', 'bin', 'backend.exe'), // dev built binary
  ]
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p } catch {}
  }
  return null
}

function pyAvailable() {
  try {
    const which = process.platform === 'win32' ? 'where' : 'which'
    const res = spawn(which, ['python'], { stdio: 'ignore' })
    return new Promise((resolve)=>{
      res.on('exit',(code)=> resolve(code === 0))
      res.on('error',()=> resolve(false))
    })
  } catch { return Promise.resolve(false) }
}

async function startPython() {
  const appRoot = getAppRoot()
  const backendBin = resolveBackendBinary()
  let proc
  if (backendBin) {
    log('Starting bundled backend binary:', backendBin)
    const cwd = path.dirname(path.dirname(backendBin)) // .../backend
    if (process.platform === 'win32') {
      // Open in a separate console window
      proc = spawn('cmd.exe', ['/c', 'start', '"Fern Backend"', '"' + backendBin + '"'], {
        cwd,
        env: process.env,
        windowsHide: false,
        shell: false,
        detached: true,
        stdio: 'ignore',
      })
    } else {
      proc = spawn(backendBin, [], { cwd, env: process.env, detached: true, stdio: 'ignore' })
    }
  } else {
    // Fallback to python/uvicorn
    const venvPython = process.platform === 'win32'
      ? path.join(appRoot, '.venv', 'Scripts', 'python.exe')
      : path.join(appRoot, '.venv', 'bin', 'python')
    const hasVenv = fs.existsSync(venvPython)
    if (hasVenv) {
      log('Starting backend using venv python:', venvPython)
      const args = ['-m', 'uvicorn', 'backend.app:app', '--host', '127.0.0.1', '--port', '8000']
      if (process.platform === 'win32') {
        proc = spawn('cmd.exe', ['/c', 'start', '"Fern Backend"', '"' + venvPython + '"', ...args], {
          cwd: appRoot,
          env: process.env,
          windowsHide: false,
          shell: false,
          detached: true,
          stdio: 'ignore',
        })
      } else {
        proc = spawn(venvPython, args, { cwd: appRoot, env: process.env, detached: true, stdio: 'ignore' })
      }
    } else {
      log('Bundled backend not found; trying system Python')
      const hasPy = await pyAvailable()
      if (!hasPy) throw new Error('Python not available')
      const pyCmd = process.platform === 'win32' ? 'python' : 'python3'
      const args = ['-m', 'uvicorn', 'backend.app:app', '--host', '127.0.0.1', '--port', '8000']
      if (process.platform === 'win32') {
        proc = spawn('cmd.exe', ['/c', 'start', '"Fern Backend"', pyCmd, ...args], {
          cwd: appRoot,
          env: process.env,
          windowsHide: false,
          shell: false,
          detached: true,
          stdio: 'ignore',
        })
      } else {
        proc = spawn(pyCmd, args, { cwd: appRoot, env: process.env, detached: true, stdio: 'ignore' })
      }
    }
  }
  // When using 'start', proc represents the cmd stub; logs come from the console window.
  // We still health-check for readiness elsewhere.
  return proc
}

function stopPython() {
  if (pyProc && !pyProc.killed) {
    try {
      if (process.platform === 'win32') {
        // Graceful on Windows
        const { exec } = require('child_process')
        exec(`taskkill /pid ${pyProc.pid} /T /F`)
      } else {
        pyProc.kill('SIGTERM')
      }
    } catch {}
  }
}

app.on('ready', async () => {
  log('App ready')
  // Always show offline UI immediately to avoid blank window
  if (!mainWindow) createWindow(true)

  // First, check if a server is already running
  try {
    await waitForServer('http://127.0.0.1:8000/api/health', 2500)
    mainWindow?.loadURL('http://127.0.0.1:8000')
    log('Detected running backend; switched to online')
    return
  } catch {}

  // Start backend (bundled binary preferred) and switch when ready
  try {
    pyProc = await startPython()
  } catch (err) {
    log('Backend launch failed; staying offline', err?.message || String(err))
    return
  }

  try {
    await waitForServer('http://127.0.0.1:8000/api/health', 15000)
    mainWindow?.loadURL('http://127.0.0.1:8000')
    log('Backend started; switched to online')
  } catch (err) {
    log('Backend not ready in time; staying offline', err?.message || String(err))
  }
})

app.on('before-quit', () => {
  app.isQuiting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopPython()
    app.quit()
  }
})

app.on('activate', () => {
  // For macOS dock re-activate behavior. No-op here because single window.
})
