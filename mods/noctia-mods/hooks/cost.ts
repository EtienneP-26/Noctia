import type { Register } from 'claude-code'

import { refresh } from './noctia'

const WARN_AT = 80

/**
 * # Context warning
 * Refreshes the Noctia banner after each turn (model, context, cost) and
 * warns once with a toast when the context is nearly full.
 * ## Args
 * - on: the hook registrar
 */
export const registerCost: Register = on => {
  let warned = false

  on('turn.complete', async ($, e, next) => {
    await refresh($)
    const percent = (await $.session.usage()).context.percent
    if (percent !== undefined && percent >= WARN_AT && !warned) {
      warned = true
      $.ui.toast(`Context ${Math.round(percent)}% full. Consider /compact or delegating to a subagent.`)
    }
    return next(e)
  })
}
