import type { On, RenderElement } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { weeklyPace } from './hud'

// The band as the engine hands it to a ui.render hook.
const BAND = {
  hasSurvey: false,
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

test('desktop: /pace over floats the hourglass by the villager, and /pace ok takes it away', async ($, on) => {
  statusRow(on)

  const ui = await $.ui.mount({ plugin: 'villager-hp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  await $.command.run(hp('64'))
  const card = async () => String((await ui.find({ type: 'Svg' }))?.props.source)

  await $.command.run(pace('over'))
  const over = await card()
  await $.command.run(pace('ok'))
  const ok = await card()

  expect(over).toMatch(/M -2\.6,-3\.6 L 2\.6,-3\.6/)
  expect(ok).not.toMatch(/M -2\.6,-3\.6 L 2\.6,-3\.6/)
  // The villager is drawn the same either way: the hourglass is added, nothing of him changes.
  expect(over.replace(/<g>\s*<animateTransform attributeName="transform" type="translate" values="0 0;0 -1\.2;0 0"[\s\S]*?<\/g><\/g>\s*<\/g>/, '').replace(/\s+/g, '')).toBe(ok.replace(/\s+/g, ''))
})

test('desktop: a dead villager gets no hourglass', async ($, on) => {
  statusRow(on)

  const ui = await $.ui.mount({ plugin: 'villager-hp', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  await $.command.run(pace('over'))
  await $.command.run(hp('0'))

  expect(String((await ui.find({ type: 'Svg' }))?.props.source)).not.toMatch(/M -2\.6,-3\.6 L 2\.6,-3\.6/)
})

test('terminal: /pace over marks the weekly row', async ($, on) => {
  statusRow(on)

  const ui = await $.ui.mount({ plugin: 'villager-hp', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  await $.command.run(hp('64'))
  await $.command.run(pace('over'))

  expect(await ui.find({ type: 'Text', text: /⏳ out (by|in) / })).toBeDefined()
})
