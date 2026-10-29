import { expect, test } from 'claude-code/testing'

const BASE = { plugin: 'noctia-mods', surface: 'terminal' } as const

const PANE = {
  ...BASE,
  component: 'Pane',
  requestId: 'noctia-status',
  props: {
    title: 'Noctia',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('the status pane says git is locked by default and how to unlock it', async ($) => {
  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /locked/ }))?.text).toContain('locked')
  expect(await ui.find({ type: 'Text', text: /\/noctia:git ask/ })).toBeDefined()
  await ui.unmount()
})

test('the status pane lists every feature', async ($) => {
  const ui = await $.ui.mount(PANE)
  for (const label of ['Noctia', 'Git', 'Co-author', 'Guards', 'Model', 'Team', 'Mentor']) {
    expect(await ui.find({ type: 'Text', text: new RegExp(label) })).toBeDefined()
  }
  await ui.unmount()
})

const BAND = {
  ...BASE,
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100 },
} as const

test('the banner shows the Noctia name and the git mode', async ($, on) => {
  on('ui.render', () => undefined)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /NOCTIA/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Git/ })).toBeDefined()
  await ui.unmount()
})

test('the banner gives way to a survey', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true } })
  expect(await ui.find({ type: 'Text', text: /NOCTIA/ })).toBeUndefined()
  await ui.unmount()
})
