import type { NoctiaState } from '../types'
import { PALETTE } from './theme'

export type Tone = 'ok' | 'warn' | 'off'

export type Feature = {
  key: string
  label: string
  tone: Tone
  value: string
  how: string
}

export const TONE_COLOR: Record<Tone, string> = {
  ok: PALETTE.ok,
  warn: PALETTE.warn,
  off: PALETTE.muted,
}

/**
 * # Short model name
 * ## Args
 * - id: a model id such as `claude-sonnet-5-5` or `claude-haiku-4-5-20251001`
 * ## Returns
 * The id without the `claude-` prefix and without a trailing date.
 * ## Example
 * shortModel('claude-haiku-4-5-20251001') // 'haiku-4-5'
 */
export const shortModel = (id: string): string =>
  id.replace(/^claude-/, '').replace(/-\d{8}$/, '')

/** Folder of the per-project Noctia state, read here and never written. */
export const STATE_DIR = '.noctia'

/**
 * # Git mode from its state file
 * ## Args
 * - text: content of the git mode file, undefined when it is missing
 * ## Returns
 * `ask`, `auto`, or `locked` (the default for anything else).
 * ## Example
 * parseGitMode('auto\n') // 'auto'
 */
export const parseGitMode = (text: string | undefined): NoctiaState['gitMode'] => {
  const mode = text?.trim()
  return mode === 'ask' || mode === 'auto' ? mode : 'locked'
}

/**
 * # Co-author answer from its state file
 * ## Args
 * - text: content of the co-author file, undefined when it is missing
 * ## Returns
 * `yes`, `no`, or `unset` when the user was not asked yet.
 * ## Example
 * parseCoauthor('yes') // 'yes'
 */
export const parseCoauthor = (text: string | undefined): NoctiaState['coauthor'] => {
  const answer = text?.trim()
  return answer === 'yes' || answer === 'no' ? answer : 'unset'
}

const GIT_HOW: Record<NoctiaState['gitMode'], string> = {
  locked: 'add, commit, push and tag are blocked. Unlock: /noctia:git ask or /noctia:git auto',
  ask: 'You approve every git command. Lock again: /noctia:git locked',
  auto: 'Git runs without a prompt, push still asks. Lock again: /noctia:git locked',
}

/**
 * # What Noctia has on or off
 * ## Args
 * - state: what the project files say
 * - running: subagents running now
 * - isMentor: whether a mentor lesson is in progress
 * ## Returns
 * One row per feature: label, tone (ok / warn / off), current value, and how it is switched.
 * ## Example
 * features({ core: true, gitMode: 'locked', coauthor: 'unset', model: 'opus-5-5' }, 0, false)[0].tone // 'ok'
 */
export const features = (state: NoctiaState, running: number, isMentor: boolean): Feature[] => [
  {
    key: 'core',
    label: 'Noctia',
    tone: state.core ? 'ok' : 'off',
    value: state.core ? 'active' : 'not installed',
    how: state.core ? 'Rules and guards load at session start.' : 'Install the noctia plugin (see the README).',
  },
  {
    key: 'git',
    label: 'Git',
    tone: state.gitMode === 'locked' ? 'ok' : 'warn',
    value: state.gitMode,
    how: GIT_HOW[state.gitMode],
  },
  {
    key: 'coauthor',
    label: 'Co-author',
    tone: state.coauthor === 'yes' ? 'ok' : 'off',
    value: state.coauthor === 'unset' ? 'not asked' : state.coauthor,
    how: 'Asked once, at the first commit. Stored in the project state folder.',
  },
  {
    key: 'guards',
    label: 'Guards',
    tone: state.core ? 'ok' : 'off',
    value: state.core ? 'secrets + git' : 'off',
    how: 'Block hard-coded secrets and unlocked git commands.',
  },
  {
    key: 'model',
    label: 'Model',
    tone: 'ok',
    value: state.model,
    how: 'The chief runs on Opus (plugin settings.json). Change it with /model.',
  },
  {
    key: 'team',
    label: 'Team',
    tone: running > 0 ? 'ok' : 'off',
    value: running > 0 ? `${running} running` : 'idle',
    how: '/team shows who does what. /noctia:build <idea> runs the whole team.',
  },
  {
    key: 'mentor',
    label: 'Mentor',
    tone: isMentor ? 'ok' : 'off',
    value: isMentor ? 'on' : 'off',
    how: 'Start with /noctia:help-me-build-it <topic>: you write the code, Claude guides.',
  },
]
