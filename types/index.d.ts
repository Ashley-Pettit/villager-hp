export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

// Which plan the card draws for. `ultra` hides the 5-hour SESSION bar and
// shows the weekly pace bar in its place; `auto` works it out.
export type Plan = 'auto' | 'ultra' | 'standard'

// The tokens your most recent prompt has used so far, summed over every
// model turn it ran (subagents included).
export type PromptTokens = {
  total: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  // Rough cost at API rates in US dollars, from Claude Code's own estimate; absent where it keeps none.
  usd?: number
}

// One thing to open from the Open pane.
export type LibKind = 'artifact' | 'doc' | 'video'
export type LibItem = {
  id: string // the artifact's URL, or the file's path
  kind: LibKind
  title: string
  where: string // URL or path
  modifiedMs: number
  detail: string // the artifact's type, or the file's folder
}

// One day's AI use, as the AI usage tab shows it.
export type DayUse = { tokens: number; usd: number; prompts: number }
export type PaneTab = 'library' | 'usage' | 'settings'

declare module 'claude-code' {
  interface PluginState {
    'villager-hp': {
      limits: Limit[]
      // /hp <n> pins both bars to n HP to preview; null shows the real readings.
      demo: number | null
      // /pace over or /pace ok pins the weekly pace to preview; null shows the real one.
      paceDemo: boolean | null
      // The clock, ticked each minute so the respawn countdowns move.
      now: number
      // The Open pane: what it found, what you pinned (kept across sessions), the tab shown.
      library: LibItem[]
      libraryLoading: boolean
      pins: string[]
      libraryTab: 'all' | 'artifact' | 'doc' | 'video'
      // What you typed in the pane's search box.
      libraryQuery: string
      // The plan you picked with /plan; auto by default.
      plan: Plan
      // The plan the account's login names, when it names one.
      accountPlan: string | null
      // Tokens of the most recent prompt; null before the first.
      lastPrompt: PromptTokens | null
      // The session's estimated cost (US$) when the last prompt was sent: its cost is the rise since.
      costAtSend: number | null
      // US dollars to the chosen currency, today's rate.
      fxRate: number
      // The pane's tab: Library, AI usage or Settings.
      paneTab: 'library' | 'usage' | 'settings'
      // Tokens, rough cost (US$) and prompts per local day ("2026-11-25"), 90 days.
      history: Record<string, DayUse>
      // The session's estimated cost (US$) at the last measure, to add only what's new to today.
      lastCostSeen: number | null
      // Whether newer versions install by themselves.
      autoUpdate: boolean
    }
  }
}
