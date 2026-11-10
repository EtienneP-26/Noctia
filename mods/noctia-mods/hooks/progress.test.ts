import { describe, expect, test } from 'claude-code/testing'

import type { GraphNode } from '../types'
import { completion, percentOf, waveCompletion } from './progress'

const node = (o: Partial<GraphNode>): GraphNode => ({
  id: 'a', wave: 1, label: '', task: 't', model: 'm', status: 'done', startedAt: 0, endedAt: 1000, ...o,
})

describe('progress', () => {
  test('an empty list is 0 of 0 at 0%', () => {
    expect(completion([])).toEqual({ done: 0, total: 0, percent: 0 })
    expect(waveCompletion([])).toEqual({})
    expect(percentOf(0, 0)).toBe(0)
  })

  test('a partial wave counts only done agents', () => {
    const nodes = [
      node({ id: 'a', status: 'done' }),
      node({ id: 'b', status: 'running', endedAt: undefined }),
      node({ id: 'c', status: 'error' }),
    ]
    expect(completion(nodes)).toEqual({ done: 1, total: 3, percent: 33 })
  })

  test('all done is 100%', () => {
    expect(completion([node({}), node({ id: 'b' })])).toEqual({ done: 2, total: 2, percent: 100 })
  })

  test('each wave has its own completion', () => {
    const nodes = [
      node({ id: 'a', wave: 1, status: 'done' }),
      node({ id: 'b', wave: 1, status: 'running', endedAt: undefined }),
      node({ id: 'c', wave: 2, status: 'done' }),
      node({ id: 'd', wave: 2, status: 'done' }),
      node({ id: 'e', wave: 3, status: 'running', endedAt: undefined }),
    ]
    expect(waveCompletion(nodes)).toEqual({
      1: { done: 1, total: 2, percent: 50 },
      2: { done: 2, total: 2, percent: 100 },
      3: { done: 0, total: 1, percent: 0 },
    })
    expect(completion(nodes)).toEqual({ done: 3, total: 5, percent: 60 })
  })

  test('wave 0 (no prefix) is left out of the waves', () => {
    expect(waveCompletion([node({ wave: 0 })])).toEqual({})
  })
})
