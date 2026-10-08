import type { Register } from 'claude-code'

import { registerGuards } from './guards'
import { registerLabels } from './labels'
import { registerTasks } from './tasks'
import { registerTeam } from './team'

export const register: Register = (on, options) => {
  registerTeam(on, options)
  registerLabels(on, options)
  registerTasks(on, options)
  registerGuards(on, options)
}
