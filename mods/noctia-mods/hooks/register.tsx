import type { Register } from 'claude-code'

import { registerTeam } from './team'

export const register: Register = (on, options) => {
  registerTeam(on, options)
}
