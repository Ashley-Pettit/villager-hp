import type { On, RenderElement } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { bars, fmtTokens, hudSvg, isUltra, pacePosition, paceShort, weeklyPace } from './hud'
import { addTurn, asCurrency, estimateUsd, fmtMoney, promptUsd } from './money'
import { dayKey, lastDays, sumDays } from './usage'
import { ordered, parseArtifacts } from './library'
import { isCatalogPath, isNewer } from './update'

// The band as the engine hands it to a ui.render hook.
const BAND = {
  hasSurvey: false,
  isCollapsed: false,
  isWorking: false,
  maxRows: 24,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 24 },
  view: {},
}

// /hp <level> as the person types it.
const hp = (args: string) =>
  ({
    command: 'hp',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 100 },
  }) as const

// Stands for whatever else already draws in the band (another mod's row, a status line).
const statusRow = (on: On) =>
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'status row') as RenderElement
  })

for (const [level, shown] of [
  ['0', /Claude has been defeated/],
  ['40', /40\/100/],
  ['100', /100\/100/],
] as const) {
  test(`terminal: /hp ${level} draws the health text, not an empty card`, async ($, on) => {
    statusRow(on)

    const ui = await $.ui.mount({ plugin: 'villager-hp', surface: 'terminal', component: 'AbovePrompt', props: BAND })
    await $.command.run(hp(level))

    expect(await ui.find({ type: 'Text', text: shown })).toBeDefined()
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    expect(await ui.find({ text: 'status row' })).toBeDefined()
  })

  test(`desktop: /hp ${level} draws the animated card`, async ($, on) => {
    statusRow(on)

    const ui = await $.ui.mount({ plugin: 'villager-hp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
    await $.command.run(hp(level))

    expect(await ui.find({ type: 'Svg' })).toBeDefined()
    expect(await ui.find({ text: 'status row' })).toBeDefined()
  })
}

// A weekly window that resets `daysLeft` days after `now`, with `used` percent gone.
const NOW = Date.parse('2026-10-14T02:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const week = (used: number, daysLeft: number) => [{ kind: 'seven_day', percentUsed: used, resetsAt: new Date(NOW + daysLeft * DAY).toISOString() }]

test('weekly pace: half the limit gone two days in is over, and runs out before the reset', () => {
  const pace = weeklyPace(week(50, 5), null, NOW)
  expect(pace?.isOver).toBe(true)
  expect(pace?.projected).toBe(175)
  // Two more days at this rate: a day and a time, sooner than the reset five days off.
  expect(pace?.runsOut).toMatch(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d/)
})

test('weekly pace: a fifth of the limit gone two days in is on track', () => {
  const pace = weeklyPace(week(20, 5), null, NOW)
  expect(pace?.isOver).toBe(false)
  expect(pace?.projected).toBe(70)
})

test('weekly pace: no call in the first hours of a week, or without a reading', () => {
  expect(weeklyPace(week(9, 6.75), null, NOW)).toBeNull()
  expect(weeklyPace([], null, NOW)).toBeNull()
})

// /pace as the person types it.
const pace = (args: string) => ({ ...hp(args), command: 'pace' }) as const

test('pace over: the PACE bar shows how far over, with no hourglass, date or over-pace chip', async ($, on) => {
  statusRow(on)
  const ui = await $.ui.mount({ plugin: 'villager-hp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  await $.command.run(hp('64'))
  await $.command.run(pace('over'))
  const card = String((await ui.find({ type: 'Svg' }))?.props.source)

  expect(card).toMatch(/>130<tspan/)
  expect(card).not.toMatch(/over pace/)
  expect(card).not.toMatch(/M -2\.6,-3\.6 L 2\.6,-3\.6/)
  expect(card).not.toMatch(/cap (in |Mon|Tue|Wed|Thu|Fri|Sat|Sun)/)
})

test('terminal: pace over shows its percent on the PACE row, with no ⏳ date or over-pace text', async ($, on) => {
  statusRow(on)
  const ui = await $.ui.mount({ plugin: 'villager-hp', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  await $.command.run(hp('64'))
  await $.command.run(pace('over'))

  expect(await ui.find({ type: 'Text', text: /130%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /over pace/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /⏳/ })).toBeUndefined()
})

// ---- 2.9: Ultra layout and last prompt tokens ----

const ultraCmd = (args: string) => ({ ...hp(args), command: 'ultra' }) as const
// The test engine keeps no store: answer /ultra's write.
const memoryStore = (on: On) => on('store.set', () => ({ value: undefined }))

test('ultra: auto reads Ultra from a weekly window with no 5-hour one, or from the plan name', () => {
  expect(isUltra('auto', null, week(20, 5))).toBe(true)
  expect(isUltra('auto', null, [...week(20, 5), { kind: 'five_hour', percentUsed: 10 }])).toBe(false)
  expect(isUltra('auto', 'claude_ultra', [])).toBe(true)
  expect(isUltra('auto', null, [])).toBe(false)
  expect(isUltra('ultra', null, [])).toBe(true)
  expect(isUltra('standard', 'claude_ultra', week(20, 5))).toBe(false)
})

test('pace bar: on track sits in the middle, plenty to the right, the cap to the left', () => {
  expect(pacePosition(null)).toBe(0.5)
  expect(pacePosition({ isOver: false, projected: 100, runsOut: '' })).toBe(0.5)
  expect(pacePosition({ isOver: false, projected: 70, runsOut: '' })).toBeGreaterThan(0.5)
  expect(pacePosition({ isOver: true, projected: 175, runsOut: 'Thu 3pm' })).toBeLessThan(0.5)
  expect(pacePosition({ isOver: true, projected: 400, runsOut: 'Thu 3pm' })).toBe(0)
  expect(paceShort({ isOver: false, projected: 70, runsOut: '' })).toBe('30% spare')
  expect(paceShort({ isOver: false, projected: 98, runsOut: '' })).toBe('on track')
  expect(paceShort({ isOver: true, projected: 175, runsOut: 'Thu 3pm' })).toBe('')
})

test('tokens: short counts', () => {
  expect(fmtTokens(950)).toBe('950')
  expect(fmtTokens(12_400)).toBe('12k')
  expect(fmtTokens(4_250)).toBe('4.3k')
  expect(fmtTokens(1_250_000)).toBe('1.25M')
})

test('desktop: /ultra on swaps SESSION for the PACE bar', async ($, on) => {
  statusRow(on)
  memoryStore(on)
  const ui = await $.ui.mount({ plugin: 'villager-hp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  await $.command.run(hp('64'))
  const card = async () => String((await ui.find({ type: 'Svg' }))?.props.source)

  // Not Ultra: three bars, SESSION, WEEKLY and PACE, on a taller card.
  const standard = await card()
  expect(standard).toMatch(/>SESSION</)
  expect(standard).toMatch(/>PACE</)
  expect(standard).toMatch(/viewBox="0 0 880 94"/)
  await $.command.run(ultraCmd('on'))
  const ultra = await card()
  expect(ultra).not.toMatch(/>SESSION</)
  expect(ultra).toMatch(/>PACE</)
  expect(ultra).toMatch(/>WEEKLY</)
  await $.command.run(ultraCmd('off'))
  expect(await card()).toMatch(/>SESSION</)
})

test('terminal: /ultra on draws the pace row and no SESSION row', async ($, on) => {
  statusRow(on)
  memoryStore(on)
  const ui = await $.ui.mount({ plugin: 'villager-hp', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  await $.command.run(hp('64'))
  await $.command.run(ultraCmd('on'))
  await $.command.run(pace('ok'))

  expect(await ui.find({ type: 'Text', text: /^PACE/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^SESSION/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /on track|spare/ })).toBeDefined()
})

test('terminal: not Ultra draws SESSION, WEEKLY and PACE rows', async ($, on) => {
  statusRow(on)
  const ui = await $.ui.mount({ plugin: 'villager-hp', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  await $.command.run(hp('64'))

  expect(await ui.find({ type: 'Text', text: /^SESSION/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^WEEKLY/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^PACE/ })).toBeDefined()
})

// ---- the Open pane ----

const ARTIFACTS = `3 published artifacts (most recently opened or updated first):
- (mine, web page, not a Doc) Road Defect Sorter — https://claude.ai/artifact/aaa — updated 2026-11-10
- (mine, Doc) Quarterly plan — https://claude.ai/artifact/bbb — updated 2026-11-24
- (mine, Design) Linda avatar — https://claude.ai/artifact/ccc — updated 2026-11-20`

test('library: reads the artifact list, a Doc counts as a doc', () => {
  const items = parseArtifacts(ARTIFACTS)
  expect(items.map(i => [i.title, i.kind, i.detail])).toEqual([
    ['Road Defect Sorter', 'artifact', 'web page'],
    ['Quarterly plan', 'doc', 'Doc'],
    ['Linda avatar', 'artifact', 'Design'],
  ])
})

test('library: pinned first, then the most recently edited', () => {
  const items = parseArtifacts(ARTIFACTS)
  const { pinned, rest } = ordered(items, ['https://claude.ai/artifact/aaa'], 'all')
  expect(pinned.map(i => i.title)).toEqual(['Road Defect Sorter'])
  expect(rest.map(i => i.title)).toEqual(['Quarterly plan', 'Linda avatar'])
  expect(ordered(items, [], 'doc').rest.map(i => i.title)).toEqual(['Quarterly plan'])
})

test('desktop: the card is a plain image with nothing around it, and no Open button', async ($, on) => {
  statusRow(on)
  const ui = await $.ui.mount({ plugin: 'villager-hp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  await $.command.run(hp('64'))

  expect(await ui.find({ type: 'Button', key: 'open' })).toBeUndefined()
  expect((await ui.find({ type: 'Svg' }))?.props.isInteractive).toBeUndefined()
  // The last prompt sits at the card's right end, "—" until the first prompt.
  expect(String((await ui.find({ type: 'Svg' }))?.props.source)).toMatch(/LAST PROMPT<\/text>\s*<text[^>]*>—</)
})

test('pane: /open lists artifacts and local docs and videos, recent first, and pins one to the top', async ($, on) => {
  memoryStore(on)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('tool.call', { tool: 'Artifact' }, () => ({ result: ARTIFACTS }) as never)
  on('session.info', () => ({ value: { transcriptPath: '/h/u/.claude/t.jsonl', configRoot: '/h/u/.claude', platform: 'macos' } }) as never)
  on('fs.list', ($, e) => {
    const path = (e as unknown as { path: string }).path
    const dir: Record<string, { name: string; kind: 'file' | 'dir'; size: number; mtimeMs: number; isLink: boolean }[]> = {
      '/h/u/Documents': [{ name: 'Budget.docx', kind: 'file', size: 1, mtimeMs: Date.parse('2026-11-23T09:00:00Z'), isLink: false }],
      '/h/u/Movies': [{ name: 'Holiday.mp4', kind: 'file', size: 1, mtimeMs: Date.parse('2026-11-01T09:00:00Z'), isLink: false }],
    }
    return { value: dir[path] ?? [] } as never
  })
  const ui = await $.ui.mount({
    plugin: 'villager-hp',
    surface: 'desktop',
    component: 'Pane',
    requestId: 'villager-open',
    props: { title: 'Open', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  })
  await $.command.run({ ...hp(''), command: 'open' })

  const titles = async () => (await ui.findAll({})).filter(n => n.type === 'Link' || n.type === 'Button').map(n => String(n.props.label)).filter(l => !/^(All|Artifacts|Docs|Videos|Refresh|Pin|Unpin|Open)$|^[⊞▤⚙] /.test(l))
  // The scan runs in the background; give it a few turns of the loop.
  for (let i = 0; i < 50 && (await titles()).length < 5; i++) await new Promise(r => (globalThis as unknown as { setTimeout: (f: (v: unknown) => void, ms: number) => void }).setTimeout(r, 5))
  expect(await titles()).toEqual(['Quarterly plan', 'Budget.docx', 'Linda avatar', 'Road Defect Sorter', 'Holiday.mp4'])

  await ui.press({ key: 'pin:/h/u/Movies/Holiday.mp4' })
  expect((await titles())[0]).toBe('Holiday.mp4')
  expect(await ui.find({ type: 'Text', text: /PINNED/ })).toBeDefined()

  // The search box narrows the list as you type.
  await $.ui.input({ plugin: 'villager-hp', key: 'search', text: 'budget', kind: 'change' } as never)
  expect(await titles()).toEqual(['Budget.docx'])
})

// ---- updates ----

test('update: version compare reads numbers, not text', () => {
  expect(isNewer('2.10.0', '2.9.0')).toBe(true)
  expect(isNewer('2.9.0', '2.9.0')).toBe(false)
  expect(isNewer('2.9.1', '2.10.0')).toBe(false)
  expect(isNewer('3', '2.99.99')).toBe(true)
})

const updateEngine = (on: On, latest: string, exitCode = 0) => {
  const ran: string[][] = []
  memoryStore(on)
  on('fs.read', () => ({ value: JSON.stringify({ name: 'villager-hp', version: '2.10.0' }) }) as never)
  on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ version: latest }) } }) as never)
  on('session.info', () => ({ value: { transcriptPath: '/h/u/.claude/t.jsonl', configRoot: '/h/u/.claude', platform: 'macos' } }) as never)
  on('fs.exists', () => ({ value: true }) as never)
  on('process.run', ($, e) => {
    ran.push([...(e as unknown as { argv: string[] }).argv])
    return { value: { exitCode, stdout: 'done', stderr: '' } } as never
  })
  return ran
}

test('update: only the copy from the install line updates itself', () => {
  expect(isCatalogPath('/Users/ash/.claude/plugins/cache/villager-hp/villager-hp/2.11.0')).toBe(true)
  expect(isCatalogPath('C:\\Users\\ash\\.claude\\plugins\\cache\\villager-hp\\villager-hp\\2.11.0')).toBe(true)
  expect(isCatalogPath('/root/.claude/plugins/synced/org_x/villager-hp')).toBe(false)
  expect(isCatalogPath('/home/ash/code/villager-hp')).toBe(false)
})

test('/hp update on a copy from claude.ai or a folder says where to update it, and runs nothing', async ($, on) => {
  const ran = updateEngine(on, '2.99.0')
  const out = (await $.command.run({ ...hp('update') })) as { text?: string }
  expect(out.text).toMatch(/2\.99\.0 is out .*can't update itself/)
  expect(ran).toEqual([])
})

test('/hp update says so when this is already the latest, and runs nothing', async ($, on) => {
  const ran = updateEngine(on, '2.10.0')
  const out = (await $.command.run({ ...hp('update') })) as { text?: string }
  expect(out.text).toBe('villager-hp 2.10.0 is the latest.')
  expect(ran).toEqual([])
})

// ---- the last prompt's rough cost ----

test('money: rough cost in the chosen currency', () => {
  expect(fmtMoney(0.274, 'AUD', 1.53)).toBe('A$0.42')
  expect(fmtMoney(0.002, 'AUD', 1.53)).toBe('<A$0.01')
  expect(fmtMoney(1.5, 'EUR', 0.92)).toBe('€1.38')
  expect(fmtMoney(0.42, 'JPY', 152)).toBe('¥64')
  expect(asCurrency('eur')).toBe('EUR')
  expect(asCurrency('XYZ')).toBe('AUD')
})


// ---- AI usage history and settings ----

test('usage: the last days fill in zeros, and add up', () => {
  const now = Date.parse('2026-11-25T10:00:00')
  const history = { [dayKey(now)]: { tokens: 1000, usd: 0.5, prompts: 2 }, [dayKey(now - 2 * 864e5)]: { tokens: 500, usd: 0.25, prompts: 1 } }
  const days = lastDays(history, 7, now)
  expect(days.map(d => d.tokens)).toEqual([0, 0, 0, 0, 500, 0, 1000])
  expect(sumDays(days)).toEqual({ tokens: 1500, usd: 0.75, prompts: 3 })
})

const PANE_PROPS = { title: 'villager-hp', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } as const

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: /hp usage opens the AI usage tab with today, 7 and 30 days`, async ($, on) => {
    memoryStore(on)
    on('ui.open', () => ({ value: { isPlaced: true } }) as never)
    const ui = await $.ui.mount({ plugin: 'villager-hp', surface, component: 'Pane', requestId: 'villager-open', props: PANE_PROPS })
    await $.command.run({ ...hp('usage') })

    expect(await ui.find({ type: 'Text', text: 'TODAY' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'LAST 30 DAYS' })).toBeDefined()
    if (surface === 'desktop') expect(String((await ui.find({ type: 'Svg' }))?.props.alt)).toMatch(/Rough cost per day/)
  })
}

test('settings: the currency picker shows the chosen currency', { options: { currency: 'EUR' } }, async ($, on) => {
  memoryStore(on)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('fs.read', () => ({ value: JSON.stringify({ version: '2.11.0' }) }) as never)
  const ui = await $.ui.mount({ plugin: 'villager-hp', surface: 'desktop', component: 'Pane', requestId: 'villager-open', props: PANE_PROPS })
  await $.command.run({ ...hp('settings') })

  expect((await ui.find({ type: 'Select', key: 'currency' }))?.props.value).toBe('EUR')
  expect(await ui.find({ type: 'Text', text: 'Version 2.11.0' })).toBeDefined()
})

test('/pace over gives a percent, never a date', async ($, on) => {
  await $.command.run(hp('64'))
  const out = (await $.command.run(pace('over'))) as { text?: string }
  const said = (await $.command.run(pace(''))) as { text?: string }
  expect(out.text).toMatch(/over pace/)
  expect(said.text).toMatch(/about \d+% of the limit by the reset/)
  expect(said.text).not.toMatch(/out (by|in)|Mon|Tue|Wed|Thu|Fri|Sat|Sun/)
})

test('desktop: after a prompt, the card shows its rough cost, never tokens', async ($, on) => {
  statusRow(on)
  on('prompt.submit', (_, e) => e as never)
  const ui = await $.ui.mount({ plugin: 'villager-hp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  await $.prompt.submit({ text: 'hello' } as never)

  const card = String((await ui.find({ type: 'Svg' }))?.props.source)
  expect(card).toMatch(/LAST PROMPT/)
  expect(card).not.toMatch(/tokens/)
})

test('cost: worked out from the tokens at API prices when Claude Code gives none', () => {
  // The earlier real prompt on Opus 5.5: 4 in, 163 out, 395k re-read, 5 newly cached.
  const usd = estimateUsd({ input_tokens: 4, output_tokens: 163, cache_read_input_tokens: 394931, cache_creation_input_tokens: 5, model: 'claude-opus-5-5' })
  expect(fmtMoney(usd, 'AUD', 1.53)).toBe('A$0.13')
  expect(estimateUsd({ input_tokens: 1e6, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-sonnet-5-5' })).toBe(2)
  expect(estimateUsd({ input_tokens: 0, output_tokens: 1e6, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-fable-5-2' })).toBe(40)
})

test('cost: adding a turn keeps the cost, so the card shows it after the prompt', () => {
  const turn = { input_tokens: 4, output_tokens: 163, cache_read_input_tokens: 394931, cache_creation_input_tokens: 5, model: 'claude-opus-5-5' }
  const start = { total: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  const once = addTurn(start, turn)
  const twice = addTurn(once, turn)
  expect(fmtMoney(promptUsd(once) ?? 0, 'AUD', 1.53)).toBe('A$0.13')
  expect(fmtMoney(promptUsd(twice) ?? 0, 'AUD', 1.53)).toBe('A$0.25')
  // Claude Code's own figure, where it gave one, survives the next turn and wins.
  expect(promptUsd(addTurn({ ...once, usd: 0.5 }, turn))).toBe(0.5)
})

test('card: LAST PROMPT and TODAY side by side, as rough costs', () => {
  const svg = hudSvg(bars(week(20, 5), null, NOW), { prompt: { cost: 'A$0.13', today: 'A$1.20' } })
  expect(svg).toMatch(/>LAST PROMPT<\/text>\s*<text[^>]*>~A\$0\.13<\/text>/)
  expect(svg).toMatch(/>TODAY<\/text>\s*<text[^>]*>~A\$1\.20<\/text>/)
  expect(svg).not.toMatch(/tokens/)
  // Nothing yet: a dash for each.
  expect(hudSvg(bars(week(20, 5), null, NOW), { prompt: { cost: null, today: null } })).toMatch(/>TODAY<\/text>\s*<text[^>]*>—<\/text>/)
})
