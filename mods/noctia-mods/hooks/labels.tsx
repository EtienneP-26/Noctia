import type { Register } from 'claude-code'

import { colorOf, shortName } from './team'

/**
 * # Agent type of a tool row
 * ## Args
 * - tool: name of the tool the row draws
 * - input: the tool's input as the row received it
 * ## Returns
 * The subagent type when the row launches a subagent, otherwise undefined.
 * ## Example
 * agentTypeOf('Agent', { subagent_type: 'noctia:reader' }) // 'noctia:reader'
 */
export const agentTypeOf = (tool: string, input: unknown): string | undefined => {
  if (tool !== 'Agent') return undefined
  const type = (input as { subagent_type?: string } | null)?.subagent_type
  return type ?? 'general-purpose'
}

/**
 * # Agent labels
 * Puts a coloured tag in front of every chat row that launches a subagent,
 * with the same colours as the team panel.
 * ## Args
 * - on: the hook registrar
 */
export const registerLabels: Register = on => {
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const type = agentTypeOf(e.props.tool, e.props.input)
    const inner = await next(e)
    if (!type) return inner
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text color={colorOf(type)} bold>
          [{shortName(type)}]{' '}
        </Text>
        {inner}
      </Box>
    )
  })
}
