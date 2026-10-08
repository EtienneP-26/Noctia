import { describe, expect, test } from 'claude-code/testing'

import { hintGauge, parseProgress } from './mentor'

describe('mentor progress', () => {
  test('keeps valid steps and drops invalid ones', () => {
    const input = {
      steps: [
        { title: 'Parse', status: 'done' },
        { title: 'Bad', status: 'weird' },
        'nope',
      ],
    }
    expect(parseProgress(input).steps).toEqual([{ title: 'Parse', status: 'done' }])
  })

  test('keeps the hint level between 0 and 3', () => {
    expect(parseProgress({ steps: [], hint_level: 9 }).hintLevel).toBe(3)
    expect(parseProgress({ steps: [], hint_level: -2 }).hintLevel).toBe(0)
    expect(parseProgress(null).hintLevel).toBe(0)
  })

  test('draws the hint gauge', () => {
    expect(hintGauge(0)).toBe('○○○')
    expect(hintGauge(2)).toBe('●●○')
  })
})
