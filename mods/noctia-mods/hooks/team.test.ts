import { describe, expect, test } from 'claude-code/testing'

import { colorOf, seconds, shortName } from './team'

describe('team helpers', () => {
  test('shortName drops the plugin prefix', () => {
    expect(shortName('noctia:reader')).toBe('reader')
    expect(shortName('Explore')).toBe('Explore')
  })

  test('colorOf maps known agents and greys the rest', () => {
    expect(colorOf('noctia:reader')).toBe('blue')
    expect(colorOf('noctia:architect')).toBe('magenta')
    expect(colorOf('noctia:security-reviewer')).toBe('red')
    expect(colorOf('Explore')).toBe('gray')
  })

  test('seconds uses now while running and endedAt once done', () => {
    const run = { id: 'a', type: 'x', task: 't', status: 'running' as const, startedAt: 1000 }
    expect(seconds(run, 4000)).toBe(3)
    expect(seconds({ ...run, status: 'done', endedAt: 2000 }, 9000)).toBe(1)
  })
})
