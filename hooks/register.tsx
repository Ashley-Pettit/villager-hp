import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { LibItem, LibKind, Limit, Plan, PromptTokens } from '../types'
import { backIn, bars, emptyTokens, fmtTokens, hudSvg, isUltra, killer, mood, openSlot, outBy, paceShort, paceZone, pacePosition, weeklyPace } from './hud'
import type { Pace } from './hud'
import { age, listArtifacts, openFile, ordered, scanFiles } from './library'

const limitsAtom = atom({ plugin: 'villager-hp', key: 'limits' } as const, [] as Limit[])
const demoAtom = atom({ plugin: 'villager-hp', key: 'demo' } as const, null as number | null)
const paceDemoAtom = atom({ plugin: 'villager-hp', key: 'paceDemo' } as const, null as boolean | null)
const nowAtom = atom({ plugin: 'villager-hp', key: 'now' } as const, 0)
// The Open pane: what it found, your pins (kept across sessions in $.store), the tab shown.
const libraryAtom = atom({ plugin: 'villager-hp', key: 'library' } as const, [] as LibItem[])
const libraryLoadingAtom = atom({ plugin: 'villager-hp', key: 'libraryLoading' } as const, false)
const pinsAtom = atom({ plugin: 'villager-hp', key: 'pins' } as const, [] as string[])
type Tab = LibKind | 'all'
const tabAtom = atom({ plugin: 'villager-hp', key: 'libraryTab' } as const, 'all' as Tab)
const PANE = 'villager-open'
const TABS: readonly [Tab, string][] = [['all', 'All'], ['artifact', 'Artifacts'], ['doc', 'Docs'], ['video', 'Videos']]
const KIND_ICON: Record<LibKind, string> = { artifact: '◆', doc: '▤', video: '▶' }
const planAtom = atom({ plugin: 'villager-hp', key: 'plan' } as const, 'auto' as Plan)
const accountPlanAtom = atom({ plugin: 'villager-hp', key: 'accountPlan' } as const, null as string | null)
const lastPromptAtom = atom({ plugin: 'villager-hp', key: 'lastPrompt' } as const, null as PromptTokens | null)
const PLANS: readonly Plan[] = ['auto', 'ultra', 'standard']

const FACES = { healthy: '(◕‿◕)', hurt: '(•_•)', critical: '(╥﹏╥)', dead: '(x_x)', unknown: '(•‿•)' }
const SEGMENTS = 20
// Named by /hp, to tell at a glance which version is loaded.
const VERSION = '2.9: weekly pace bar, OPEN pane for artifacts, docs and videos, last prompt tokens'
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

const tokensLine = (t: PromptTokens | null) =>
  t === null
    ? 'Last prompt: no tokens counted yet.'
    : `Last prompt: ${t.total.toLocaleString()} tokens (${fmtTokens(t.input)} in, ${fmtTokens(t.output)} out, ${fmtTokens(t.cacheRead)} cache read, ${fmtTokens(t.cacheWrite)} cache write).`

// The pace bar in text, for the terminal: cap ├────┼──●───┤ spare
const PACE_CELLS = 21
const paceTrack = (pace: Pace | null) => {
  const at = Math.round(pacePosition(pace) * (PACE_CELLS - 1))
  const mid = (PACE_CELLS - 1) / 2
  const cells = Array.from({ length: PACE_CELLS }, (_, i) => (i === mid ? '┼' : '─'))
  return { left: cells.slice(0, at).join(''), dot: pace === null ? '○' : '●', right: cells.slice(at + 1).join('') }
}
const PACE_TINT = { plenty: '#3fd23f', track: '#5ec4ff', cap: '#ef4444', unknown: '#8f9aa7' } as const

// Gathers artifacts and local docs and videos for the Open pane.
const refreshLibrary = async ($: EngineInterface) => {
  if (await read($, libraryLoadingAtom)) return
  await update($, libraryLoadingAtom, () => true)
  try {
    const [artifacts, files] = await Promise.all([listArtifacts($), scanFiles($)])
    await update($, libraryAtom, () => [...artifacts, ...files])
  } finally {
    await update($, libraryLoadingAtom, () => false)
  }
}

const openPane = async ($: EngineInterface) => {
  await $.ui.open({ id: PANE, title: 'Open', focus: true, closeOnEscape: true })
  void refreshLibrary($)
}

const togglePin = async ($: EngineInterface, id: string) => {
  const pins = await read($, pinsAtom)
  const next = pins.includes(id) ? pins.filter(p => p !== id) : [id, ...pins]
  await update($, pinsAtom, () => next)
  await $.store.set('pins', next).catch(() => undefined)
}

// Whether the card draws for Ultra, read once per call.
const ultraNow = async ($: EngineInterface) => isUltra(await read($, planAtom), await read($, accountPlanAtom), await read($, limitsAtom))

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
    await $.command.register({ name: 'open', description: 'Open your artifacts, Word docs and videos, recent first; pin favourites to the top' })
    await $.command.register({
      name: 'pace',
      description: 'Whether your weekly limit lasts at this rate, or preview the warning: /pace over, /pace ok, /pace off for the real one',
      argumentHint: '[over | ok | off]',
    })
    await $.command.register({
      name: 'ultra',
      description: 'Ultra layout: hide the 5-hour bar and show weekly pace instead. /ultra on, /ultra off, /ultra auto',
      argumentHint: '[on | off | auto]',
    })
    const savedPlan = await $.store.get('plan')
    if (typeof savedPlan === 'string' && (PLANS as readonly string[]).includes(savedPlan)) await update($, planAtom, () => savedPlan as Plan)
    // The login's plan name, where the engine hands it over; auto mode reads "ultra" in it.
    try {
      const id = await $.session.identity()
      await update($, accountPlanAtom, () => id.organizationType ?? null)
    } catch {
      // Withheld by a privacy mod: auto falls back to the limits the account reports.
    }
    const pins = await $.store.get('pins')
    if (Array.isArray(pins)) await update($, pinsAtom, () => pins.filter((p): p is string => typeof p === 'string'))
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

  on('command.run', { command: 'open' }, async $ => {
    await openPane($)
    return { text: 'Opened your artifacts, docs and videos.' }
  })

  // The Open pane: tabs, pinned things, then the rest, most recently edited first.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link } = $.ui.resolve(e)
    const items = await read($, libraryAtom)
    const pins = await read($, pinsAtom)
    const tab = await read($, tabAtom)
    const loading = await read($, libraryLoadingAtom)
    const { pinned, rest } = ordered(items, pins, tab)
    const now = Date.now()
    const room = Math.max(6, (e.viewport?.rows ?? 30) - 8)
    const shownRest = rest.slice(0, Math.max(0, room - pinned.length))

    const row = (item: LibItem, isPinned: boolean) => (
      <Box key={item.id} flexDirection="row" gap={1} alignItems="center">
        <Button key={`pin:${item.id}`} label={isPinned ? '★' : '☆'} onPress={() => togglePin($, item.id)} />
        <Text color={item.kind === 'artifact' ? '#5ec4ff' : item.kind === 'doc' ? '#7aa7ff' : '#f59e0b'}>{KIND_ICON[item.kind]}</Text>
        {item.kind === 'artifact' || item.where.startsWith('https://') ? (
          <Link href={item.where} label={item.title} />
        ) : (
          <Button key={`open:${item.id}`} label={item.title} onPress={() => openFile($, item.where)} />
        )}
        <Text dimColor>{`${item.detail} · ${age(item.modifiedMs, now)}`}</Text>
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1}>
          {TABS.map(([id, label]) => (
            <Button key={`tab:${id}`} label={label} variant={tab === id ? 'primary' : 'secondary'} onPress={() => update($, tabAtom, () => id)} />
          ))}
          <Button key="refresh" label={loading ? 'Refreshing…' : 'Refresh'} onPress={() => refreshLibrary($)} />
        </Box>
        {pinned.length > 0 ? (
          <Box flexDirection="column">
            <Text bold color="#f7b733">Pinned</Text>
            {pinned.map(item => row(item, true))}
          </Box>
        ) : (
          <></>
        )}
        <Box flexDirection="column">
          <Text bold color="#8f9aa7">Recent</Text>
          {shownRest.length === 0 ? (
            <Text dimColor>{loading ? 'Looking for your artifacts, docs and videos…' : pinned.length > 0 ? 'Nothing else here.' : 'Nothing found yet. Press Refresh.'}</Text>
          ) : (
            <>{shownRest.map(item => row(item, false))}</>
          )}
          {rest.length > shownRest.length ? <Text dimColor>{`…and ${rest.length - shownRest.length} more. Pick a tab to narrow it.`}</Text> : <></>}
        </Box>
      </Box>
    )
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

  on('command.run', { command: 'ultra' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const picked: Record<string, Plan> = { on: 'ultra', ultra: 'ultra', off: 'standard', standard: 'standard', auto: 'auto' }
    const next = picked[arg]
    if (next !== undefined) {
      await $.store.set('plan', next).catch(() => undefined)
      await update($, planAtom, () => next)
    } else if (arg !== '') return { text: 'Use /ultra on, /ultra off or /ultra auto.' }
    const plan = await read($, planAtom)
    const ultra = await ultraNow($)
    return {
      text: `Plan: ${plan}${plan === 'auto' ? ` (reading as ${ultra ? 'Ultra' : 'standard'})` : ''}. ${ultra ? 'The 5-hour SESSION bar is hidden; the PACE bar shows your weekly pace.' : 'SESSION and WEEKLY bars shown.'}`,
    }
  })

  // Tokens for the most recent prompt: start over when you send one, then add
  // every model turn it runs, subagents too, so the count grows while it works.
  on('prompt.submit', async ($, e, next) => {
    const result = await next(e)
    // Never hold up your prompt over a counter.
    await update($, lastPromptAtom, () => emptyTokens()).catch(() => undefined)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const u = e.usage
    if (u !== undefined) {
      await update($, lastPromptAtom, prev => {
        const t = prev ?? emptyTokens()
        const input = t.input + u.input_tokens
        const output = t.output + u.output_tokens
        const cacheRead = t.cacheRead + u.cache_read_input_tokens
        const cacheWrite = t.cacheWrite + u.cache_creation_input_tokens
        return { input, output, cacheRead, cacheWrite, total: input + output + cacheRead + cacheWrite }
      })
    }
    return next(e)
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
    const ultra = await ultraNow($)
    const all = bars(await read($, limitsAtom), await read($, demoAtom), Date.now()).filter(b => !(ultra && b.label === 'SESSION'))
    return {
      text: [
        ...all.map(b => `${b.label}: ${b.hp === null ? 'no reading yet' : `${b.hp}/100 HP${b.respawn ? `, resets in ${b.respawn}` : ''}`}`),
        paceLine(weeklyPace(await read($, limitsAtom), await read($, paceDemoAtom), Date.now())),
        tokensLine(await read($, lastPromptAtom)),
        `(villager-hp ${VERSION}${ultra ? ', Ultra layout' : ''})`,
      ].join('\n'),
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below

    const now = (await read($, nowAtom)) || Date.now()
    const ultra = await ultraNow($)
    // On Ultra the 5-hour window doesn't apply: drop it, so it neither draws nor sets his mood.
    const all = bars(await read($, limitsAtom), await read($, demoAtom), now).filter(b => !(ultra && b.label === 'SESSION'))
    const m = mood(all)
    const pace = weeklyPace(await read($, limitsAtom), await read($, paceDemoAtom), now)
    const tokens = await read($, lastPromptAtom)
    // Set while the week is on course to run out, and he is still standing.
    const over = pace !== null && pace.isOver && m !== 'dead' ? pace : null
    const elements = $.ui.resolve(e)

    // The animated card everywhere but the terminal, which gets the text bars.
    // Chosen by the surface, not by which elements the table lists: a table can
    // carry an element its surface draws as nothing.
    if (e.surface !== 'terminal' && 'Svg' in elements) {
      const { Box, Svg, Button } = elements
      const slot = openSlot(all.length + (pace !== undefined ? 1 : 0))
      const alt =
        all.map(b => `${b.label} ${b.hp === null ? 'unknown' : `${b.hp} of 100`} HP`).join(', ') +
        (ultra ? `, weekly pace ${paceShort(pace)}` : over !== null ? `, on course to be ${outBy(over.runsOut)}` : '') +
        (tokens !== null ? `, last prompt ${fmtTokens(tokens.total)} tokens` : '')
      // The card, with the real OPEN button laid over the slot it leaves at the right.
      return (
        <Box flexDirection="column">
          {below}
          <Box position="relative">
            <Svg
              key={`hp-${m}-${over !== null}-${paceZone(pace)}-${ultra}`}
              source={hudSvg(all, over !== null, { pace, hideSession: ultra, tokens })}
              alt={`Claude's health: ${alt}`}
            />
            <Box position="absolute" top={0} left={0} width="100%" height="100%" flexDirection="row" justifyContent="flex-end">
              <Box flexDirection="column" width={slot.width}>
                <Box height={slot.pad} />
                <Box height={slot.height} justifyContent="center" alignItems="center">
                  <Button key="open" label="OPEN" variant="primary" onPress={() => openPane($)} />
                </Box>
              </Box>
              <Box width={slot.margin} />
            </Box>
          </Box>
        </Box>
      )
    }

    const { Box, Text, Button } = elements
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
                    {over !== null && b.label === 'WEEKLY' && !ultra ? <Text color="#f59e0b">{`  ⏳ ${outBy(over.runsOut)}`}</Text> : <></>}
                  </>
                )}
              </Box>
            ))}
            {dead === undefined ? (
              <Box flexDirection="row">
                <Text>{'       '}</Text>
                <Text bold color="#d4ab52">{'PACE'.padEnd(8)}</Text>
                <Text color="#fca5a5">{'cap '}</Text>
                <Text color="#8f9aa7">{paceTrack(pace).left}</Text>
                <Text bold color={PACE_TINT[paceZone(pace)]}>{paceTrack(pace).dot}</Text>
                <Text color="#8f9aa7">{paceTrack(pace).right}</Text>
                <Text color="#86efac">{' spare'}</Text>
                <Text color="#f1e3c0" bold>{pace === null ? '  —' : `  ${pace.projected}%`}</Text>
                <Text color={PACE_TINT[paceZone(pace)]}>{`  ${paceShort(pace)}`}</Text>
              </Box>
            ) : (
              <></>
            )}
            {tokens !== null ? (
              <Box flexDirection="row">
                <Text>{'       '}</Text>
                <Text bold color="#d4ab52">{'PROMPT'.padEnd(8)}</Text>
                <Text color="#f1e3c0" bold>{`${fmtTokens(tokens.total)} tokens`}</Text>
                <Text color="#cdbb94">{`  ${fmtTokens(tokens.output)} out · ${fmtTokens(tokens.input + tokens.cacheRead + tokens.cacheWrite)} in`}</Text>
              </Box>
            ) : (
              <></>
            )}
            <Box flexDirection="row">
              <Text>{'       '}</Text>
              <Button key="open" label="Open" hotkey="o" onPress={() => openPane($)} />
              <Text dimColor>{'  artifacts, docs and videos'}</Text>
            </Box>
          </>
        )}
      </Box>
    )
  })
}
