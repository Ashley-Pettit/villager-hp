import type { EngineInterface } from 'claude-code'

import type { DayUse } from '../types'

// A rough history of your AI use per day: tokens, the rough cost at API
// rates (US$) and prompts, kept across sessions in the mod's store for 90
// days. Every session adds to the same days, so it counts all of them.

export type { DayUse }
export type History = Record<string, DayUse> // by local day, "2026-11-25"

const KEY = 'usageByDay'
const KEEP_DAYS = 90

// The local day a moment falls on, as "YYYY-MM-DD".
export const dayKey = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function readHistory($: EngineInterface): Promise<History> {
  const kept = await $.store.get(KEY).catch(() => undefined)
  return kept !== null && typeof kept === 'object' ? (kept as History) : {}
}

// Adds to today's totals and drops days past the 90 kept.
export async function addUse($: EngineInterface, add: Partial<DayUse>): Promise<History> {
  const history = await readHistory($)
  const today = dayKey(Date.now())
  const was = history[today] ?? { tokens: 0, usd: 0, prompts: 0 }
  history[today] = { tokens: was.tokens + (add.tokens ?? 0), usd: was.usd + (add.usd ?? 0), prompts: was.prompts + (add.prompts ?? 0) }
  const oldest = dayKey(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000)
  for (const day of Object.keys(history)) if (day < oldest) delete history[day]
  await $.store.set(KEY, history).catch(() => undefined)
  return history
}

// The last `n` days, oldest first, with zeros where nothing was used.
export const lastDays = (history: History, n: number, now: number) =>
  Array.from({ length: n }, (_, i) => {
    const day = dayKey(now - (n - 1 - i) * 24 * 60 * 60 * 1000)
    return { day, ...(history[day] ?? { tokens: 0, usd: 0, prompts: 0 }) }
  })

export const sumDays = (days: readonly DayUse[]): DayUse =>
  days.reduce((a, d) => ({ tokens: a.tokens + d.tokens, usd: a.usd + d.usd, prompts: a.prompts + d.prompts }), { tokens: 0, usd: 0, prompts: 0 })

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// A bar chart of a daily figure (the rough cost) for the AI usage tab: today in cyan, the
// rest blue, the busiest day's count over its bar, weekday initials under.
export const usageChart = (days: ReadonlyArray<{ day: string } & DayUse>, value: (d: DayUse) => number, fmt: (n: number) => string) => {
  const W = 640
  const H = 170
  const top = 26
  const bottom = 24
  const gap = 8
  const barW = (W - 16 - gap * (days.length - 1)) / days.length
  const max = Math.max(1e-9, ...days.map(value))
  const peak = days.reduce((best, d, i) => (value(d) > value(days[best] ?? d) ? i : best), 0)
  const bars = days
    .map((d, i) => {
      const x = 8 + i * (barW + gap)
      const v = value(d)
      const h = v === 0 ? 2 : Math.max(4, ((H - top - bottom) * v) / max)
      const y = H - bottom - h
      const isToday = i === days.length - 1
      const fill = isToday ? '#5ec4ff' : '#3b82f6'
      const date = new Date(`${d.day}T12:00:00`)
      const label = `<text x="${x + barW / 2}" y="${H - 8}" text-anchor="middle" font-size="10" fill="${isToday ? '#f1f4f8' : '#8f9aa7'}" font-weight="${isToday ? 700 : 500}">${isToday ? 'Today' : WEEKDAY[date.getDay()]?.[0] ?? ''}</text>`
      const top_ = i === peak && v > 0 ? `<text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-size="10" font-weight="700" fill="#f1f4f8">~${fmt(v)}</text>` : ''
      return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="4" fill="${fill}" opacity="${v === 0 ? 0.25 : isToday ? 1 : 0.75}"><animate attributeName="height" values="0;${h}" dur="0.6s" fill="freeze"/><animate attributeName="y" values="${H - bottom};${y}" dur="0.6s" fill="freeze"/></rect>${label}${top_}`
    })
    .join('')
  const grid = [0.25, 0.5, 0.75, 1]
    .map(f => `<line x1="8" x2="${W - 8}" y1="${H - bottom - (H - top - bottom) * f}" y2="${H - bottom - (H - top - bottom) * f}" stroke="#2b333d" stroke-dasharray="2 4"/>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">
  <rect width="${W}" height="${H}" rx="12" fill="#12161c"/>${grid}${bars}</svg>`
}
