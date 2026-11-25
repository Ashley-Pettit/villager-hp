import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DayUse, LibItem, LibKind, Limit, PaneTab, Plan, PromptTokens } from '../types'
import { CARD_W_BESIDE_OPEN, backIn, bars, emptyTokens, fmtTokens, newTokens, hudSvg, isUltra, killer, mood, paceShort, promptSummary, paceZone, pacePosition, weeklyPace } from './hud'
import type { Pace } from './hud'
import { age, listArtifacts, openFile, ordered, scanFiles } from './library'
import { CURRENCIES, asCurrency, fallbackRate, fmtMoney, rateFor } from './money'
import { addUse, lastDays, readHistory, sumDays, usageChart } from './usage'
import { NOT_CATALOG, dailyCheck, installedVersion, isAutoUpdate, isCatalogPath, isNewer, latestVersion, runUpdate } from './update'

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
const queryAtom = atom({ plugin: 'villager-hp', key: 'libraryQuery' } as const, '')
const PANE = 'villager-open'
// Hovering the last prompt line lights this group, which reveals its breakdown.
const TOKENS_SCOPE = 'villager-hp-tokens'
const TABS: readonly [Tab, string][] = [['all', 'All'], ['artifact', 'Artifacts'], ['doc', 'Docs'], ['video', 'Videos']]
// Each kind's chip: its glyph, colour, a dark tint behind it, and its name.
const KIND_LOOK: Record<LibKind, { icon: string; color: string; tint: string; name: string }> = {
  artifact: { icon: '◆', color: '#5ec4ff', tint: '#10283a', name: 'Artifact' },
  doc: { icon: '▤', color: '#7aa7ff', tint: '#141f3d', name: 'Doc' },
  video: { icon: '▶', color: '#f59e0b', tint: '#33230a', name: 'Video' },
}
const planAtom = atom({ plugin: 'villager-hp', key: 'plan' } as const, 'auto' as Plan)
const accountPlanAtom = atom({ plugin: 'villager-hp', key: 'accountPlan' } as const, null as string | null)
const lastPromptAtom = atom({ plugin: 'villager-hp', key: 'lastPrompt' } as const, null as PromptTokens | null)
const costAtSendAtom = atom({ plugin: 'villager-hp', key: 'costAtSend' } as const, null as number | null)
const fxRateAtom = atom({ plugin: 'villager-hp', key: 'fxRate' } as const, 1.53)
const paneTabAtom = atom({ plugin: 'villager-hp', key: 'paneTab' } as const, 'library' as PaneTab)
const historyAtom = atom({ plugin: 'villager-hp', key: 'history' } as const, {} as Record<string, DayUse>)
const lastCostSeenAtom = atom({ plugin: 'villager-hp', key: 'lastCostSeen' } as const, null as number | null)
const autoUpdateAtom = atom({ plugin: 'villager-hp', key: 'autoUpdate' } as const, true)
const PANE_TABS: readonly [PaneTab, string][] = [['library', '⊞ Library'], ['usage', '▤ AI usage'], ['settings', '⚙ Settings']]
const PLANS: readonly Plan[] = ['auto', 'ultra', 'standard']

const FACES = { healthy: '(◕‿◕)', hurt: '(•_•)', critical: '(╥﹏╥)', dead: '(x_x)', unknown: '(•‿•)' }
const SEGMENTS = 20
// Named by /hp, to tell at a glance which version is loaded.
const VERSION = '2.11.1: AI usage and settings tabs, last prompt cost, updates only the install line copy'
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
      ? `Weekly pace: over. At this rate you'd use about ${pace.projected}% of the limit by the reset.`
      : `Weekly pace: on track. At this rate about ${pace.projected}% of the limit is used by the reset.`

const tokensLine = (t: PromptTokens | null, cost: string | null) =>
  t === null
    ? 'Last prompt: no tokens counted yet.'
    : `Last prompt: ${cost ? `about ${cost} at API rates, ` : ''}${newTokens(t).toLocaleString()} new tokens (${fmtTokens(t.input)} in, ${fmtTokens(t.output)} out, ${fmtTokens(t.cacheWrite)} newly cached), plus ${fmtTokens(t.cacheRead)} re-read from cache.`

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

const openPane = async ($: EngineInterface, tab: PaneTab = 'library') => {
  await update($, paneTabAtom, () => tab)
  await $.ui.open({ id: PANE, title: 'villager-hp', focus: true, closeOnEscape: true })
  if (tab === 'library') void refreshLibrary($)
}

// Adds to today's line in the AI usage history and redraws the tab.
const recordUse = async ($: EngineInterface, add: Partial<DayUse>) => {
  const history = await addUse($, add)
  await update($, historyAtom, () => history)
}

const togglePin = async ($: EngineInterface, id: string) => {
  const pins = await read($, pinsAtom)
  const next = pins.includes(id) ? pins.filter(p => p !== id) : [id, ...pins]
  await update($, pinsAtom, () => next)
  await $.store.set('pins', next).catch(() => undefined)
}

// Whether the card draws for Ultra, read once per call.
const ultraNow = async ($: EngineInterface) => isUltra(await read($, planAtom), await read($, accountPlanAtom), await read($, limitsAtom))

export const register: Register = (on, options) => {
  // The currency for the last prompt's cost: Settings → the villager-hp row (userConfig), AUD by default.
  const currency = asCurrency(options.currency)
  const money = (t: PromptTokens | null, rate: number) => (t?.usd === undefined ? null : fmtMoney(t.usd, currency, rate))

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'hp',
      description: "Show Claude's HP, preview a level (/hp 10, /hp 0 to die, /hp off), /hp usage for your AI usage history, /hp settings, /hp update",
      argumentHint: '[0-100 | off | usage | settings | update | autoupdate on|off]',
    })
    await $.command.register({ name: 'die', description: 'Watch Claude die on the health card (same as /hp 0); /revive to undo' })
    await $.command.register({ name: 'revive', description: 'Bring Claude back to your real health (same as /hp off)' })
    await $.command.register({ name: 'open', description: 'Open your artifacts, Word docs and videos, recent first; pin favourites to the top' })
    await $.command.register({
      name: 'pace',
      description: "Whether your weekly limit lasts at this rate (as a percent of the limit by the reset), or preview: /pace over, /pace ok, /pace off",
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
    await update($, lastCostSeenAtom, () => usage.cost?.usd ?? null)
    const history = await readHistory($)
    await update($, historyAtom, () => history)
    const autoUpdate = await isAutoUpdate($)
    await update($, autoUpdateAtom, () => autoUpdate)
    await update($, nowAtom, () => Date.now())
    // Today's exchange rate for the cost readout, in the background.
    await update($, fxRateAtom, () => fallbackRate(currency))
    void rateFor($, currency).then(r => update($, fxRateAtom, () => r)).catch(() => undefined)
    // Once a day, see whether a newer villager-hp is out (and install it, unless
    // auto update is off). In the background: it never holds up the session.
    void dailyCheck($).catch(() => undefined)
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

  // The pane: three tabs. Library: a search box, kind tabs with counts, then
  // cards, pinned first and the rest grouped Today, This week, Earlier. AI usage:
  // tokens and rough cost per day. Settings: currency, Ultra layout, updates.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button, Link, Input, Select } = elements
    // The terminal draws no Svg: it gets the chart as text bars.
    const Svg = 'Svg' in elements ? elements.Svg : undefined
    const paneTab = await read($, paneTabAtom)
    const isTerminalPane = e.surface === 'terminal'
    const tabBar = (
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        {...PANE_TABS.map(([id, label]) => (
          <Button key={`pane:${id}`} label={label} variant={paneTab === id ? 'primary' : 'secondary'} onPress={() => openPane($, id)} />
        ))}
      </Box>
    )
    const frame = (...body: ReturnType<typeof Box>[]) => (
      <Box flexDirection="column" gap={1} paddingX={isTerminalPane ? 0 : 1}>
        {tabBar}
        {...body}
      </Box>
    )
    const rate = await read($, fxRateAtom)

    if (paneTab === 'usage') {
      const history = await read($, historyAtom)
      const nowMs = Date.now()
      const days = lastDays(history, 14, nowMs)
      const tile = (key: string, label: string, use: DayUse) => (
        <Box key={key} flexDirection="column" flexGrow={1} paddingX={1} borderStyle={isTerminalPane ? undefined : 'round'} borderColor="#2b333d" backgroundColor={isTerminalPane ? undefined : '#151a21'}>
          <Text size="caption" weight="bold" color="#8f9aa7">{label.toUpperCase()}</Text>
          <Text size="heading" weight="bold">{`${fmtTokens(use.tokens)} new tokens`}</Text>
          <Text size="caption" dimColor>{`~${fmtMoney(use.usd, currency, rate)} · ${use.prompts} prompt${use.prompts === 1 ? '' : 's'}`}</Text>
        </Box>
      )
      const max = Math.max(1, ...days.map(d => d.tokens))
      const dayName = (day: string) => {
        const d = new Date(`${day}T12:00:00`)
        return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]}`
      }
      return frame(
        <Box key="tiles" flexDirection="row" gap={1}>
          {tile('today', 'Today', days[days.length - 1] ?? { tokens: 0, usd: 0, prompts: 0 })}
          {tile('week', 'Last 7 days', sumDays(days.slice(-7)))}
          {tile('month', 'Last 30 days', sumDays(lastDays(history, 30, nowMs)))}
        </Box>,
        isTerminalPane || Svg === undefined ? (
          <Box key="chart" flexDirection="column">
            {...days.map(d => (
              <Box key={`bar:${d.day}`} flexDirection="row" gap={1}>
                <Text dimColor>{dayName(d.day).padEnd(10)}</Text>
                <Text color="#5ec4ff">{'█'.repeat(Math.round((d.tokens / max) * 24)) || '·'}</Text>
                <Text>{` ${fmtTokens(d.tokens)}`}</Text>
              </Box>
            ))}
          </Box>
        ) : (
          <Svg key="chart" source={usageChart(days, fmtTokens)} alt={`New tokens per day for the last 14 days; today ${fmtTokens(days[days.length - 1]?.tokens ?? 0)}`} />
        ),
        <Box key="days" flexDirection="column">
          <Text size="caption" weight="bold" color="#8f9aa7">BY DAY</Text>
          {...[...days].reverse().filter(d => d.tokens > 0 || d.prompts > 0).map(d => (
            <Box key={`day:${d.day}`} flexDirection="row" justifyContent="space-between">
              <Text>{dayName(d.day)}</Text>
              <Text tabular>{`~${fmtMoney(d.usd, currency, rate)} · ${fmtTokens(d.tokens)} new tokens · ${d.prompts} prompts`}</Text>
            </Box>
          ))}
        </Box>,
        <Text key="note" size="caption" dimColor>{`Rough, at API rates in ${currency}. New tokens leave out the chat Claude re-reads from cache each turn. Counted in every session since villager-hp 2.11; kept 90 days.`}</Text>,
      )
    }

    if (paneTab === 'settings') {
      const row = (key: string, label: string, help: string, control: ReturnType<typeof Box>) => (
        <Box key={key} flexDirection="row" justifyContent="space-between" alignItems="center" gap={2} paddingX={1} borderStyle={isTerminalPane ? undefined : 'round'} borderColor="#2b333d" backgroundColor={isTerminalPane ? undefined : '#151a21'}>
          <Box flexDirection="column" flexGrow={1}>
            <Text weight="semibold">{label}</Text>
            <Text size="caption" dimColor>{help}</Text>
          </Box>
          {control}
        </Box>
      )
      const plan = await read($, planAtom)
      const auto = await read($, autoUpdateAtom)
      const version = await installedVersion($).catch(() => '?')
      return frame(
        row('currency', 'Currency', 'For the rough cost of your prompts, at API rates. Also in /config.',
          <Select key="currency" value={currency} options={CURRENCIES.map(c => ({ value: c, label: c }))} onSelect={v => void $.config.set({ key: 'villager-hp.currency', value: v } as never)} />),
        row('ultra', 'Ultra layout', 'Hide the 5-hour SESSION bar. Auto works it out from your limits.',
          <Select key="plan" value={plan} options={[{ value: 'auto', label: 'Auto' }, { value: 'ultra', label: 'On' }, { value: 'standard', label: 'Off' }]} onSelect={v => {
            void $.store.set('plan', v).catch(() => undefined)
            void update($, planAtom, () => v as Plan)
          }} />),
        row('autoupdate', 'Auto update', 'Once a day, install a newer villager-hp by itself. Off: just tell me.',
          <Select key="autoupdate" value={auto ? 'on' : 'off'} options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} onSelect={v => {
            void $.store.set('autoUpdate', v === 'on').catch(() => undefined)
            void update($, autoUpdateAtom, () => v === 'on')
          }} />),
        row('version', `Version ${version}`, 'Restart Claude after an update to use it.',
          <Button key="check" label="Check for updates" variant="secondary" onPress={async () => {
            const latest = await latestVersion($).catch(() => null)
            if (latest === null) return $.ui.toast("Couldn't reach GitHub to check.")
            if (!isNewer(latest, version)) return $.ui.toast(`villager-hp ${version} is the latest.`)
            if (!isCatalogPath($.plugin.root)) return $.ui.toast(`villager-hp ${latest} is out. ${NOT_CATALOG}`)
            const result = await runUpdate($)
            $.ui.toast(result.ok ? `Updated to ${latest}. Restart Claude to use it.` : `Couldn't update: ${result.detail}`)
          }} />),
      )
    }

    const items = await read($, libraryAtom)
    const pins = await read($, pinsAtom)
    const tab = await read($, tabAtom)
    const query = (await read($, queryAtom)).trim().toLowerCase()
    const loading = await read($, libraryLoadingAtom)
    const isTerminal = e.surface === 'terminal'
    const now = Date.now()
    const matching = query === '' ? items : items.filter(i => `${i.title} ${i.detail}`.toLowerCase().includes(query))
    const { pinned, rest } = ordered(matching, pins, tab)
    const count = (kind: Tab) => (kind === 'all' ? matching.length : matching.filter(i => i.kind === kind).length)
    // Cards take three rows each where they have a border; plain rows one.
    const perItem = isTerminal ? 1 : 3
    const room = Math.max(4, Math.floor(((e.viewport?.rows ?? 40) - (isTerminal ? 8 : 14)) / perItem))
    const shownRest = rest.slice(0, Math.max(0, room - pinned.length))

    const card = (item: LibItem, isPinned: boolean) => {
      const look = KIND_LOOK[item.kind]
      const title = item.kind === 'artifact' || item.where.startsWith('https://') ? (
        <Link href={item.where} label={item.title} />
      ) : (
        <Button key={`open:${item.id}`} label={item.title} plain onPress={() => openFile($, item.where)}>
          <Text weight="semibold">{item.title}</Text>
        </Button>
      )
      const pin = (
        <Button key={`pin:${item.id}`} label={isPinned ? 'Unpin' : 'Pin'} plain dimColor={!isPinned} hover={{ color: '#f7b733' }} onPress={() => togglePin($, item.id)}>
          <Text color={isPinned ? '#f7b733' : undefined}>{isPinned ? '★' : '☆'}</Text>
        </Button>
      )
      if (isTerminal)
        return (
          <Box key={`card:${item.id}`} flexDirection="row" gap={1}>
            {pin}
            <Text color={look.color}>{look.icon}</Text>
            {title}
            <Text dimColor>{`${item.detail} · ${age(item.modifiedMs, now)}`}</Text>
          </Box>
        )
      return (
        <Box
          key={`card:${item.id}`}
          flexDirection="row"
          alignItems="center"
          gap={1}
          paddingX={1}
          borderStyle="round"
          borderColor={isPinned ? '#5a4517' : '#2b333d'}
          backgroundColor={isPinned ? '#1d1a12' : '#151a21'}
          hover={{ borderColor: look.color, backgroundColor: '#1c232d' }}
        >
          <Text color={look.color} backgroundColor={look.tint} bold>{` ${look.icon} `}</Text>
          <Box flexDirection="column" flexGrow={1}>
            {title}
            <Text size="caption" dimColor wrap="truncate-end">{`${look.name} · ${item.detail} · ${age(item.modifiedMs, now)}`}</Text>
          </Box>
          {pin}
        </Box>
      )
    }

    const section = (heading: string, list: readonly LibItem[], isPinned: boolean, color: string) =>
      list.length === 0 ? (
        <></>
      ) : (
        <Box key={`section:${heading}`} flexDirection="column" gap={isTerminal ? 0 : 1}>
          <Text size="caption" weight="bold" color={color}>{heading.toUpperCase()}</Text>
          {...list.map(item => card(item, isPinned))}
        </Box>
      )
    const DAY_MS = 24 * 60 * 60 * 1000
    const today = shownRest.filter(i => now - i.modifiedMs < DAY_MS)
    const week = shownRest.filter(i => now - i.modifiedMs >= DAY_MS && now - i.modifiedMs < 7 * DAY_MS)
    const earlier = shownRest.filter(i => now - i.modifiedMs >= 7 * DAY_MS)
    const isEmpty = pinned.length === 0 && shownRest.length === 0

    return (
      <Box flexDirection="column" gap={1} paddingX={isTerminal ? 0 : 1}>
        {tabBar}
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Box flexDirection="column">
            <Text size="caption" dimColor>
              {loading && items.length === 0 ? 'Looking for your artifacts, docs and videos…' : `${items.length} items · ${pins.length} pinned · newest first`}
            </Text>
          </Box>
          <Button key="refresh" label="Refresh" variant="secondary" onPress={() => refreshLibrary($)}>
            {loading ? '↻ Refreshing…' : '↻ Refresh'}
          </Button>
        </Box>
        <Input key="search" placeholder="Search by name or folder" value={query} onInput={v => void update($, queryAtom, () => v)} onSubmit={v => void update($, queryAtom, () => v)} />
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {...TABS.map(([id, label]) => (
            <Button key={`tab:${id}`} label={label} variant={tab === id ? 'primary' : 'secondary'} onPress={() => update($, tabAtom, () => id)}>
              <Text weight={tab === id ? 'semibold' : 'regular'}>{label}</Text>
              <Text dimColor>{` ${count(id)}`}</Text>
            </Button>
          ))}
        </Box>
        {isEmpty ? (
          <Box flexDirection="column" paddingY={1} alignItems="center">
            <Text dimColor>
              {loading ? 'Looking…' : query !== '' ? `Nothing matches "${query}".` : 'Nothing here yet. Press Refresh to look again.'}
            </Text>
          </Box>
        ) : (
          <Box flexDirection="column" gap={1}>
            {section('★ Pinned', pinned, true, '#f7b733')}
            {section('Today', today, false, '#8f9aa7')}
            {section('This week', week, false, '#8f9aa7')}
            {section('Earlier', earlier, false, '#8f9aa7')}
            {rest.length > shownRest.length ? <Text size="caption" dimColor>{`…and ${rest.length - shownRest.length} more. Search or pick a tab to narrow it.`}</Text> : <></>}
          </Box>
        )}
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
    const usd = (await $.session.usage().catch(() => null))?.cost?.usd
    // No estimate yet (a new chat, before its first reply) is a cost of nothing so far.
    await update($, costAtSendAtom, () => usd ?? 0).catch(() => undefined)
    await recordUse($, { prompts: 1 }).catch(() => undefined)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    // The prompt's cost so far: the session's estimate now, less what it was at send.
    if (e.agentId === undefined) {
      const sent = await read($, costAtSendAtom)
      const usd = (await $.session.usage().catch(() => null))?.cost?.usd
      if (sent !== null && usd !== undefined) await update($, lastPromptAtom, t => (t === null ? t : { ...t, usd: Math.max(0, usd - sent) }))
    }
    const u = e.usage
    if (u !== undefined) {
      // New tokens only: cache reads re-read the chat each turn and would swamp the day.
      await recordUse($, { tokens: u.input_tokens + u.output_tokens + u.cache_creation_input_tokens }).catch(() => undefined)
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
    const sent = await read($, costAtSendAtom)
    const usd = e.cost?.usd
    const seen = await read($, lastCostSeenAtom)
    if (usd !== undefined) {
      if (seen !== null && usd > seen) await recordUse($, { usd: usd - seen }).catch(() => undefined)
      await update($, lastCostSeenAtom, () => usd)
    }
    if (sent !== null && usd !== undefined)
      await update($, lastPromptAtom, t => (t === null ? t : { ...t, usd: Math.max(0, usd - sent) }))
    await update($, nowAtom, () => Date.now())
    return next(e)
  })

  on('command.run', { command: 'hp' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'usage' || arg === 'settings') {
      await openPane($, arg)
      return { text: arg === 'usage' ? 'Opened your AI usage history.' : 'Opened villager-hp settings.' }
    }
    if (arg === 'update' || arg === 'version') {
      const mine = await installedVersion($).catch(() => 'unknown')
      let latest: string
      try {
        latest = await latestVersion($)
      } catch (err) {
        return { text: `villager-hp ${mine}. Couldn't reach GitHub to check for a newer one (${err instanceof Error ? err.message : String(err)}).` }
      }
      if (!isNewer(latest, mine)) return { text: `villager-hp ${mine} is the latest.` }
      if (arg === 'version') return { text: `villager-hp ${mine}; ${latest} is out. Type /hp update to get it.` }
      if (!isCatalogPath($.plugin.root)) return { text: `villager-hp ${latest} is out (you have ${mine}). ${NOT_CATALOG}` }
      const result = await runUpdate($)
      return {
        text: result.ok
          ? `Updated villager-hp ${mine} → ${latest}. Restart Claude to use it.`
          : `Couldn't update to ${latest}: ${result.detail || 'no reason given'}. Pasting the install line again also updates it.`,
      }
    }
    if (arg.startsWith('autoupdate')) {
      const want = arg.split(/\s+/)[1]
      if (want === 'on' || want === 'off') {
        await $.store.set('autoUpdate', want === 'on').catch(() => undefined)
        await update($, autoUpdateAtom, () => want === 'on')
      }
      else if (want !== undefined) return { text: 'Use /hp autoupdate on or /hp autoupdate off.' }
      return {
        text: (await isAutoUpdate($))
          ? 'Auto update is on: once a day villager-hp checks for a newer version and installs it. /hp autoupdate off to be told instead.'
          : 'Auto update is off: you get a reminder when a newer version is out. /hp update installs it; /hp autoupdate on to do it by itself.',
      }
    }
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
        tokensLine(await read($, lastPromptAtom), money(await read($, lastPromptAtom), await read($, fxRateAtom))),
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
    const cost = money(tokens, await read($, fxRateAtom))
    const elements = $.ui.resolve(e)

    // The animated card everywhere but the terminal, which gets the text bars.
    // Chosen by the surface, not by which elements the table lists: a table can
    // carry an element its surface draws as nothing.
    if (e.surface !== 'terminal' && 'Svg' in elements) {
      const { Box, Svg, Button, Text } = elements
      const alt =
        all.map(b => `${b.label} ${b.hp === null ? 'unknown' : `${b.hp} of 100`} HP`).join(', ') +
        (pace === null ? '' : `, weekly pace ${pace.projected}% of the limit by the reset`)
      const sum = tokens === null ? null : promptSummary(tokens, cost)
      // One dark rounded panel: the card at the left (85%, drawn narrower so its
      // bars are shorter) and a column at the right (15%) with Open and, under
      // it, the last prompt; hover that for the breakdown, which shows under the
      // panel. Side by side, nothing laid over the image, so its size never
      // matters. Colours are set for the dark panel, whatever the theme.
      const C = { muted: '#8f9aa7', text: '#e6ebf1', cost: '#86efac' }
      return (
        <Box flexDirection="column">
          {below}
          <Box flexDirection="column" backgroundColor="#0f1318" borderStyle="round" borderColor="#2a313b" paddingX={1}>
            <Box flexDirection="row" alignItems="center">
              <Box width="85%">
                <Svg key={`hp-${m}-${paceZone(pace)}-${ultra}`} source={hudSvg(all, { pace, hideSession: ultra, width: CARD_W_BESIDE_OPEN })} alt={`Claude's health: ${alt}`} />
              </Box>
              <Box width="15%" flexDirection="column" alignItems="center" justifyContent="center" gap={1}>
                <Button key="open" label="Open" variant="primary" onPress={() => openPane($)}>
                  <Text>⊞</Text>
                  <Text weight="semibold">{' Open'}</Text>
                </Button>
                <Box key="tokens" flexDirection="column" alignItems="center" hover={{ scope: TOKENS_SCOPE }}>
                  <Text size="caption" weight="bold" color={C.muted}>{sum === null ? 'LAST PROMPT —' : 'LAST PROMPT ⓘ'}</Text>
                  {sum === null ? (
                    <></>
                  ) : (
                    <Box flexDirection="row" gap={1}>
                      {...(sum.cost ? [<Text key="cost" size="caption" weight="bold" color={C.cost}>{sum.cost}</Text>] : [])}
                      <Text key="fresh" size="caption" color={C.text}>{`${sum.fresh} new`}</Text>
                    </Box>
                  )}
                </Box>
              </Box>
            </Box>
            {sum === null ? (
              <></>
            ) : (
              <Box key="tokens-detail" display="none" hover={{ display: 'flex', scope: TOKENS_SCOPE }} flexDirection="row" flexWrap="wrap" justifyContent="flex-end" gap={2} paddingX={1} paddingBottom={1}>
                {...sum.detail.map(([label, value]) => (
                  <Box key={`detail:${label}`} flexDirection="row" gap={1}>
                    <Text size="caption" color={C.muted}>{label}</Text>
                    <Text size="caption" weight="semibold" color={C.text}>{value}</Text>
                  </Box>
                ))}
              </Box>
            )}
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
          <Box flexDirection="column">
            {...all.map((b, i) => (
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
                <Text color="#86efac" bold>{cost ? `~${cost}  ` : ''}</Text>
                <Text color="#f1e3c0" bold>{`${fmtTokens(newTokens(tokens))} new tokens`}</Text>
                <Text color="#cdbb94">{`  (${fmtTokens(tokens.cacheRead)} re-read from cache)`}</Text>
              </Box>
            ) : (
              <></>
            )}
            <Box flexDirection="row">
              <Text>{'       '}</Text>
              <Button key="open" label="Open" hotkey="o" onPress={() => openPane($)} />
              <Text dimColor>{'  artifacts, docs and videos'}</Text>
            </Box>
          </Box>
        )}
      </Box>
    )
  })
}
