import type { Register } from 'claude-code'

import { registerGuards } from './guards'
import { registerLabels } from './labels'
import { mentorTool, registerMentor } from './mentor'
import { registerTasks } from './tasks'
import { registerTeam, teamCommand } from './team'

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await $.command.register(teamCommand)
    await $.tool.register(mentorTool)
    return next(e)
  })

  registerTeam(on, options)
  registerLabels(on, options)
  registerTasks(on, options)
  registerGuards(on, options)
  registerMentor(on, options)
}
