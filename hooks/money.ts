import type { EngineInterface } from 'claude-code'

import type { PromptTokens } from '../types'

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

// Published Claude API prices, US$ per million tokens: input, output and cache
// read; a cache write costs 1.25x input (2x for a one-hour write). Used when
// Claude Code gives no cost of its own (cloud chats), so a prompt still shows
// a rough cost. Most specific id first. Unknown models are priced as Opus 5.5.
const PRICES: ReadonlyArray<[RegExp, { input: number; output: number; read: number }]> = [
  [/(fable|mythos)-5-2/, { input: 8, output: 40, read: 0.2 }],
  [/(fable|mythos)-5-1/, { input: 10, output: 50, read: 0.25 }],
  [/(fable|mythos)-5/, { input: 10, output: 50, read: 1 }],
  [/opus-5-5/, { input: 4, output: 20, read: 0.2 }],
  [/opus-(5|4)/, { input: 5, output: 25, read: 0.5 }],
  [/sonnet-5-5/, { input: 2, output: 10, read: 0.1 }],
  [/sonnet-5/, { input: 2, output: 10, read: 0.2 }],
  [/sonnet-4/, { input: 3, output: 15, read: 0.3 }],
  [/haiku-5-5/, { input: 0.1, output: 0.5, read: 0.01 }],
  [/haiku-4/, { input: 1, output: 5, read: 0.1 }],
]

export type TurnTokens = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  ephemeral_1h_input_tokens?: number
  model?: string
}

// One turn's rough cost at API rates, in US$.
export const estimateUsd = (u: TurnTokens) => {
  const price = PRICES.find(([re]) => re.test(u.model ?? ''))?.[1] ?? { input: 4, output: 20, read: 0.2 }
  const hour = u.ephemeral_1h_input_tokens ?? 0
  const fiveMin = Math.max(0, u.cache_creation_input_tokens - hour)
  return (u.input_tokens * price.input + u.output_tokens * price.output + u.cache_read_input_tokens * price.read + fiveMin * price.input * 1.25 + hour * price.input * 2) / 1e6
}

// The prompt's cost: Claude Code's own figure where it gave one, else the estimate.
export const promptUsd = (t: PromptTokens | null) => (t === null ? undefined : t.usd ?? t.estUsd)
