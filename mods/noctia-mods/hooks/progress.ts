import type { GraphNode } from '../types'

export type Completion = { done: number; total: number; percent: number }

/**
 * # Share of done items, rounded
 * ## Args
 * - done: finished items
 * - total: all items
 * ## Returns
 * A whole percent from 0 to 100; 0 when total is 0.
 * ## Example
 * percentOf(1, 3) // 33
 */
export const percentOf = (done: number, total: number): number =>
  total === 0 ? 0 : Math.round((done / total) * 100)

/**
 * # Completion of a set of agents
 * ## Args
 * - nodes: the agents; only `status: 'done'` counts as done
 * ## Returns
 * `{ done, total, percent }`.
 */
export const completion = (nodes: Pick<GraphNode, 'status'>[]): Completion => {
  const done = nodes.filter(n => n.status === 'done').length
  return { done, total: nodes.length, percent: percentOf(done, nodes.length) }
}

/**
 * # Completion of each wave
 * ## Args
 * - nodes: the agents of the graph
 * ## Returns
 * A map from wave number to its completion. Wave 0 (no `W<n>·T<n>` prefix) is left out.
 * ## Example
 * waveCompletion(nodes)[1] // { done: 1, total: 2, percent: 50 }
 */
export const waveCompletion = (nodes: GraphNode[]): Record<number, Completion> => {
  const waves = [...new Set(nodes.map(n => n.wave).filter(w => w > 0))]
  return Object.fromEntries(waves.map(w => [w, completion(nodes.filter(n => n.wave === w))]))
}
