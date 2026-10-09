import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit } from '../types'
import { RANKS, backIn, bars, hudSvg, killer, mood } from './hud'
import type { Rank } from './hud'

const limitsAtom = atom({ plugin: 'villager-hp', key: 'limits' } as const, [] as Limit[])
const demoAtom = atom({ plugin: 'villager-hp', key: 'demo' } as const, null as number | null)
const nowAtom = atom({ plugin: 'villager-hp', key: 'now' } as const, 0)
const rankAtom = atom({ plugin: 'villager-hp', key: 'rank' } as const, 'god' as Rank)

const FACES = { healthy: '(◕‿◕)', hurt: '(•_•)', critical: '(╥﹏╥)', dead: '(x_x)', unknown: '(•‿•)' }
const SEGMENTS = 20
// Named by /hp, to tell at a glance which version is loaded.
const VERSION = '2.5: animated villager; card and HP commands only'
// AoE-style: green for what's left, red for what's gone.
const split = (hp: number) => {
  const full = Math.round((hp / 100) * SEGMENTS)
  return { green: '█'.repeat(full), red: '█'.repeat(SEGMENTS - full) }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'hp',
      description: "Show Claude's HP, or preview a level: /hp 10, /hp 0 to die, /hp off for real readings",
      argumentHint: '[0-100 | off]',
    })
    await $.command.register({ name: 'die', description: 'Watch Claude die on the health card (same as /hp 0); /revive to undo' })
    await $.command.register({ name: 'revive', description: 'Bring Claude back to your real health (same as /hp off)' })
    await $.command.register({
      name: 'rank',
      description: 'Change the rank badge on your health card: /rank scout, contributor, innovator, top, god',
      argumentHint: '[scout | contributor | innovator | top | god]',
    })
    // The rank you picked, kept across sessions.
    const saved = await $.store.get('rank')
    if (typeof saved === 'string' && saved in RANKS) await update($, rankAtom, () => saved as Rank)
    const usage = await $.session.usage()
    await update($, limitsAtom, () => usage.rateLimits)
    await update($, nowAtom, () => Date.now())
    // Tick each minute so the reset countdowns move.
    $.clock.every(60_000, () => {
      void update($, nowAtom, () => Date.now())
    })
    return started
  })

  on('command.run', { command: 'die' }, async $ => {
    await update($, demoAtom, () => 0)
    return { text: 'Claude has been defeated. /revive to bring it back.' }
  })

  on('command.run', { command: 'revive' }, async $ => {
    await update($, demoAtom, () => null)
    return { text: 'Claude is back, at your real health.' }
  })

  on('command.run', { command: 'rank' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase().replace(/\s+/g, ' ')
    const aliases: Record<string, Rank> = { 'top contributor': 'top', 'god mode': 'god', godmode: 'god' }
    const rank = (arg in RANKS ? arg : aliases[arg]) as Rank | undefined
    if (!rank) {
      const current = await read($, rankAtom)
      const list = (Object.keys(RANKS) as Rank[]).map(r => `${r}${r === current ? ' (yours)' : ''}`).join(', ')
      return { text: arg ? `No rank called "${arg}". Ranks: ${list}.` : `Your rank: ${RANKS[current].name}. Change it with /rank and one of: ${list}.` }
    }
    await $.store.set('rank', rank)
    await update($, rankAtom, () => rank)
    return { text: `Your badge is now ${RANKS[rank].name}.` }
  })

  // Fresh readings arrive after each turn and whenever a window moves a point.
  on('session.measure', async ($, e, next) => {
    await update($, limitsAtom, () => e.rateLimits)
    await update($, nowAtom, () => Date.now())
    return next(e)
  })

  on('command.run', { command: 'hp' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'off' || arg === 'real') {
      await update($, demoAtom, () => null)
      return { text: 'HP bars show your real limits again.' }
    }
    if (arg !== '') {
      const n = Number(arg)
      if (!Number.isFinite(n) || n < 0 || n > 100) return { text: 'Give an HP from 0 to 100, or "off".' }
      await update($, demoAtom, () => Math.round(n))
      return { text: n <= 0 ? 'Preview: Claude is dead. /hp off to revive.' : `Preview: both bars at ${Math.round(n)} HP. /hp off for real readings.` }
    }
    const all = bars(await read($, limitsAtom), await read($, demoAtom), Date.now())
    return {
      text: [
        ...all.map(b => `${b.label}: ${b.hp === null ? 'no reading yet' : `${b.hp}/100 HP${b.respawn ? `, resets in ${b.respawn}` : ''}`}`),
        `(villager-hp ${VERSION})`,
      ].join('\n'),
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below

    const all = bars(await read($, limitsAtom), await read($, demoAtom), await read($, nowAtom) || Date.now())
    const m = mood(all)
    const elements = $.ui.resolve(e)

    if ('Svg' in elements) {
      const { Box, Svg } = elements
      const alt = all.map(b => `${b.label} ${b.hp === null ? 'unknown' : `${b.hp} of 100`} HP`).join(', ')
      return (
        <Box flexDirection="column">
          {below}
          <Svg key={`hp-${m}`} source={hudSvg(all, await read($, rankAtom))} alt={`Claude's health: ${alt}`} />
        </Box>
      )
    }

    const { Box, Text } = elements
    const dead = killer(all)
    return (
      <Box flexDirection="column">
        {below}
        {dead !== undefined ? (
          <Text color="#c9a14a" bold>
            {`(x_x)  Claude has been defeated.  Out of ${dead.label === 'SESSION' ? 'session' : 'weekly'} hit points · ${backIn(dead.respawn)}`}
          </Text>
        ) : (
          <>
            {all.map((b, i) => (
              <Box key={b.label} flexDirection="row">
                <Text color="#d97757">{i === 0 ? `${FACES[m]} ` : '       '}</Text>
                <Text bold color="#d4ab52">{b.label.padEnd(8)}</Text>
                {b.hp === null ? (
                  <Text dimColor>{'░'.repeat(SEGMENTS)} ??/100</Text>
                ) : (
                  <>
                    <Text color="#3fd23f">{split(b.hp).green}</Text>
                    <Text color="#a01d14">{split(b.hp).red}</Text>
                    <Text color="#f1e3c0" bold>{` ${b.hp}/100`}</Text>
                    <Text color="#cdbb94">{b.respawn ? `  ${b.respawn}` : ''}</Text>
                  </>
                )}
              </Box>
            ))}
          </>
        )}
      </Box>
    )
  })
}
