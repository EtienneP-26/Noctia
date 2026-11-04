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
  text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x1f\x7f-\x9f]/g, '').replace(/[\p{Cf}\p{Zl}\p{Zp}]/gu, '')

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

/** A usable count: non-finite or negative values become 0. */
export const num = (n?: number): number => (Number.isFinite(n) && n! > 0 ? n! : 0)

/**
 * # Short token count
 * ## Returns
 * `850`, `52k`; empty when unknown.
 */
export const tok = (n?: number): string => {
  if (n === undefined) return ''
  const v = num(n)
  return v < 1000 ? `${v}` : `${Math.round(v / 1000)}k`
}

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
    ? nodes.reduce((a, n) => a + num(n.tokens), 0)
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
  return `✔ W${wave} · ${nodes.length} agent${nodes.length > 1 ? 's' : ''} · ${clock(Math.round(span / 1000))}${t ? ` · ${t} tok` : ''}`
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
  const centers = Array.from({ length: count }, (_, i) => off + i * (w + 1) + Math.floor(w / 2))
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

/** One line of the drawing: its text and, per character, a tone letter (r d e m a or space). */
export type Row = { text: string; tone: string }

const TONE: Record<string, string> = {
  r: COLOR.running, d: COLOR.done, e: COLOR.error, m: PALETTE.muted, a: PALETTE.accent,
}
const STATUS_TONE = { running: 'r', done: 'd', error: 'e' } as const

const kids = (nodes: GraphNode[], parent?: string): GraphNode[] =>
  nodes.filter(n => n.parent === parent)

const WIDE_RANGES = [
  [0x1100, 0x115f], [0x2e80, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe30, 0xfe6f],
  [0xff00, 0xff60], [0xffe0, 0xffe6], [0x1f300, 0x1faff], [0x20000, 0x3fffd],
]

/** Display width of one character: 0 for marks, 2 for wide and emoji, else 1. */
const cw = (ch: string): number => {
  if (/[\p{M}\p{Cf}]/u.test(ch)) return 0
  const c = ch.codePointAt(0)!
  return WIDE_RANGES.some(([a, b]) => c >= a! && c <= b!) ? 2 : 1
}

const cells = (text: string): number => Array.from(text).reduce((a, c) => a + cw(c), 0)

/** Index (in code points) of the character that covers column `col`, or -1. */
const cellIndex = (chars: string[], col: number): number => {
  let a = 0
  return chars.findIndex(c => (a += cw(c)) > col)
}

const cellAt = (text: string, col: number): string => {
  const chars = Array.from(text)
  return chars[cellIndex(chars, col)] ?? ' '
}

// the tone string holds one letter per code point of the text
const paint = (lines: string[], tone: string): Row[] =>
  lines.map(text => ({ text, tone: tone.repeat(Array.from(text).length) }))

const padRow = (r: Row, w: number): Row => {
  const n = Math.max(0, w - cells(r.text))
  return { text: r.text + ' '.repeat(n), tone: r.tone + 'm'.repeat(n) }
}

/** Replaces the character at column `i` of a row, padding it if it is shorter. */
const setAt = (r: Row, i: number, ch: string): Row => {
  const { text, tone } = padRow(r, i + 1)
  const chars = Array.from(text)
  const k = cellIndex(chars, i)
  const pad = ' '.repeat(cw(chars[k]!) - 1)
  chars[k] = ch + pad
  const tones = Array.from(tone)
  tones[k] = 'm'.repeat(1 + pad.length)
  return { text: chars.join(''), tone: tones.join('') }
}

/** Cuts or pads to exactly `size` cells; zero-width marks are dropped. */
const fit = (text: string, size: number): string => {
  const chars = Array.from(text).filter(c => cw(c) > 0)
  const long = cells(chars.join('')) > size
  let out = ''
  let w = 0
  for (const c of chars) {
    if (w + cw(c) > (long ? size - 1 : size)) break
    out += c
    w += cw(c)
  }
  return out + (long ? '…' : '') + ' '.repeat(size - w - (long ? 1 : 0))
}

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

const join = (cells: Row[][], w: number, off: number): Row[] =>
  Array.from({ length: Math.max(...cells.map(c => c.length)) }, (_, i) => {
    const parts = cells.map(c => padRow(c[i] ?? { text: '', tone: '' }, w))
    return {
      text: ' '.repeat(off) + parts.map(p => p.text).join(' '),
      tone: 'm'.repeat(off) + parts.map(p => p.tone).join('m'),
    }
  })

/** One row of boxes (3 columns apart, trunk in the middle) with the connector lines above it. */
const block = (nodes: GraphNode[], line: GraphNode[], width: number, cols: number, now: number, depth: number) => {
  const w = Math.floor(width / cols)
  const cells = line.map(n => {
    const sub = depth < 4 ? group(nodes, n.id, w, 1, now, depth + 1) : []
    return [
      ...paint(frame(boxText(n, now), w - 2, true, sub.length > 0), STATUS_TONE[n.status]).map(r => ({
        text: ` ${r.text} `,
        tone: ` ${r.tone} `,
      })),
      ...sub,
    ]
  })
  return {
    conn: paint(connector(line.length, width, cols), 'm'),
    box: join(cells, w, ((cols - line.length) * w) / 2),
  }
}

/**
 * Lines of the children of `parent`: connectors, boxes, their own children below.
 * At the top level the chief's trunk runs down the gap of every row but the last
 * (or down the left edge when a box covers the axis).
 */
const group = (nodes: GraphNode[], parent: string | undefined, width: number, cols: number, now: number, depth = 0): Row[] => {
  const blocks = rows(kids(nodes, parent), cols).map(line => block(nodes, line, width, cols, now, depth))
  const axis = width / 2
  const trunk = depth === 0 ? blocks.length - 1 : 0
  const gap = blocks.slice(0, trunk).every(b => b.box.every(r => cellAt(r.text, axis) === ' '))
  const edge = gap ? axis : 0
  return blocks.flatMap((b, k) => {
    const more = k < trunk
    const stem = b.conn[0]!
    const mid = stem.text.indexOf('│')
    const conn = b.conn.map(r => (more ? { ...r, text: r.text.replace('┴', '┼') } : r))
    if (!gap && trunk > 0) {
      const lead = k === 0 ? '┌' : more ? '├' : '└'
      const tail = k === 0 ? '┤' : '┐'
      conn[0] = paint([lead + '─'.repeat(mid - 1) + tail], 'm')[0]!
    }
    return [...conn, ...b.box.map(r => (more ? setAt(r, edge, '│') : r))]
  })
}

/**
 * # Clean tree
 * Dedupes by id (last wins), sends self or cyclic parents to the chief, and
 * hangs nodes deeper than 4 from their depth 3 ancestor.
 */
const normalize = (list: GraphNode[]): GraphNode[] => {
  const byId = new Map(list.map(n => [n.id, n]))
  return [...byId.values()].map(n => {
    const path = [n.id]
    for (let p = n.parent; p && byId.has(p); p = byId.get(p)!.parent) {
      if (path.includes(p)) return { ...n, parent: undefined }
      path.push(p)
    }
    return path.length > 5 ? { ...n, parent: path[path.length - 4] } : n
  })
}

/**
 * # Drawing of the graph with tones
 * ## Args
 * - state: every agent node
 * - width: cells available (boxes per row follow it)
 * - now: current time in ms
 * ## Returns
 * Rows of text with a tone letter per character: header, chief, linked boxes, collapsed waves.
 */
export const drawRows = (raw: GraphNode[], width: number, now = Date.now()): Row[] => {
  const state = normalize(raw)
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
  const pad = ' '.repeat((cols * w) / 2 - 7)
  const chief = paint(frame(['☾ chief'], 14, false, live.length > 0), 'a').map(r => ({
    text: pad + r.text,
    tone: 'm'.repeat(pad.length) + r.tone,
  }))
  const body = live.length ? group(live, undefined, cols * w, cols, now) : paint(['No agent yet.'], 'm')
  return [
    ...paint([header], 'a'),
    ...chief,
    ...body,
    ...paint(done.map(v => summary(v, state, now)), 'd'),
  ]
}

/**
 * # Full text of the graph
 * ## Returns
 * The lines the pane shows (see `drawRows`), without tones or trailing spaces.
 */
export const drawGraph = (state: GraphNode[], width: number, now = Date.now()): string[] =>
  drawRows(state, width, now).map(r => r.text.trimEnd())

/** Splits a row into runs of one tone, ready for Text spans. */
export const spans = (r: Row): { text: string; tone: string }[] =>
  [...r.text.trimEnd()].reduce<{ text: string; tone: string }[]>((out, ch, i) => {
    const tone = r.tone[i] ?? 'm'
    const last = out[out.length - 1]
    if (last && last.tone === tone) last.text += ch
    else out.push({ text: ch, tone })
    return out
  }, [])

/** Keeps the last 60 nodes at most, dropping the oldest finished ones first; never a running one. */
export const capNodes = (list: GraphNode[], max = 60): GraphNode[] => {
  let over = list.length - max
  return list.filter(n => !(over > 0 && n.status !== 'running' && over--))
}

/** Runs a state update; a failure is ignored. */
const safely = async (job: () => unknown): Promise<void> => {
  try {
    await job()
  } catch {
    // the hook chain must go on
  }
}

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
    await safely(() => update($, graph, list => capNodes([...list, node])))
    void safely(() => $.ui.open({ id: PANE, title: 'Noctia graph', columns: 90 }))
    return result
  })

  on('turn.complete', { agentId: /./ }, async ($, e, next) => {
    const id = e.agentId
    if (id) {
      const used = e.usage ? num(e.usage.input_tokens) + num(e.usage.output_tokens) : undefined
      const status = e.reason === 'error' || e.reason === 'refusal' ? 'error' : 'done'
      await safely(() =>
        update($, graph, list =>
          list.map(n =>
            n.id === id
              ? { ...n, status, endedAt: Date.now(), tokens: used === undefined ? n.tokens : num(n.tokens) + used }
              : n,
          ),
        ),
      )
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const width = Math.max(40, e.props?.bodyColumns ?? e.viewport?.columns ?? 60)
    const lines = drawRows(await read($, graph), width)
    return (
      <Box flexDirection="column">
        {lines.map((line, i) => (
          <Text key={i} wrap="truncate-end">
            {spans(line).map((part, j) => (
              <Text key={j} color={TONE[part.tone]}>{part.text}</Text>
            ))}
          </Text>
        ))}
      </Box>
    )
  })
}
