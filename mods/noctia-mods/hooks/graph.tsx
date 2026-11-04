import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { GraphNode } from '../types'
import { shortName } from './team'
import { PALETTE } from './theme'

const PANE = 'noctia-graph'
const WIDE = 100
const graph = atom({ plugin: 'noctia-mods', key: 'graph' } as const, [] as GraphNode[])

const ICON = { running: '▶', done: '✔', error: '✘' } as const
const COLOR = { running: PALETTE.warn, done: PALETTE.muted, error: PALETTE.bad } as const
const PREFIX = /^W(\d+)·T(\d+)\s+/

/** The slash command that opens the graph pane. */
export const graphCommand = { name: 'graph', description: 'Show the live graph of the agents' }

/**
 * # Strip ANSI and control characters
 * ## Args
 * - text: untrusted text
 * ## Returns
 * The text without escape sequences or control characters.
 */
export const sanitize = (text: string): string =>
  // eslint-disable-next-line no-control-regex
  text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x1f\x7f-\x9f]/g, '')

/**
 * # Wave and task of a description
 * ## Args
 * - description: `W2·T5 config parser` or any text
 * ## Returns
 * `{ wave, task, label }`: wave 0 and no label without prefix; text is sanitized.
 * ## Example
 * parseDesc('W2·T5 parser') // { wave: 2, label: 'W2·T5', task: 'parser' }
 */
export const parseDesc = (description: string) => {
  const text = sanitize(description)
  const m = PREFIX.exec(text)
  return m
    ? { wave: Number(m[1]), label: `W${m[1]}·T${m[2]}`, task: text.slice(m[0].length) }
    : { wave: 0, label: '', task: text }
}

/**
 * # Short time
 * ## Returns
 * `42s` under a minute, `3m40` above.
 */
export const clock = (s: number): string =>
  s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}`

/**
 * # Short token count
 * ## Returns
 * `850`, `52k`; empty when unknown.
 */
export const tok = (n?: number): string =>
  n === undefined ? '' : n < 1000 ? `${n}` : `${Math.round(n / 1000)}k`

/** Boxes per row: 3 when the pane is wide, else 2. */
export const columnsFor = (width: number): number => (width >= WIDE ? 3 : 2)

/**
 * # Split into rows
 * ## Example
 * rows([1, 2, 3], 2) // [[1, 2], [3]]
 */
export const rows = <T,>(list: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) =>
    list.slice(i * size, i * size + size),
  )

/**
 * # Waves that are finished
 * ## Returns
 * Wave numbers (above 0) whose agents are all done or failed.
 */
export const finishedWaves = (nodes: GraphNode[]): number[] => {
  const waves = [...new Set(nodes.map(n => n.wave).filter(w => w > 0))]
  return waves.filter(w => nodes.every(n => n.wave !== w || n.status !== 'running'))
}

const elapsed = (n: GraphNode, now: number): number =>
  Math.round(((n.endedAt ?? now) - n.startedAt) / 1000)

const sum = (nodes: GraphNode[]): number | undefined =>
  nodes.some(n => n.tokens !== undefined)
    ? nodes.reduce((a, n) => a + (n.tokens ?? 0), 0)
    : undefined

/**
 * # Collapsed line of a finished wave
 * ## Example
 * summary(1, nodes, now) // '✔ W1 · 4 agents · 3m40 · 52k tok'
 */
export const summary = (wave: number, all: GraphNode[], now: number): string => {
  const nodes = all.filter(n => n.wave === wave)
  const span = Math.max(...nodes.map(n => n.endedAt ?? now)) - Math.min(...nodes.map(n => n.startedAt))
  const t = tok(sum(nodes))
  return `✔ W${wave} · ${nodes.length} agents · ${clock(Math.round(span / 1000))}${t ? ` · ${t} tok` : ''}`
}

/**
 * # Connector lines above a row of boxes
 * ## Args
 * - count: boxes in the row (centred)
 * - width: cells available
 * - cols: boxes per full row
 * ## Returns
 * Text lines: a stem from the parent, then a bar with a drop to each box.
 * ## Example
 * connector(2, 20, 2) // ['     │', '  ┌──┴──┐']  (stem over the bar's middle)
 */
export const connector = (count: number, width: number, cols: number): string[] => {
  const w = Math.floor(width / cols)
  const off = Math.floor(((cols - count) * w) / 2)
  const centers = Array.from({ length: count }, (_, i) => off + i * w + Math.floor(w / 2))
  const first = centers[0]!
  const last = centers[count - 1]!
  const mid = Math.floor((first + last) / 2)
  const stem = ' '.repeat(mid) + '│'
  if (count === 1) return [stem]
  const bar = Array.from({ length: last + 1 }, (_, x) => (x < first ? ' ' : '─'))
  centers.forEach(c => (bar[c] = '┬'))
  bar[first] = '┌'
  bar[last] = '┐'
  bar[mid] = centers.includes(mid) ? '┼' : '┴'
  return [stem, bar.join('')]
}

const count = (nodes: GraphNode[], status: GraphNode['status']): number =>
  nodes.filter(n => n.status === status).length

const kids = (nodes: GraphNode[], parent?: string): GraphNode[] =>
  nodes.filter(n => n.parent === parent)

const fit = (text: string, size: number): string =>
  (text.length > size ? `${text.slice(0, size - 1)}…` : text).padEnd(size)

/** A rounded box of `width` cells; `top`/`bottom` put a join mark on the border's axis. */
const frame = (inner: string[], width: number, top: boolean, bottom: boolean): string[] => {
  const edge = (l: string, r: string, mark: string | false) => {
    const cells = Array.from({ length: width - 2 }, () => '─')
    if (mark) cells[width / 2 - 1] = mark
    return l + cells.join('') + r
  }
  return [
    edge('╭', '╮', top && '┴'),
    ...inner.map(t => `│ ${fit(t, width - 4)} │`),
    edge('╰', '╯', bottom && '┬'),
  ]
}

const boxText = (n: GraphNode, now: number): string[] => [
  `${ICON[n.status]} ${shortName(n.type ?? 'agent')}${n.label ? ` · ${n.label}` : ''}`,
  n.task,
  `${n.model} · ${clock(elapsed(n, now))}${n.tokens === undefined ? '' : ` · ${tok(n.tokens)} tok`}`,
]

const join = (cells: string[][], w: number, off: number): string[] =>
  Array.from({ length: Math.max(...cells.map(c => c.length)) }, (_, i) =>
    ' '.repeat(off) + cells.map(c => (c[i] ?? '').padEnd(w)).join(''),
  )

/** Lines of the children of `parent`: connectors, boxes, then their own children below. */
const group = (nodes: GraphNode[], parent: string | undefined, width: number, cols: number, now: number, depth = 0): string[] => {
  const w = Math.floor(width / cols)
  return rows(kids(nodes, parent), cols).flatMap(line => {
    const cells = line.map(n => {
      const sub = depth < 4 ? group(nodes, n.id, w, 1, now, depth + 1) : []
      return [...frame(boxText(n, now), w - 2, true, sub.length > 0).map(l => ` ${l} `), ...sub]
    })
    return [...connector(line.length, width, cols), ...join(cells, w, ((cols - line.length) * w) / 2)]
  })
}

/**
 * # Full text of the graph
 * ## Args
 * - state: every agent node
 * - width: cells available (boxes per row follow it)
 * - now: current time in ms
 * ## Returns
 * The lines the pane shows: header, chief box, linked agent boxes, collapsed waves.
 */
export const drawGraph = (state: GraphNode[], width: number, now = Date.now()): string[] => {
  const cols = columnsFor(width)
  const w = 2 * Math.floor(width / cols / 2)
  const done = finishedWaves(state)
  const ids = new Set(state.filter(n => !done.includes(n.wave)).map(n => n.id))
  // an agent whose launcher is gone (collapsed wave) hangs from the chief
  const live = state
    .filter(n => ids.has(n.id))
    .map(n => (n.parent && ids.has(n.parent) ? n : { ...n, parent: undefined }))
  const span = state.length
    ? Math.round((Math.max(...state.map(n => n.endedAt ?? now)) - Math.min(...state.map(n => n.startedAt))) / 1000)
    : 0
  const t = tok(sum(state))
  const header = `☾ GRAPH  ${clock(span)}${t ? ` · ${t} tok` : ''}  ▶ ${count(state, 'running')}  ✔ ${count(state, 'done')}  ✘ ${count(state, 'error')}`
  const chief = frame(['☾ chief'], 14, false, live.length > 0).map(l => ' '.repeat((cols * w) / 2 - 7) + l)
  const body = live.length ? group(live, undefined, cols * w, cols, now) : ['No agent yet.']
  return [header, ...chief, ...body, ...done.map(v => summary(v, state, now))].map(l => l.trimEnd())
}

const ICONS = /([▶✔✘])/
const TONE: Record<string, string> = { '▶': COLOR.running, '✔': PALETTE.ok, '✘': COLOR.error }

/**
 * # Graph panel
 * Live boxes of the agents, linked to the agent that launched them.
 * ## Args
 * - on: the hook registrar
 */
export const registerGraph: Register = on => {
  on('command.run', { command: 'graph' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Noctia graph', columns: 90 })
    return { text: 'Graph opened.' }
  })

  on('agent.spawn', { subagentType: /.*/ }, async ($, e, next) => {
    const result = await next(e)
    if (!result.agentId) return result
    const { wave, label, task } = parseDesc(e.description ?? '')
    const node: GraphNode = {
      id: result.agentId,
      parent: e.parentAgentId,
      type: sanitize(e.subagentType ?? ''),
      wave,
      label,
      task,
      model: sanitize(result.model ?? ''),
      status: 'running',
      startedAt: Date.now(),
    }
    await update($, graph, list => [...list, node].slice(-60))
    void $.ui.open({ id: PANE, title: 'Noctia graph', columns: 90 })
    return result
  })

  on('turn.complete', { agentId: /./ }, async ($, e, next) => {
    const id = e.agentId
    if (id) {
      const used = e.usage ? e.usage.input_tokens + e.usage.output_tokens : undefined
      const status = e.reason === 'error' || e.reason === 'refusal' ? 'error' : 'done'
      await update($, graph, list =>
        list.map(n =>
          n.id === id
            ? { ...n, status, endedAt: Date.now(), tokens: used === undefined ? n.tokens : (n.tokens ?? 0) + used }
            : n,
        ),
      )
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const width = Math.max(40, e.props?.bodyColumns ?? e.viewport?.columns ?? 60)
    const lines = drawGraph(await read($, graph), width)
    return (
      <Box flexDirection="column">
        {lines.map((line, i) => (
          <Text key={i} wrap="truncate-end" color={/^✔ W\d+ ·/.test(line) ? COLOR.done : PALETTE.muted}>
            {line.split(ICONS).map((part, j) => (
              <Text key={j} color={TONE[part]}>{part}</Text>
            ))}
          </Text>
        ))}
      </Box>
    )
  })
}
