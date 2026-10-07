import type { Register } from 'claude-code'

import { registerLabels } from './labels'
import { registerTeam } from './team'

export const register: Register = (on, options) => {
  registerTeam(on, options)
  registerLabels(on, options)
}
