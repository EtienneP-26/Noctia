import { describe, expect, test } from 'claude-code/testing'

import { contextColor, features, parseCoauthor, parseGitMode, shortModel } from './status'
import { PALETTE } from './theme'

const state = {
  core: true,
  gitMode: 'locked' as const,
  coauthor: 'unset' as const,
  model: 'opus-5-5',
  percent: null,
  usd: null,
}

describe('noctia status', () => {
  test('git mode falls back to locked', () => {
    expect(parseGitMode(undefined)).toBe('locked')
    expect(parseGitMode('weird')).toBe('locked')
    expect(parseGitMode('auto\n')).toBe('auto')
    expect(parseGitMode(' ask ')).toBe('ask')
  })

  test('co-author is unset until answered', () => {
    expect(parseCoauthor(undefined)).toBe('unset')
    expect(parseCoauthor('yes')).toBe('yes')
    expect(parseCoauthor('no\n')).toBe('no')
  })

  test('locked git is ok, an unlocked one asks for attention', () => {
    const tone = (git: 'locked' | 'ask' | 'auto') =>
      features({ ...state, gitMode: git }, 0, false).find(f => f.key === 'git')?.tone
    expect(tone('locked')).toBe('ok')
    expect(tone('ask')).toBe('warn')
    expect(tone('auto')).toBe('warn')
  })

  test('without the core plugin the rules and guards are off', () => {
    const rows = features({ ...state, core: false }, 0, false)
    expect(rows.find(f => f.key === 'core')?.tone).toBe('off')
    expect(rows.find(f => f.key === 'guards')?.tone).toBe('off')
  })

  test('team and mentor follow what runs', () => {
    const rows = features(state, 2, true)
    expect(rows.find(f => f.key === 'team')?.value).toBe('2 running')
    expect(rows.find(f => f.key === 'mentor')?.tone).toBe('ok')
  })

  test('shortens model ids', () => {
    expect(shortModel('claude-sonnet-5-5')).toBe('sonnet-5-5')
    expect(shortModel('claude-haiku-4-5-20251001')).toBe('haiku-4-5')
  })

  test('the context gauge turns yellow at 60 and red at 80', () => {
    expect(contextColor(null)).toBe(PALETTE.muted)
    expect(contextColor(10)).toBe(PALETTE.ok)
    expect(contextColor(60)).toBe(PALETTE.warn)
    expect(contextColor(80)).toBe(PALETTE.bad)
  })
})
