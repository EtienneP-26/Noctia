import { describe, expect, test } from 'claude-code/testing'

import { bar, duration } from './theme'

describe('theme helpers', () => {
  test('bar fills in proportion and is empty for zero total', () => {
    expect(bar(1, 2, 10)).toBe('█████░░░░░')
    expect(bar(0, 0, 4)).toBe('░░░░')
    expect(bar(4, 4, 4)).toBe('████')
  })

  test('duration switches to minutes after 60 seconds', () => {
    expect(duration(42)).toBe('42s')
    expect(duration(185)).toBe('3m05s')
  })
})
