import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { NoctiaState } from '../types'
import { contextColor, features, parseCoauthor, parseGitMode, shortModel, STATE_DIR, TONE_COLOR } from './status'
import { bar, PALETTE } from './theme'

const PANE = 'noctia-status'
const BANNER_KEYS = ['git', 'coauthor', 'guards', 'team', 'mentor']

// The team and the mentor panels own these two; here they are only read.
const agents = { plugin: 'noctia-mods', key: 'agents' } as const
const mentor = { plugin: 'noctia-mods', key: 'mentor' } as const
const noctia = atom({ plugin: 'noctia-mods', key: 'noctia' } as const, {
  core: false,
  gitMode: 'locked',
  coauthor: 'unset',
  model: '',
  percent: null,
  usd: null,
} as NoctiaState)
const isBannerHidden = atom({ plugin: 'noctia-mods', key: 'isBannerHidden' } as const, false)

/** The slash command that opens the status pane and brings the banner back. */
export const noctiaCommand = { name: 'noctia', description: 'Show what Noctia has on or off, and how' }

function readStateFile($: EngineInterface, name: string): Promise<string | undefined> {
  return $.fs.read(`${STATE_DIR}/${name}`).catch(() => undefined)
}

const isNoctiaCommand = (c: { name: string; plugin?: string }): boolean =>
  c.plugin === 'noctia' || c.name.startsWith('noctia:')

/**
 * # Refresh the Noctia state
 * Reads the project state files, the model and the loaded commands, and stores them
 * only when something changed, so the banner does not redraw for nothing.
 * ## Args
 * - $: the engine interface
 */
export async function refresh($: EngineInterface): Promise<void> {
  const [mode, coauthor, model, commands, usage] = await Promise.all([
    readStateFile($, 'git-mode'),
    readStateFile($, 'coauthor'),
    $.session.model().catch(() => ''),
    $.command.list().catch(() => []),
    $.session.usage().catch(() => undefined),
  ])
  const next: NoctiaState = {
    core: commands.some(isNoctiaCommand),
    gitMode: parseGitMode(mode),
    coauthor: parseCoauthor(coauthor),
    model: shortModel(model),
    percent: usage?.context.percent ?? null,
    usd: usage?.cost?.usd ?? null,
  }
  const prev = await read($, noctia)
  if (JSON.stringify(prev) !== JSON.stringify(next)) await update($, noctia, () => next)
}

/**
 * # Rows to show
 * Reads the Noctia state, the team and the mentor lesson, and builds the feature rows.
 * The team and mentor values come from other files and may not exist yet, so they default to empty.
 * ## Args
 * - $: the engine interface
 * ## Returns
 * The state and its feature rows.
 */
async function currentRows($: EngineInterface) {
  const [state, runs, lesson] = await Promise.all([read($, noctia), read($, agents), read($, mentor)])
  const running = (runs ?? []).filter(a => a.status === 'running').length
  const isMentor = (lesson?.steps ?? []).length > 0
  return { state, rows: features(state, running, isMentor) }
}

/**
 * # Banner and status pane
 * A rounded band above the prompt that shows what Noctia has on or off, and a
 * `/noctia` pane that says how each part is switched.
 * ## Args
 * - on: the hook registrar
 */
export const registerNoctia: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    await refresh($)
    return next(e)
  })

  on('command.run', { command: 'noctia' }, async $ => {
    await refresh($)
    await update($, isBannerHidden, () => false)
    await $.ui.open({ id: PANE, title: 'Noctia' })
    return { text: 'Noctia status opened.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isBannerHidden))) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const { state, rows } = await currentRows($)
    const shown = rows.filter(f => BANNER_KEYS.includes(f.key))
    const percent = state.percent === null ? null : Math.round(state.percent)
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={PALETTE.accent} paddingX={1}>
        <Box justifyContent="space-between">
          <Text>
            <Text color={PALETTE.accent} bold>
              ☾ NOCTIA{state.core ? '' : ' (not installed)'}
            </Text>
            <Text dimColor>{'  '}{state.model}</Text>
          </Text>
          <Box>
            {percent !== null && (
              <Text>
                <Text dimColor>ctx </Text>
                <Text color={contextColor(percent)}>{bar(percent, 100, 10)}</Text> {percent}%{'   '}
              </Text>
            )}
            {state.usd !== null && <Text>${state.usd.toFixed(2)}{'   '}</Text>}
            <Text dimColor>/noctia </Text>
            <Button key="hide" label="Hide" onPress={() => update($, isBannerHidden, () => true)} />
          </Box>
        </Box>
        <Box flexWrap="wrap">
          {shown.map(f => (
            <Text key={f.key}>
              <Text color={TONE_COLOR[f.tone]}>● </Text>
              {f.label} <Text dimColor>{f.value}</Text>
              {'   '}
            </Text>
          ))}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const { rows } = await currentRows($)
    return (
      <Box flexDirection="column">
        <Text color={PALETTE.accent} bold>
          ☾ What Noctia has on or off
        </Text>
        <Text>
          <Text color={TONE_COLOR.ok}>● on</Text>
          <Text color={TONE_COLOR.warn}>   ● attention</Text>
          <Text color={TONE_COLOR.off}>   ● off</Text>
        </Text>
        <Box flexDirection="column" marginTop={1}>
          {rows.map(f => (
            <Box key={f.key} flexDirection="column" marginBottom={1}>
              <Text>
                <Text color={TONE_COLOR[f.tone]}>● </Text>
                <Text bold>{f.label.padEnd(10)}</Text>
                <Text color={TONE_COLOR[f.tone]}>{f.value}</Text>
              </Text>
              <Text dimColor>{'  '}{f.how}</Text>
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
