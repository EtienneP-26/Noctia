import { describe, expect, test } from 'claude-code/testing'

import { agentTypeOf } from './labels'

describe('agent labels', () => {
  test('only the Agent tool gets a label', () => {
    expect(agentTypeOf('Bash', { command: 'ls' })).toBeUndefined()
    expect(agentTypeOf('Agent', { subagent_type: 'noctia:reader' })).toBe('noctia:reader')
  })

  test('an Agent call without a type is a general-purpose agent', () => {
    expect(agentTypeOf('Agent', {})).toBe('general-purpose')
    expect(agentTypeOf('Agent', null)).toBe('general-purpose')
  })
})
