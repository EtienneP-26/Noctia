import { describe, expect, test } from 'claude-code/testing'

import { progress } from './tasks'

describe('task progress', () => {
  test('an empty list is 0/0 with an empty bar', () => {
    expect(progress([])).toEqual({ done: 0, total: 0, bar: '░░░░░░░░░░' })
  })

  test('only completed todos count as done', () => {
    const list = [
      { status: 'completed' as const },
      { status: 'in_progress' as const },
      { status: 'pending' as const },
      { status: 'completed' as const },
    ]
    expect(progress(list).done).toBe(2)
    expect(progress(list).total).toBe(4)
    expect(progress(list).bar).toBe('█████░░░░░')
  })
})
