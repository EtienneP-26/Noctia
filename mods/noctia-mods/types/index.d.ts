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

export type MentorStep = { title: string; status: 'todo' | 'doing' | 'done' }

export type MentorState = { steps: MentorStep[]; hintLevel: number }

export type NoctiaState = {
  core: boolean
  gitMode: 'locked' | 'ask' | 'auto'
  coauthor: 'yes' | 'no' | 'unset'
  model: string
}

declare module 'claude-code' {
  interface PluginState {
    'noctia-mods': {
      agents: AgentRun[]
      todos: Todo[]
      mentor: MentorState
      noctia: NoctiaState
      isBannerHidden: boolean
    }
  }
}
