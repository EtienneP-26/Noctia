export type AgentRun = {
  id: string
  type: string
  task: string
  status: 'running' | 'done' | 'error'
  startedAt: number
  endedAt?: number
}

export type Todo = {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm: string
}

declare module 'claude-code' {
  interface PluginState {
    'noctia-mods': { agents: AgentRun[]; todos: Todo[] }
  }
}
