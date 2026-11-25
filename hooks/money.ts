import type { EngineInterface } from 'claude-code'

// The last prompt's rough cost at API rates, in your currency. Claude Code
// estimates every response's cost at API prices (what /cost shows); the
// prompt's share is that estimate when it finished, less what it was when
// you sent it. Converted from US dollars at a daily exchange rate.

export const CURRENCIES = ['AUD', 'USD', 'EUR', 'GBP', 'NZD', 'CAD', 'JPY', 'INR', 'SGD'] as const
export type Currency = (typeof CURRENCIES)[number]

const SYMBOL: Record<Currency, string> = { AUD: 'A$', USD: 'US$', EUR: '€', GBP: '£', NZD: 'NZ$', CAD: 'C$', JPY: '¥', INR: '₹', SGD: 'S$' }
// Used until the day's rates arrive, or when they can't be fetched: US dollars to each.
const FALLBACK: Record<Currency, number> = { AUD: 1.53, USD: 1, EUR: 0.92, GBP: 0.78, NZD: 1.68, CAD: 1.38, JPY: 152, INR: 84, SGD: 1.34 }
const RATES_URL = 'https://open.er-api.com/v6/latest/USD'
const DAY_MS = 24 * 60 * 60 * 1000

export const asCurrency = (value: unknown): Currency =>
  typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value.toUpperCase()) ? (value.toUpperCase() as Currency) : 'AUD'

export const fallbackRate = (c: Currency) => FALLBACK[c]

// "A$0.42", "<A$0.01", "¥64", "€1.20"
export const fmtMoney = (usd: number, currency: Currency, rate: number) => {
  const amount = Math.max(0, usd * rate)
  const symbol = SYMBOL[currency]
  if (currency === 'JPY' || currency === 'INR') return amount < 1 ? `<${symbol}1` : `${symbol}${Math.round(amount)}`
  if (amount < 0.01) return `<${symbol}0.01`
  return `${symbol}${amount < 100 ? amount.toFixed(2) : Math.round(amount)}`
}

// Today's rate for the currency: from the store when fetched in the last day,
// else fetched (and kept), else the built-in one.
export async function rateFor($: EngineInterface, currency: Currency): Promise<number> {
  if (currency === 'USD') return 1
  const kept = (await $.store.get('fx').catch(() => undefined)) as { at?: number; rates?: Record<string, number> } | undefined
  if (kept?.at !== undefined && Date.now() - kept.at < DAY_MS && typeof kept.rates?.[currency] === 'number') return kept.rates[currency]
  try {
    const res = await $.http.fetch(RATES_URL)
    const body = JSON.parse(res.text) as { result?: string; rates?: Record<string, number> }
    if (res.ok && body.result === 'success' && body.rates && typeof body.rates[currency] === 'number') {
      await $.store.set('fx', { at: Date.now(), rates: body.rates }).catch(() => undefined)
      return body.rates[currency]
    }
  } catch {
    // Offline or blocked: the built-in rate is close enough for a rough cost.
  }
  return kept?.rates?.[currency] ?? FALLBACK[currency]
}
