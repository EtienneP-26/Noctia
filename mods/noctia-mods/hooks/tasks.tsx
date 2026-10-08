import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Todo } from '../types'

const PANE = 'noctia-tasks'
const todos = atom({ plugin: 'noctia-mods', key: 'todos' } as const, [] as Todo[])

const ICON = { completed: '✔', in_progress: '▶', pending: '○' } as const

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
  const filled = list.length === 0 ? 0 : Math.round((done / list.length) * width)
  return { done, total: list.length, bar: '█'.repeat(filled) + '░'.repeat(width - filled) }
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
    const { done, total, bar } = progress(list)
    return (
      <Box flexDirection="column">
        <Text bold>
          {bar} {done}/{total}
        </Text>
        {list.map(t => (
          <Text
            color={t.status === 'in_progress' ? 'yellow' : undefined}
            dimColor={t.status === 'completed'}
          >
            {ICON[t.status]} {t.status === 'in_progress' ? t.activeForm : t.content}
          </Text>
        ))}
      </Box>
    )
  })
}
