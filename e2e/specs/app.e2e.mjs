import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const NEW_REMINDER = 'E2E 물 마시기 ✓'
const list = () => $('ul[aria-label="Your reminders"]')
const rows = () => $$('ul[aria-label="Your reminders"] > li')

async function switchToWindow(urlPart) {
  await browser.waitUntil(async () => (await browser.getWindowHandles()).length >= 2, {
    timeout: 30000,
    timeoutMsg: 'Both HabitGlo windows should open',
  })
  for (const handle of await browser.getWindowHandles()) {
    await browser.switchToWindow(handle)
    if ((await browser.getUrl()).includes(urlPart)) return
  }
  throw new Error(`No window with ${urlPart}`)
}
const mainWindow = () => switchToWindow('/app')
const ledWindow = () => switchToWindow('overlay.html')

const ledAnimation = () =>
  browser.execute(() => {
    const animation = document.getAnimations()[0]
    return animation ? { state: animation.playState, duration: Number(animation.effect.getTiming().duration) } : null
  })
const ledText = () => browser.execute(() => document.body.textContent ?? '')

describe('HabitGlo desktop app', () => {
  before(() => {
    // Never touch the owner's data: the app must run on a throwaway WebView2 folder in %TEMP% (ours from
    // wdio.conf.mjs, or msedgedriver's own scoped_dir, which it passes to the WebView), never com.habitglo.app.
    const commandLines = spawnSync(
      'powershell',
      ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='msedgewebview2.exe'\" | ForEach-Object CommandLine"],
      { encoding: 'utf8' },
    ).stdout
    const dirs = [...new Set((commandLines.match(/--user-data-dir=("[^"]+"|\S+)/g) ?? []).map((d) => d.slice(16).replaceAll('"', '')))]
    const temp = path.resolve(os.tmpdir()).toLowerCase()
    const ours = process.env.HABITGLO_E2E_PROFILE?.toLowerCase()
    const isThrowaway = (dir) =>
      dir.toLowerCase().startsWith(temp) && ((ours && dir.toLowerCase().startsWith(ours)) || /\\scoped_dir[^\\]*\\/i.test(dir))
    if (dirs.some((d) => /com\.habitglo\.app/i.test(d)) || !dirs.some(isThrowaway)) {
      throw new Error(`Refusing to run: the app is not on a throwaway WebView2 profile. Seen: ${dirs.join(' | ')}`)
    }
  })

  it('opens with the starter reminders', async () => {
    await mainWindow()
    await list().waitForDisplayed({ timeout: 30000 })
    await expect(rows()).toBeElementsArrayOfSize(5)
    await expect($('button=DRINK WATER')).toBeDisplayed()
  })

  it('adds a reminder with Enter and shows it on the LED', async () => {
    await mainWindow()
    await $('#new-reminder').setValue(NEW_REMINDER)
    await browser.keys('Enter')
    await expect($(`button=${NEW_REMINDER}`)).toBeDisplayed()
    await expect(rows()).toBeElementsArrayOfSize(6)
    await expect($('#new-reminder')).toHaveValue('')

    await ledWindow()
    await browser.waitUntil(async () => (await ledText()).includes(NEW_REMINDER), {
      timeoutMsg: 'The LED strip should show the new reminder',
    })
  })

  it('turns a reminder off and deletes it', async () => {
    await mainWindow()
    const toggle = $(`button[role="switch"][aria-label='Show "${NEW_REMINDER}" on the LED']`)
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')

    await ledWindow()
    await browser.waitUntil(async () => !(await ledText()).includes(NEW_REMINDER), {
      timeoutMsg: 'A reminder that is off should leave the LED strip',
    })

    await mainWindow()
    await $(`button[aria-label='Delete "${NEW_REMINDER}"']`).click()
    await expect($(`button=${NEW_REMINDER}`)).not.toBeExisting()
    await expect(rows()).toBeElementsArrayOfSize(5)
  })

  it('switches speed to Fast and position to Bottom in Settings', async () => {
    await ledWindow()
    const before = await ledAnimation()
    const topY = await browser.execute(() => window.screenY)
    expect(before?.duration).toBeGreaterThan(0)

    await mainWindow()
    await $('button[aria-label="Settings"]').click()
    await $('dialog[open]').waitForDisplayed()
    // The radios are visually hidden; click their labels like a user would.
    await $('input[name="speed"][value="fast"]').parentElement().click()
    await $('input[name="position"][value="bottom"]').parentElement().click()
    await expect($('input[name="speed"][value="fast"]')).toBeSelected()
    await expect($('input[name="position"][value="bottom"]')).toBeSelected()
    await $('button[aria-label="Close settings"]').click()
    await expect($('dialog[open]')).not.toBeExisting()

    await ledWindow()
    await browser.waitUntil(
      async () => {
        const now = await ledAnimation()
        return now !== null && now.duration < before.duration * 0.75
      },
      { timeoutMsg: 'Fast should make the LED scroll faster' },
    )
    await browser.waitUntil(async () => (await browser.execute(() => window.screenY)) > topY + 200, {
      timeoutMsg: 'Bottom should move the LED strip to the bottom of the screen',
    })
  })

  it('hides and shows the LED strip', async () => {
    await mainWindow()
    await $('button*=Hide LED').click()
    await expect($('button*=Show LED')).toBeDisplayed()
    await ledWindow()
    await browser.waitUntil(async () => (await ledAnimation())?.state === 'paused', {
      timeoutMsg: 'A hidden strip should stop animating',
    })

    await mainWindow()
    await $('button*=Show LED').click()
    await expect($('button*=Hide LED')).toBeDisplayed()
    await ledWindow()
    await browser.waitUntil(async () => (await ledAnimation())?.state === 'running', {
      timeoutMsg: 'A shown strip should animate again',
    })
  })
})
