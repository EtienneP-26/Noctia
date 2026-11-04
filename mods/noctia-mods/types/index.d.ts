export type AgentRun = {
  id: string
  type: string
  task: string
  status: 'running' | 'done' | 'error'
  startedAt: number
  endedAt?: number
}

export type GraphNode = {
  id: string
  parent?: string
  type?: string
  wave: number
  label: string
  task: string
  model: string
  status: 'running' | 'done' | 'error'
  startedAt: number
  endedAt?: number
  tokens?: number
}

export type Todo = {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm: string
}

export type MentorStep = { title: string; status: 'todo' | 'doing' | 'done' }

export type MentorState = { steps: MentorStep[]; hintLevel: number }

export type NoctiaState = {
  core: boolean
  gitMode: 'locked' | 'ask' | 'auto'
  coauthor: 'yes' | 'no' | 'unset'
  model: string
  percent: number | null
  usd: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'noctia-mods': {
      agents: AgentRun[]
      graph: GraphNode[]
      todos: Todo[]
      mentor: MentorState
      noctia: NoctiaState
      isBannerHidden: boolean
    }
  }
}
