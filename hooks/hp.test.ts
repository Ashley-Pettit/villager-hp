import type { On, RenderElement } from 'claude-code'
import { expect, test } from 'claude-code/testing'

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
