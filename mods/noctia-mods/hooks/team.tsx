import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgentRun } from '../types'
import { duration, PALETTE } from './theme'

const PANE = 'noctia-team'
const agents = atom({ plugin: 'noctia-mods', key: 'agents' } as const, [] as AgentRun[])

const COLORS: Record<string, string> = {
  chief: '#fcd34d',
  orchestrator: '#e879f9',
  developer: '#86efac',
  tester: '#67e8f9',
  reader: '#93c5fd',
  documenter: '#e2e8f0',
  pentester: '#fca5a5',
}

const ICON = { running: '▶', done: '✔', error: '✘' } as const
const STATUS_COLOR = { running: PALETTE.warn, done: PALETTE.ok, error: PALETTE.bad } as const

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
 * A hex colour, grey for unknown types.
 * ## Example
 * colorOf('noctia:orchestrator') // '#e879f9'
 */
export const colorOf = (type: string): string => COLORS[shortName(type)] ?? PALETTE.muted

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

/** The slash command that reopens the team panel, registered at session start. */
export const teamCommand = { name: 'team', description: 'Show which subagent does what' }

/**
 * # Team panel
 * Lists every subagent of the session with its status, task and duration.
 * ## Args
 * - on: the hook registrar
 */
export const registerTeam: Register = on => {
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
    const count = (status: AgentRun['status']) => list.filter(a => a.status === status).length
    return (
      <Box flexDirection="column">
        <Box borderStyle="round" borderColor={PALETTE.accent} paddingX={1}>
          <Text>
            <Text color={PALETTE.accent} bold>
              ☾ TEAM{'  '}
            </Text>
            <Text color={STATUS_COLOR.running}>▶ {count('running')} running</Text>
            <Text color={STATUS_COLOR.done}>{'  '}✔ {count('done')} done</Text>
            <Text color={STATUS_COLOR.error}>{'  '}✘ {count('error')} failed</Text>
          </Text>
        </Box>
        {list.length === 0 && (
          <Box marginTop={1}>
            <Text dimColor>No subagent yet. They show up here as the chief calls them.</Text>
          </Box>
        )}
        {[...list].reverse().map(a => (
          <Box key={a.id} flexDirection="column" marginTop={1}>
            <Box justifyContent="space-between">
              <Text color={colorOf(a.type)} bold>
                ● {shortName(a.type)}
              </Text>
              <Text color={STATUS_COLOR[a.status]}>
                {ICON[a.status]} {a.status} · {duration(seconds(a, now))}
              </Text>
            </Box>
            <Text dimColor>{'  '}{a.task}</Text>
          </Box>
        ))}
      </Box>
    )
  })
}
