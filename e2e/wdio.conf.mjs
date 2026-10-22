// UI tests against the real desktop app through tauri-driver + msedgedriver (Windows only).
// Run with `npm run test:e2e`. Not part of `npm test`: it builds and opens the real app.
//
// The app runs with a throwaway WebView2 profile (WEBVIEW2_USER_DATA_FOLDER), the billing gate off and PostHog
// pointed nowhere, so the owner's reminders, account and analytics are never touched.
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tauriDir = path.join(root, 'src-tauri')
const application = path.join(tauriDir, 'target', 'debug', 'habitglo.exe')
const devUrl = JSON.parse(readFileSync(path.join(tauriDir, 'tauri.conf.json'), 'utf8')).build.devPath
const nativeDriver =
  process.env.MSEDGEDRIVER_PATH ?? path.join(os.homedir(), '.cursor-tools', 'msedgedriver', 'msedgedriver.exe')
const tauriDriverBin = path.join(os.homedir(), '.cargo', 'bin', 'tauri-driver.exe')

let vite
let tauriDriver

const killTree = (child) => {
  if (child?.pid && child.exitCode === null) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
}

const stopTestApp = () =>
  spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts', 'stop-test-app.ps1')], {
    stdio: 'ignore',
  })

const waitForUrl = async (url, timeoutMs) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Dev server did not answer on ${url}`)
}

export const config = {
  runner: 'local',
  // An explicit host/port makes WebdriverIO talk to tauri-driver instead of managing browser drivers.
  hostname: '127.0.0.1',
  port: 4444,
  specs: ['./specs/**/*.e2e.mjs'],
  maxInstances: 1,
  capabilities: [{ 'tauri:options': { application } }],
  logLevel: 'warn',
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: { ui: 'bdd', timeout: 120000 },

  onPrepare: async () => {
    if (process.platform !== 'win32') throw new Error('The desktop e2e tests run on Windows only.')
    const running = spawnSync('tasklist', ['/FI', 'IMAGENAME eq habitglo.exe', '/NH'], { encoding: 'utf8' }).stdout
    if (/habitglo\.exe/i.test(running)) throw new Error('Quit HabitGlo from the tray first; e2e never attaches to a real session.')

    const build = spawnSync('cargo build --no-default-features', { cwd: tauriDir, stdio: 'inherit', shell: true })
    if (build.status !== 0) throw new Error('cargo build failed')

    vite = spawn('npm run dev', {
      cwd: root,
      shell: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, VITE_BILLING_GATE: 'false', VITE_POSTHOG_HOST: 'http://127.0.0.1:9' },
    })
    await waitForUrl(devUrl, 90000)
  },

  beforeSession: () => {
    const profile = mkdtempSync(path.join(os.tmpdir(), 'habitglo-e2e-'))
    process.env.HABITGLO_E2E_PROFILE = profile
    tauriDriver = spawn(tauriDriverBin, ['--native-driver', nativeDriver], {
      stdio: [null, process.stdout, process.stderr],
      windowsHide: true,
      env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: profile },
    })
  },

  afterSession: () => {
    stopTestApp()
    killTree(tauriDriver)
    const profile = process.env.HABITGLO_E2E_PROFILE
    if (profile) rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
  },

  onComplete: () => {
    stopTestApp()
    killTree(vite)
  },
}
