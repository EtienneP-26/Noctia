import { describe, expect, test } from 'claude-code/testing'

import { modelFor, parseModels } from './models'

describe('model choices', () => {
  test('parseModels reads one agent=model per line', () => {
    expect(parseModels('reader=haiku\ndeveloper=sonnet\n')).toEqual({
      reader: 'haiku',
      developer: 'sonnet',
    })
  })

  test('parseModels drops malformed lines and lets the last line win', () => {
    expect(parseModels('reader\n=opus\nreader=haiku\nreader=sonnet\n# note')).toEqual({
      reader: 'sonnet',
    })
    expect(parseModels('')).toEqual({})
  })

  test('modelFor finds the choice of a prefixed agent type', () => {
    expect(modelFor('noctia:reader', { reader: 'haiku' })).toBe('haiku')
  })

  test('modelFor returns nothing for an agent without a choice', () => {
    expect(modelFor('Explore', { reader: 'haiku' })).toBeUndefined()
  })
})
