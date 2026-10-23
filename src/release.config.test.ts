import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('release config', () => {
  it('keeps package, Tauri and Cargo versions in lockstep', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string }
    const tauri = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8')) as {
      package: { version: string }
    }
    const cargo = readFileSync(resolve(root, 'src-tauri/Cargo.toml'), 'utf8')
    expect(tauri.package.version).toBe(pkg.version)
    expect(cargo).toContain(`version = "${pkg.version}"`)
  })

  it('lists only public files that exist for the desktop bundle', () => {
    const files = JSON.parse(readFileSync(resolve(root, 'desktop-public-files.json'), 'utf8')) as string[]
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      expect(existsSync(resolve(root, 'public', file)), file).toBe(true)
    }
  })

  it('has an updater public key and GitHub latest.json endpoint', () => {
    const tauri = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8')) as {
      tauri: { updater: { active: boolean; dialog: boolean; pubkey: string; endpoints: string[] } }
    }
    expect(tauri.tauri.updater.active).toBe(true)
    expect(tauri.tauri.updater.dialog).toBe(true)
    expect(tauri.tauri.updater.pubkey.length).toBeGreaterThan(80)
    expect(tauri.tauri.updater.endpoints).toEqual([
      'https://github.com/hwan18/HabitGlo/releases/latest/download/latest.json',
    ])
  })
})
