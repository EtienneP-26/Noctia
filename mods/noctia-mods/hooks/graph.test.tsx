import { describe, expect, test } from 'claude-code/testing'

import type { GraphNode } from '../types'
import { clock, columnsFor, connector, drawGraph, drawRows, finishedWaves, parseDesc, rows, sanitize, summary, tok } from './graph'

const node = (o: Partial<GraphNode>): GraphNode => ({
  id: 'a', wave: 1, label: '', task: 't', model: 'm', status: 'done', startedAt: 0, endedAt: 1000, ...o,
})

describe('graph helpers', () => {
  test('parseDesc reads the wave and task prefix', () => {
    expect(parseDesc('W2·T5 config parser')).toEqual({ wave: 2, label: 'W2·T5', task: 'config parser' })
    expect(parseDesc('plain task')).toEqual({ wave: 0, label: '', task: 'plain task' })
  })

  test('sanitize strips ANSI and control characters', () => {
    expect(sanitize('\x1b[31mred\x1b[0m\x07 ok\n')).toBe('red ok')
    expect(parseDesc('W1·T1 \x1b[2Jhi').task).toBe('hi')
  })

  test('layout uses 2 boxes, 3 when wide', () => {
    expect(columnsFor(60)).toBe(2)
    expect(columnsFor(120)).toBe(3)
    expect(rows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  test('a finished wave collapses to one line', () => {
    const nodes = [
      node({ id: 'a', tokens: 30000, endedAt: 100000 }),
      node({ id: 'b', tokens: 22000, endedAt: 220000 }),
      node({ id: 'c', wave: 2, status: 'running', endedAt: undefined }),
    ]
    expect(finishedWaves(nodes)).toEqual([1])
    expect(summary(1, nodes, 0)).toBe('✔ W1 · 2 agents · 3m40 · 52k tok')
  })

  test('clock and tok format', () => {
    expect(clock(42)).toBe('42s')
    expect(tok(850)).toBe('850')
    expect(tok(undefined)).toBe('')
  })
})

describe('connector', () => {
  test('two boxes: stem over a bar with corners and a join', () => {
    
    const [stem, bar] = connector(2, 20, 2)
    expect(bar!.startsWith('     ┌')).toBe(true)
    expect(bar!.endsWith('┐')).toBe(true)
    expect(bar!.indexOf('┴')).toBe(stem!.indexOf('│'))
  })

  test('one box is a plain stem, three boxes cross in the middle', () => {
    expect(connector(1, 20, 2)).toHaveLength(1)
    expect(connector(3, 30, 3)[1]).toContain('┼')
  })
})

describe('graph pane', () => {
  test('renders chief, running boxes and a collapsed wave', async ($, on) => {
    const base = { model: 'm', task: 't', startedAt: 0 }
    const list = [
      { ...base, id: 'a', wave: 1, label: 'W1·T1', status: 'done', endedAt: 5000, tokens: 1000 },
      { ...base, id: 'b', wave: 2, label: 'W2·T1', status: 'running' },
      { ...base, id: 'c', wave: 2, label: 'W2·T2', status: 'running', parent: 'b' },
    ]
    on('state.get', () => ({ value: { value: list, version: 1 } }))
    const ui = await $.ui.mount({
      plugin: 'noctia-mods',
      component: 'Pane',
      requestId: 'noctia-graph',
      surface: 'terminal',
      props: { title: 'Noctia graph', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
    })
    expect((await ui.find({ type: 'Text', text: /chief/ }))?.text).toContain('chief')
    expect((await ui.find({ type: 'Text', text: /W1 · 1 agent/ }))?.text).toContain('✔ W1')
    await ui.unmount()
  })
})

describe('drawGraph', () => {
  test('exact lines', () => {
    const base = { model: 'opus', startedAt: 0 }
    const state: GraphNode[] = [
      { ...base, id: 'a', wave: 1, label: 'W1·T1', task: 'old', type: 'noctia:reader', status: 'done', endedAt: 220000, tokens: 52000 },
      { ...base, id: 'b', wave: 2, label: 'W2·T1', task: 'config parser', type: 'noctia:developer', status: 'running', startedAt: 230000 },
      { ...base, id: 'c', wave: 2, label: 'W2·T2', task: 'tests', type: 'noctia:tester', status: 'running', startedAt: 230000, tokens: 800 },
      { ...base, id: 'd', wave: 2, label: 'W2·T3', task: 'done task', type: 'noctia:developer', status: 'done', startedAt: 230000, endedAt: 250000 },
    ]
    expect(drawGraph(state, 90, 260000)).toEqual([
      '☾ GRAPH  4m20 · 53k tok  ▶ 2  ✔ 2  ✘ 0',
      '                                     ╭────────────╮',
      '                                     │ ☾ chief    │',
      '                                     ╰──────┬─────╯',
      '                                            │',
      '                      ┌─────────────────────┼─────────────────────┐',
      ' ╭────────────────────┴───────────────────╮ │╭────────────────────┴───────────────────╮',
      ' │ ▶ developer · W2·T1                    │ ││ ▶ tester · W2·T2                       │',
      ' │ config parser                          │ ││ tests                                  │',
      ' │ opus · 30s                             │ ││ opus · 30s · 800 tok                   │',
      ' ╰────────────────────────────────────────╯ │╰────────────────────────────────────────╯',
      '                                            │',
      '                       ╭────────────────────┴───────────────────╮',
      '                       │ ✔ developer · W2·T3                    │',
      '                       │ done task                              │',
      '                       │ opus · 20s                             │',
      '                       ╰────────────────────────────────────────╯',
      '✔ W1 · 1 agent · 3m40 · 52k tok',
    ])
  })
})

describe('drawRows tones and trunk', () => {
  const base = { model: 'm', task: 't', startedAt: 0, wave: 2, label: '' }
  const mk = (id: string, status: GraphNode['status']): GraphNode => ({ ...base, id, status })

  test('a box is toned by its status', () => {
    const lines = drawRows([mk('a', 'running'), mk('b', 'error')], 90, 1000)
    const box = lines.find(r => r.text.includes('▶ agent'))!
    expect(box.tone[box.text.indexOf('▶')]).toBe('r')
    expect(box.tone[box.text.indexOf('│')]).toBe('r')
    const bad = lines.find(r => r.text.includes('✘ agent'))!
    expect(bad.tone[bad.text.indexOf('✘')]).toBe('e')
  })

  test('with a box on the axis the trunk runs down the left edge', () => {
    const wide = ['a', 'b', 'c', 'd'].map(id => mk(id, 'running'))
    const text = drawGraph(wide, 120, 1000)
    expect(text.some(l => l.startsWith('└'))).toBe(true)
    expect(text.some(l => l.startsWith('┌'))).toBe(true)
  })
})
