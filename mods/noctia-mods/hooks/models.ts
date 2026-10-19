/** Where `/noctia:models` stores the agent choices, relative to the project root. */
export const MODELS_FILE = '.noctia/models'

/**
 * # Parse the model choices
 * ## Args
 * - text: content of `.noctia/models`, one `agent=model` per line
 * ## Returns
 * The choices by agent name. Malformed lines are dropped, the last line of an agent wins.
 * ## Example
 * parseModels('reader=haiku\ndeveloper=sonnet') // { reader: 'haiku', developer: 'sonnet' }
 */
export const parseModels = (text: string): Record<string, string> => {
  const choices: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const match = /^([a-z-]+)=([a-z]+)$/.exec(line.trim())
    if (match) choices[match[1]] = match[2]
  }
  return choices
}

/**
 * # Model chosen for an agent
 * ## Args
 * - type: resolved subagent type, possibly prefixed by its plugin (`noctia:reader`)
 * - choices: the parsed choices
 * ## Returns
 * The chosen model, or undefined when the user chose nothing for this agent.
 * ## Example
 * modelFor('noctia:reader', { reader: 'haiku' }) // 'haiku'
 */
export const modelFor = (type: string, choices: Record<string, string>): string | undefined =>
  choices[type.split(':').pop() ?? type]
