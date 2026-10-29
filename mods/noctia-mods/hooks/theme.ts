/** The Noctia palette: soft colours that read on dark and light terminals. */
export const PALETTE = {
  accent: '#a78bfa',
  ok: '#86efac',
  warn: '#fcd34d',
  bad: '#fca5a5',
  info: '#67e8f9',
  muted: '#94a3b8',
} as const

/**
 * # Progress bar
 * ## Args
 * - done: finished items
 * - total: all items
 * - width: number of cells
 * ## Returns
 * A text bar such as `███░░░░░░░`; empty when total is 0.
 * ## Example
 * bar(1, 2, 10) // '█████░░░░░'
 */
export const bar = (done: number, total: number, width = 10): string => {
  const filled = total === 0 ? 0 : Math.round((done / total) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

/**
 * # Short duration
 * ## Args
 * - seconds: a number of seconds
 * ## Returns
 * `42s` under a minute, `3m05s` above.
 * ## Example
 * duration(185) // '3m05s'
 */
export const duration = (seconds: number): string =>
  seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`
