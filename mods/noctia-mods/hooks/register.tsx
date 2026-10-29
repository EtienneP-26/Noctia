import type { Register } from 'claude-code'

import { registerCost } from './cost'
import { registerGuards } from './guards'
import { registerLabels } from './labels'
import { mentorTool, registerMentor } from './mentor'
import { noctiaCommand, refresh, registerNoctia } from './noctia'
import { registerTasks } from './tasks'
import { registerTeam, teamCommand } from './team'

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await $.command.register(teamCommand)
    await $.command.register(noctiaCommand)
    await $.tool.register(mentorTool)
    await refresh($)
    return next(e)
  })

  registerNoctia(on, options)
  registerTeam(on, options)
  registerLabels(on, options)
  registerTasks(on, options)
  registerGuards(on, options)
  registerMentor(on, options)
  registerCost(on, options)
}
