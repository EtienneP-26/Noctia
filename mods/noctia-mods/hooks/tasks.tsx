import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Todo } from '../types'
import { bar, PALETTE } from './theme'

const PANE = 'noctia-tasks'
const todos = atom({ plugin: 'noctia-mods', key: 'todos' } as const, [] as Todo[])

const ICON = { completed: '✔', in_progress: '▶', pending: '○' } as const
const COLOR = { completed: PALETTE.ok, in_progress: PALETTE.warn, pending: PALETTE.muted } as const

/**
 * # Progress of a checklist
 * ## Args
 * - list: the todos
 * ## Returns
 * The done count, the total, and a text bar such as `███░░░░░░░`.
 * ## Example
 * progress([{ status: 'completed' }, { status: 'pending' }]) // { done: 1, total: 2, bar: '█████░░░░░' }
 */
export const progress = (list: Pick<Todo, 'status'>[], width = 10) => {
  const done = list.filter(t => t.status === 'completed').length
  return { done, total: list.length, bar: bar(done, list.length, width) }
}

/**
 * # Task checklist
 * Shows the todo list of the session in a side panel, with a progress bar.
 * ## Args
 * - on: the hook registrar
 */
export const registerTasks: Register = on => {
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    await update($, todos, () => e.input.todos)
    void $.ui.open({ id: PANE, title: 'Tasks' })
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, todos)
    const { done, total, bar: gauge } = progress(list, 16)
    const percent = total === 0 ? 0 : Math.round((done / total) * 100)
    return (
      <Box flexDirection="column">
        <Box borderStyle="round" borderColor={PALETTE.accent} paddingX={1} justifyContent="space-between">
          <Text color={PALETTE.accent} bold>
            ✦ TASKS
          </Text>
          <Text>
            <Text color={PALETTE.ok}>{gauge}</Text> {done}/{total} · {percent}%
          </Text>
        </Box>
        {list.length === 0 && (
          <Box marginTop={1}>
            <Text dimColor>No task yet.</Text>
          </Box>
        )}
        <Box flexDirection="column" marginTop={1}>
          {list.map((t, i) => (
            <Text key={i} color={COLOR[t.status]} dimColor={t.status === 'completed'} bold={t.status === 'in_progress'}>
              {ICON[t.status]} {t.status === 'in_progress' ? t.activeForm : t.content}
            </Text>
          ))}
        </Box>
      </Box>
    )
  })
}
