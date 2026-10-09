export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'villager-hp': {
      limits: Limit[]
      // /hp <n> pins both bars to n HP to preview; null shows the real readings.
      demo: number | null
      // The clock, ticked each minute so the respawn countdowns move.
      now: number
      // The rank badge on the card: scout, contributor, innovator, top or god.
      rank: 'scout' | 'contributor' | 'innovator' | 'top' | 'god'
    }
  }
}
