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
}

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
      // The rank badge on the card: scout, contributor, innovator, top or god.
      rank: 'scout' | 'contributor' | 'innovator' | 'top' | 'god'
      // The plan you picked with /plan; auto by default.
      plan: Plan
      // The plan the account's login names, when it names one.
      accountPlan: string | null
      // Tokens of the most recent prompt; null before the first.
      lastPrompt: PromptTokens | null
    }
  }
}
