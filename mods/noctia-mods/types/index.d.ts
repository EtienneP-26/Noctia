export type AgentRun = {
  id: string
  type: string
  task: string
  status: 'running' | 'done' | 'error'
  startedAt: number
  endedAt?: number
}

declare module 'claude-code' {
  interface PluginState {
    'noctia-mods': { agents: AgentRun[] }
  }
}
