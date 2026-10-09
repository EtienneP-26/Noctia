import type { Register } from 'claude-code'

const WARN_AT = 80

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

/**
 * # Status line text
 * ## Args
 * - model: model id
 * - usd: cost of the session in dollars
 * - percent: share of the context window used, if known
 * ## Returns
 * A short line such as `sonnet-5-5 · ctx 42% · $0.31`.
 */
export const statusText = (model: string, usd: number | undefined, percent: number | undefined) =>
  [
    shortModel(model),
    percent === undefined ? undefined : `ctx ${Math.round(percent)}%`,
    usd === undefined ? undefined : `$${usd.toFixed(2)}`,
  ]
    .filter(Boolean)
    .join(' · ')

/**
 * # Cost and context
 * Shows the model, the context use and the cost in the status line after each turn.
 * ## Args
 * - on: the hook registrar
 */
export const registerCost: Register = on => {
  let warned = false

  on('turn.complete', async ($, e, next) => {
    const [model, usage] = await Promise.all([$.session.model(), $.session.usage()])
    const percent = usage.context.percent
    $.ui.status(statusText(model, usage.cost?.usd, percent))
    if (percent !== undefined && percent >= WARN_AT && !warned) {
      warned = true
      $.ui.toast(`Context ${Math.round(percent)}% full. Consider /compact or delegating to a subagent.`)
    }
    return next(e)
  })
}
