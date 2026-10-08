import type { Register } from 'claude-code'

const PREFIX = 'Noctia:'

/**
 * # Message of a Noctia guard
 * ## Args
 * - text: the text of a tool result
 * ## Returns
 * The first sentence of the guard message, or undefined when the text does not come from a Noctia guard.
 * ## Example
 * guardMessage('Noctia: git add, commit, push and tag are locked. Ask the user.') // 'git add, commit, push and tag are locked.'
 */
export const guardMessage = (text: string | undefined): string | undefined => {
  const trimmed = text?.trim()
  if (!trimmed?.startsWith(PREFIX)) return undefined
  const body = trimmed.slice(PREFIX.length).trim()
  const end = body.search(/[.!?](\s|$)/)
  return end === -1 ? body : body.slice(0, end + 1)
}

/**
 * # Visible guards
 * Shows a toast when a Noctia guard blocks or questions a tool call.
 * ## Args
 * - on: the hook registrar
 */
export const registerGuards: Register = on => {
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    const message = guardMessage(result.text)
    if (message) $.ui.toast(`Noctia guard: ${message}`)
    return result
  })
}
