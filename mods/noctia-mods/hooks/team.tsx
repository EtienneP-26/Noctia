import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgentRun } from '../types'

const PANE = 'noctia-team'
const agents = atom({ plugin: 'noctia-mods', key: 'agents' } as const, [] as AgentRun[])

const COLORS: Record<string, string> = {
  reader: 'blue',
  architect: 'magenta',
  'security-reviewer': 'red',
}

const ICON = { running: '▶', done: '✔', error: '✘' } as const

/**
 * # Short name of an agent type
 * ## Args
 * - type: resolved subagent type, possibly prefixed by its plugin (`noctia:reader`)
 * ## Returns
 * The type without its plugin prefix.
 * ## Example
 * shortName('noctia:reader') // 'reader'
 */
export const shortName = (type: string): string => type.split(':').pop() ?? type

/**
 * # Colour of an agent type
 * ## Args
 * - type: resolved subagent type
 * ## Returns
 * A terminal colour name, grey for unknown types.
 * ## Example
 * colorOf('noctia:architect') // 'magenta'
 */
export const colorOf = (type: string): string => COLORS[shortName(type)] ?? 'gray'

/**
 * # Elapsed seconds of a run
 * ## Args
 * - run: the agent run
 * - now: current time in ms
 * ## Returns
 * Whole seconds between start and end (or now while running).
 */
export const seconds = (run: AgentRun, now: number): number =>
  Math.round(((run.endedAt ?? now) - run.startedAt) / 1000)

/**
 * # Team panel
 * Lists every subagent of the session with its status, task and duration.
 * ## Args
 * - on: the hook registrar
 */
export const registerTeam: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'team', description: 'Show which subagent does what' })
    return next(e)
  })

  on('command.run', { command: 'team' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Team' })
    return { text: 'Team panel opened.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const id = e.tool_use_id
    const finish = (status: AgentRun['status']) =>
      update($, agents, list =>
        list.map(a => (a.id === id ? { ...a, status, endedAt: Date.now() } : a)),
      )
    const run: AgentRun = {
      id,
      type: e.subagentType,
      task: e.description,
      status: 'running',
      startedAt: Date.now(),
    }
    await update($, agents, list => [...list, run].slice(-50))
    void $.ui.open({ id: PANE, title: 'Team' })
    try {
      const result = await next(e)
      await finish('done')
      return result
    } catch (err) {
      await finish('error')
      throw err
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, agents)
    const now = Date.now()
    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>No subagent yet.</Text>}
        {list.map(a => (
          <Box key={a.id} flexDirection="column">
            <Text color={colorOf(a.type)} bold>
              {ICON[a.status]} {shortName(a.type)}
            </Text>
            <Text dimColor>
              {'  '}
              {a.task} · {seconds(a, now)}s
            </Text>
          </Box>
        ))}
      </Box>
    )
  })
}
