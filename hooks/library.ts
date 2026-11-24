import type { EngineInterface } from 'claude-code'

import type { LibItem, LibKind } from '../types'

// Your things to open: claude.ai artifacts, and Word docs and videos on this
// computer. Pinned ones first, then the most recently edited.

const DOC = /\.(docx|doc|dotx|rtf)$/i
const VIDEO = /\.(mp4|mov|m4v|avi|mkv|webm|wmv)$/i
// Where people keep documents and videos, under the home folder.
const ROOTS = ['Desktop', 'Documents', 'Downloads', 'Movies', 'Videos', 'OneDrive']
// Folders not worth walking into.
const SKIP = /^(\.|~\$|node_modules$|Library$|AppData$|\$RECYCLE|System Volume|Applications$|venv$|__pycache__$)/
const MAX_DEPTH = 4
const MAX_DIRS = 2500
const MAX_FILES = 400

// "- (mine, Design) Linda avatar — https://claude.ai/artifact/7QT… — updated 2026-11-23"
const ARTIFACT_LINE = /^- \(([^)]*)\) (.+?) — (https:\/\/\S+) — updated (\d{4}-\d{2}-\d{2})/

export const parseArtifacts = (text: string): LibItem[] =>
  text.split('\n').flatMap(line => {
    const m = ARTIFACT_LINE.exec(line.trim())
    if (m === null) return []
    const [, tags = '', title = '', url = '', day = ''] = m
    // "mine, web page, not a Doc" -> "web page"; "mine, Design" -> "Design"
    const kind = tags.split(',').map(t => t.trim()).filter(t => t !== 'mine' && !/^not a /i.test(t))
    const isDoc = kind.some(k => /^doc/i.test(k))
    return [{ id: url, kind: isDoc ? 'doc' : 'artifact', title, where: url, modifiedMs: Date.parse(`${day}T12:00:00Z`) || 0, detail: kind.join(', ') || 'artifact' } satisfies LibItem]
  })

const sep = (path: string) => (path.includes('\\') && !path.includes('/') ? '\\' : '/')
const join = (a: string, b: string) => (a.endsWith(sep(a)) ? a + b : a + sep(a) + b)
const parent = (path: string) => path.slice(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))) || path

// The home folder: the one that holds the config folder (~/.claude).
async function homeOf($: EngineInterface) {
  const info = await $.session.info().catch(() => null)
  const root = info?.configRoot
  return root ? parent(root.replace(/[\\/]+$/, '')) : null
}

export async function scanFiles($: EngineInterface): Promise<LibItem[]> {
  const home = await homeOf($)
  if (home === null) return []
  const found: LibItem[] = []
  let dirs = 0
  const walk = async (dir: string, depth: number, where: string): Promise<void> => {
    if (depth > MAX_DEPTH || dirs >= MAX_DIRS || found.length >= MAX_FILES) return
    dirs++
    const entries = await $.fs.list(dir).catch(() => [])
    for (const entry of entries) {
      if (SKIP.test(entry.name)) continue
      const path = join(dir, entry.name)
      if (entry.kind === 'dir' && !entry.isLink) await walk(path, depth + 1, where === '' ? entry.name : where)
      else if (entry.kind === 'file') {
        const kind: LibKind | null = DOC.test(entry.name) ? 'doc' : VIDEO.test(entry.name) ? 'video' : null
        if (kind !== null) found.push({ id: path, kind, title: entry.name, where: path, modifiedMs: entry.mtimeMs, detail: parent(path).slice(home.length + 1) || 'Home' })
      }
    }
  }
  for (const root of ROOTS) await walk(join(home, root), 1, root)
  return found
}

export async function listArtifacts($: EngineInterface): Promise<LibItem[]> {
  try {
    const out = (await $.tool.call({ tool: 'Artifact', action: 'list', limit: 100 } as never)) as { text?: string; result?: unknown }
    // `text` is the listing as the model reads it; a plain string result is the same.
    const text = typeof out.text === 'string' ? out.text : typeof out.result === 'string' ? out.result : ''
    return parseArtifacts(text)
  } catch {
    // No Artifact tool here (not signed in to claude.ai, or another host).
    return []
  }
}

// Pinned first (newest edit first among them), then everything else newest first.
export const ordered = (items: readonly LibItem[], pins: readonly string[], kind: LibKind | 'all') => {
  const shown = items.filter(i => kind === 'all' || i.kind === kind)
  const byRecent = (a: LibItem, b: LibItem) => b.modifiedMs - a.modifiedMs
  const pinned = new Set(pins)
  return {
    pinned: shown.filter(i => pinned.has(i.id)).sort(byRecent),
    rest: shown.filter(i => !pinned.has(i.id)).sort(byRecent),
  }
}

// "just now", "5m", "3h", "2d", "14 Nov"
export const age = (ms: number, now: number) => {
  const mins = Math.max(0, Math.round((now - ms) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h ago`
  if (mins < 7 * 24 * 60) return `${Math.floor(mins / 1440)}d ago`
  const d = new Date(ms)
  return `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]}`
}

// Opens a file on this computer with its own app.
export async function openFile($: EngineInterface, path: string) {
  const platform = (await $.session.info().catch(() => null))?.platform
  const argv = platform === 'macos' ? ['open', path] : platform === 'windows' ? ['explorer.exe', path] : ['xdg-open', path]
  await $.process.run(argv, { timeoutMs: 10_000 }).catch(() => $.ui.toast(`Couldn't open ${path}`))
}
