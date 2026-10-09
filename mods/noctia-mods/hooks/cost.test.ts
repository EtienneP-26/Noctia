import { describe, expect, test } from 'claude-code/testing'

import { shortModel, statusText } from './cost'

describe('cost line', () => {
  test('shortens model ids', () => {
    expect(shortModel('claude-sonnet-5-5')).toBe('sonnet-5-5')
    expect(shortModel('claude-haiku-4-5-20251001')).toBe('haiku-4-5')
  })

  test('joins the known parts', () => {
    expect(statusText('claude-sonnet-5-5', 0.314, 42.4)).toBe('sonnet-5-5 · ctx 42% · $0.31')
  })

  test('skips what is unknown', () => {
    expect(statusText('claude-sonnet-5-5', undefined, undefined)).toBe('sonnet-5-5')
  })
})
