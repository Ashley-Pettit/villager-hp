import type { EngineInterface } from 'claude-code'

// Keeping villager-hp up to date: /hp update on request, and once a day at
// session start a check against prod that installs a newer version by itself
// (/hp autoupdate off to be told instead). Uses Claude Code's own
// `claude plugin update`, as the installer does; a restart applies it.

const MOD = 'villager-hp'
const LATEST = 'https://raw.githubusercontent.com/Ashley-Pettit/villager-hp/prod/.claude-plugin/plugin.json'
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000

// Whether version a is newer than b: "2.10.0" > "2.9.3".
export const isNewer = (a: string, b: string) => {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0)
  const pb = b.split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return false
}

export async function installedVersion($: EngineInterface): Promise<string> {
  const manifest = JSON.parse(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`)) as { version?: string }
  return manifest.version ?? '0.0.0'
}

export async function latestVersion($: EngineInterface): Promise<string> {
  const res = await $.http.fetch(LATEST)
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
  const manifest = JSON.parse(res.text) as { version?: string }
  if (typeof manifest.version !== 'string') throw new Error('no version on prod')
  return manifest.version
}

// The claude command: where Claude Code's installer puts it (often not on
// PATH, and never for the desktop app), else whatever PATH finds.
async function claudeBin($: EngineInterface): Promise<string> {
  const info = await $.session.info().catch(() => null)
  const root = info?.configRoot?.replace(/[\\/]+$/, '')
  if (root) {
    const home = root.slice(0, Math.max(root.lastIndexOf('/'), root.lastIndexOf('\\')))
    const win = info?.platform === 'windows'
    const path = win ? `${home}\\.local\\bin\\claude.exe` : `${home}/.local/bin/claude`
    if (await $.fs.exists(path).catch(() => false)) return path
  }
  return 'claude'
}

// Whether this copy came from the install line (the villager-hp catalog),
// which `claude plugin update` can update. A copy synced from claude.ai or
// loaded from a folder lives elsewhere and is updated where it came from.
export const isCatalogPath = (root: string) => /[\\/]plugins[\\/]cache[\\/]villager-hp[\\/]/i.test(root)

export const NOT_CATALOG =
  "This copy of villager-hp didn't come from the install line (it's synced from claude.ai, or loaded from a folder), so it can't update itself. Update it where it came from, or paste the install line to switch to the self-updating copy."

export type UpdateResult = { ok: boolean; detail: string }

// Refreshes the catalog, then updates the installed plugin.
export async function runUpdate($: EngineInterface): Promise<UpdateResult> {
  try {
    const bin = await claudeBin($)
    await $.process.run([bin, 'plugin', 'marketplace', 'update', MOD], { timeoutMs: 120_000 })
    const out = await $.process.run([bin, 'plugin', 'update', `${MOD}@${MOD}`], { timeoutMs: 120_000 })
    const detail = `${out.stdout}\n${out.stderr}`.trim()
    return { ok: out.exitCode === 0, detail }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

export async function isAutoUpdate($: EngineInterface): Promise<boolean> {
  return (await $.store.get('autoUpdate').catch(() => undefined)) !== false
}

// At most once a day: is prod newer than this copy? Installs it when auto
// update is on. Returns the newer version, or null when there's nothing new.
export async function dailyCheck($: EngineInterface): Promise<{ latest: string; installed: boolean } | null> {
  const last = await $.store.get('updateCheckedAt').catch(() => undefined)
  if (typeof last === 'number' && Date.now() - last < CHECK_EVERY_MS) return null
  await $.store.set('updateCheckedAt', Date.now()).catch(() => undefined)
  const [mine, latest] = await Promise.all([installedVersion($), latestVersion($)])
  if (!isNewer(latest, mine)) return null
  if (!isCatalogPath($.plugin.root)) {
    $.ui.toast(`villager-hp ${latest} is out. This copy comes from claude.ai or a folder: update it there.`)
    return { latest, installed: false }
  }
  if (!(await isAutoUpdate($))) {
    $.ui.toast(`villager-hp ${latest} is out. Type /hp update to get it.`)
    return { latest, installed: false }
  }
  const result = await runUpdate($)
  $.ui.toast(
    result.ok
      ? `villager-hp updated to ${latest}. Restart Claude to use it.`
      : `villager-hp ${latest} is out, but updating didn't finish. Type /hp update to try again.`,
  )
  return { latest, installed: result.ok }
}
