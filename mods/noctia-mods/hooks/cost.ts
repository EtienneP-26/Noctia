import type { Register } from 'claude-code'

import { refresh } from './noctia'
import { shortModel } from './status'

export { shortModel }

const WARN_AT = 80

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
    await refresh($)
    $.ui.status(statusText(model, usage.cost?.usd, percent))
    if (percent !== undefined && percent >= WARN_AT && !warned) {
      warned = true
      $.ui.toast(`Context ${Math.round(percent)}% full. Consider /compact or delegating to a subagent.`)
    }
    return next(e)
  })
}
