import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit } from '../types'
import { RANKS, backIn, bars, hudSvg, killer, mood, outBy, weeklyPace } from './hud'
import type { Pace, Rank } from './hud'

const limitsAtom = atom({ plugin: 'villager-hp', key: 'limits' } as const, [] as Limit[])
const demoAtom = atom({ plugin: 'villager-hp', key: 'demo' } as const, null as number | null)
const paceDemoAtom = atom({ plugin: 'villager-hp', key: 'paceDemo' } as const, null as boolean | null)
const nowAtom = atom({ plugin: 'villager-hp', key: 'now' } as const, 0)
const rankAtom = atom({ plugin: 'villager-hp', key: 'rank' } as const, 'god' as Rank)

const FACES = { healthy: '(◕‿◕)', hurt: '(•_•)', critical: '(╥﹏╥)', dead: '(x_x)', unknown: '(•‿•)' }
const SEGMENTS = 20
// Named by /hp, to tell at a glance which version is loaded.
const VERSION = '2.8: weekly pace hourglass; the villager stays cheerful for longer'
// AoE-style: green for what's left, red for what's gone.
const split = (hp: number) => {
  const full = Math.round((hp / 100) * SEGMENTS)
  return { green: '█'.repeat(full), red: '█'.repeat(SEGMENTS - full) }
}

// The weekly pace in a sentence, for /hp and /pace.
const paceLine = (pace: Pace | null) =>
  pace === null
    ? 'Weekly pace: not enough of the week to go on yet.'
    : pace.isOver
      ? `Weekly pace: over. At this rate you're ${outBy(pace.runsOut)}, before the week resets (about ${pace.projected}% of the limit by then).`
      : `Weekly pace: on track. At this rate about ${pace.projected}% of the limit is used by the reset.`

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
    await $.command.register({
      name: 'pace',
      description: 'Whether your weekly limit lasts at this rate, or preview the warning: /pace over, /pace ok, /pace off for the real one',
      argumentHint: '[over | ok | off]',
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

  on('command.run', { command: 'pace' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'over' || arg === 'ok') {
      await update($, paceDemoAtom, () => arg === 'over')
      return { text: arg === 'over' ? 'Preview: over pace for the week. /pace off for the real one.' : 'Preview: on track for the week. /pace off for the real one.' }
    }
    if (arg === 'off' || arg === 'real') await update($, paceDemoAtom, () => null)
    else if (arg !== '') return { text: 'Use /pace, /pace over, /pace ok or /pace off.' }
    return { text: paceLine(weeklyPace(await read($, limitsAtom), await read($, paceDemoAtom), Date.now())) }
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
        paceLine(weeklyPace(await read($, limitsAtom), await read($, paceDemoAtom), Date.now())),
        `(villager-hp ${VERSION})`,
      ].join('\n'),
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below

    const now = (await read($, nowAtom)) || Date.now()
    const all = bars(await read($, limitsAtom), await read($, demoAtom), now)
    const m = mood(all)
    const pace = weeklyPace(await read($, limitsAtom), await read($, paceDemoAtom), now)
    // Set while the week is on course to run out, and he is still standing.
    const over = pace !== null && pace.isOver && m !== 'dead' ? pace : null
    const elements = $.ui.resolve(e)

    // The animated card everywhere but the terminal, which gets the text bars.
    // Chosen by the surface, not by which elements the table lists: a table can
    // carry an element its surface draws as nothing.
    if (e.surface !== 'terminal' && 'Svg' in elements) {
      const { Box, Svg } = elements
      const alt = all.map(b => `${b.label} ${b.hp === null ? 'unknown' : `${b.hp} of 100`} HP`).join(', ') + (over !== null ? `, on course to be ${outBy(over.runsOut)}` : '')
      return (
        <Box flexDirection="column">
          {below}
          <Svg key={`hp-${m}-${over !== null}`} source={hudSvg(all, await read($, rankAtom), over !== null)} alt={`Claude's health: ${alt}`} />
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
                    {over !== null && b.label === 'WEEKLY' ? <Text color="#f59e0b">{`  ⏳ ${outBy(over.runsOut)}`}</Text> : null}
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
