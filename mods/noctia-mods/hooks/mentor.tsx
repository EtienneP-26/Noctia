import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { MentorState, MentorStep } from '../types'

const PANE = 'noctia-mentor'
const TOOL = 'mentor_progress'
const MAX_HINTS = 3
const mentor = atom({ plugin: 'noctia-mods', key: 'mentor' } as const, {
  steps: [],
  hintLevel: 0,
} as MentorState)

const ICON = { done: '✔', doing: '▶', todo: '○' } as const
const STATUSES = ['todo', 'doing', 'done']

const isStep = (s: unknown): s is MentorStep =>
  typeof s === 'object' &&
  s !== null &&
  typeof (s as MentorStep).title === 'string' &&
  STATUSES.includes((s as MentorStep).status)

/**
 * # Parse the mentor progress
 * ## Args
 * - input: the raw input of the `mentor_progress` tool
 * ## Returns
 * The steps (invalid ones dropped) and the hint level kept between 0 and 3.
 * ## Example
 * parseProgress({ steps: [{ title: 'Parse', status: 'doing' }], hint_level: 2 })
 */
export const parseProgress = (input: unknown): MentorState => {
  const raw = (input ?? {}) as { steps?: unknown; hint_level?: unknown }
  const steps = Array.isArray(raw.steps) ? raw.steps.filter(isStep) : []
  const level = typeof raw.hint_level === 'number' ? raw.hint_level : 0
  return { steps, hintLevel: Math.min(MAX_HINTS, Math.max(0, Math.round(level))) }
}

/**
 * # Hint gauge
 * ## Args
 * - level: hints used, from 0 to 3
 * ## Returns
 * A text gauge such as `●●○`.
 */
export const hintGauge = (level: number): string =>
  '●'.repeat(level) + '○'.repeat(MAX_HINTS - level)

/** The tool the model calls in mentor mode, registered at session start. */
export const mentorTool = {
  name: TOOL,
  description:
    'Mentor mode only. Send the full list of steps with their status and the hint level used (0 to 3). Shows the progress in a side panel.',
  inputSchema: {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            status: { type: 'string', enum: STATUSES },
          },
          required: ['title', 'status'],
        },
      },
      hint_level: { type: 'number', description: '0 = no hint, 3 = last hint before the answer' },
    },
    required: ['steps'],
  },
}

/**
 * # Mentor panel
 * A tool the model calls to say where the lesson is, and a side panel that shows it.
 * ## Args
 * - on: the hook registrar
 */
export const registerMentor: Register = on => {
  on('tool.call', { tool: 'mcp__noctia-mods__mentor_progress' }, async ($, e) => {
    await update($, mentor, () => parseProgress(e.input))
    void $.ui.open({ id: PANE, title: 'Mentor' })
    return { result: { content: [{ type: 'text', text: 'Mentor panel updated.' }], isError: false } }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const { steps, hintLevel } = await read($, mentor)
    return (
      <Box flexDirection="column">
        <Text bold>Hints {hintGauge(hintLevel)}</Text>
        {steps.map(s => (
          <Text color={s.status === 'doing' ? 'yellow' : undefined} dimColor={s.status === 'done'}>
            {ICON[s.status]} {s.title}
          </Text>
        ))}
      </Box>
    )
  })
}
