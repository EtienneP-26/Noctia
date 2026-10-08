import { describe, expect, test } from 'claude-code/testing'

import { guardMessage } from './guards'

describe('guard messages', () => {
  test('keeps the first sentence of a Noctia message', () => {
    const text = 'Noctia: git add, commit, push and tag are locked. Do not retry.'
    expect(guardMessage(text)).toBe('git add, commit, push and tag are locked.')
  })

  test('ignores text that does not come from Noctia', () => {
    expect(guardMessage('Permission denied.')).toBeUndefined()
    expect(guardMessage(undefined)).toBeUndefined()
  })

  test('keeps a message that has no final dot', () => {
    expect(guardMessage('Noctia: locked')).toBe('locked')
  })
})
