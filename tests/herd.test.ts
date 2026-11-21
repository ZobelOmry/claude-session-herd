import { expect, mock, test } from 'claude-code/testing'

import { cleanName, fit, firstSentence, isDifferentName, isRecapDue, parseRecapReply, shouldAskRename, itermGuid, ghosttyTty, lastAwaySummary, needsYou, newestRecap, shortModel, paneLayout, lastTitle, age, paneRows, summary, duration, filledCells, headline, liveOthers, planOf, sessionsLine } from '../hooks/register'

const PROPS = { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { bodyRows: 20, offset: 0 }, view: {} } as never
const BAND = { plugin: 'herd', component: 'AbovePrompt', props: PROPS } as const

test('the dog draws above the prompt on terminal and desktop', async ($, on) => {
  mock.clock(on, { now: 1_800_000_000_000 })
  mock.store(on)
  for (const [surface, type] of [['terminal', 'Raster'], ['desktop', 'Svg']] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Ready for your next prompt' })).toBeDefined()
    expect(await ui.find({ key: 'compact' })).toBeDefined()
    await ui.unmount()
  }
})

test('/pet hides and shows the dog', async ($, on) => {
  mock.clock(on, { now: 1 })
  mock.store(on)
  on('ui.render', ($, e) => h($.ui.resolve(e).Text, null, 'engine band') as never) // the engine's own band, beneath the mod
  expect((await $.command.run({ command: 'pet' } as never))?.text).toBe('The collie went for a walk.')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'engine band' })).toBeDefined()
  await ui.unmount()
})

test('a permission request shows "needs you" until the tool runs', async ($, on) => {
  mock.clock(on, { now: 1 })
  mock.store(on)
  // the settings hooks that sit beneath the mods in a session
  on('classic.PermissionRequest', () => ({}) as never)
  on('tool.call', () => ({ result: 'ok' }) as never)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'ls' } } as never)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'Waiting for your answer' })).toBeDefined()
  expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('a pixel collie, waiting')
  await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  expect(await ui.find({ type: 'Text', text: 'Waiting for your answer' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'Ready for your next prompt' })).toBeDefined()
  await ui.unmount()
})

test('a failed tool makes the dog sad for a moment', async ($, on) => {
  mock.clock(on, { now: 1 })
  mock.store(on)
  on('classic.PostToolUseFailure', () => ({}) as never)
  await $.classic.PostToolUseFailure({ tool_name: 'Bash', tool_input: {}, error: 'boom', tool_use_id: 't2' } as never)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('a pixel collie, sad')
  await ui.unmount()
})

test('the plan counts done tasks and names the current one', () => {
  const plan = planOf({
    a: { subject: 'Reading the API', status: 'completed' },
    b: { subject: 'Writing the band', status: 'in_progress' },
    c: { subject: 'Testing', status: 'pending' },
  })
  expect(plan).toEqual({ done: 1, total: 3, current: 'Writing the band' })
  expect(planOf({})).toEqual({ done: 0, total: 0, current: null })
})

test('the board drops self, ended and stale sessions, blocked first', () => {
  const now = 100_000
  const snap = (id: string, state: 'waiting' | 'working' | 'ready', age = 0, isEnded = false) =>
    ({ id, name: id, state, task: null, updatedAt: now - age, isEnded })
  const shown = liveOthers(
    [snap('me', 'waiting'), snap('b', 'ready'), snap('c', 'working'), snap('d', 'waiting'), snap('old', 'waiting', 60_000), snap('gone', 'waiting', 0, true)],
    'me',
    now,
  )
  expect(shown.map(s => s.id)).toEqual(['d', 'c', 'b'])
})

test('the plan follows TaskCreate and TaskUpdate, and a refused update changes nothing', async ($, on) => {
  mock.clock(on, { now: 1 })
  mock.store(on)
  let next = 0
  on('tool.call', (_$, e) =>
    (e.tool === 'TaskCreate'
      ? { result: { task: { id: String(++next), subject: (e as { subject: string }).subject } } }
      : { result: { success: (e as { taskId: string }).taskId !== '99', taskId: (e as { taskId: string }).taskId, updatedFields: ['status'] } }) as never,
  )
  await $.tool.call({ tool: 'TaskCreate', subject: 'Read the API', description: '' } as never)
  await $.tool.call({ tool: 'TaskCreate', subject: 'Write the band', description: '' } as never)
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' } as never)
  await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'in_progress' } as never)
  await $.tool.call({ tool: 'TaskUpdate', taskId: '99', status: 'completed' } as never)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /1 of 2/ })).toBeDefined()
  await ui.unmount()
})

test('answering No in the dialog ends "needs you" even without PostToolUse', async ($, on) => {
  mock.clock(on, { now: 1 })
  mock.store(on)
  on('classic.PermissionRequest', () => ({}) as never)
  on('tool.call', () => ({ deny: 'The user said no.' }) as never)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: {} } as never)
  await $.tool.call({ tool: 'Bash', command: 'rm -rf build' } as never)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'Waiting for your answer' })).toBeUndefined()
  await ui.unmount()
})

test('the headline puts what needs you first', () => {
  const happy = { kind: 'happy' as const, until: 9, durationMs: 72_000 }
  expect(headline(true, happy, true, 'Task').text).toBe('Waiting for your answer')
  expect(headline(false, happy, true, 'Task').text).toBe('Done in 1m 12s')
  expect(headline(false, null, true, 'Writing the band').text).toBe('Writing the band')
  expect(headline(false, null, true, null).text).toBe('Working')
  expect(headline(false, null, false, null).text).toBe('Ready for your next prompt')
  expect(duration(42_000)).toBe('42s')
})

test('gauges clamp, sessions name only the ones that wait', () => {
  expect(filledCells(50, 8)).toBe(4)
  expect(filledCells(140, 8)).toBe(8)
  const snap = (name: string, state: 'waiting' | 'working' | 'ready') => ({ id: name, name, state, task: null, updatedAt: 0 })
  expect(sessionsLine([snap('api', 'waiting'), snap('docs', 'working'), snap('web', 'ready')])).toEqual({
    waiting: ['api'],
    rest: 'also 1 working, 1 idle',
  })
  expect(sessionsLine([snap('docs', 'working'), snap('web', 'working')])).toEqual({ waiting: [], rest: 'other sessions: 2 working' })
  expect(sessionsLine([])).toEqual({ waiting: [], rest: null })
  expect(sessionsLine([snap('web', 'ready')])).toEqual({ waiting: [], rest: null })
})

test('/pet-demo walks through every mood and then stops', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.store(on)
  await $.command.run({ command: 'pet-demo' } as never)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'Idle: sits, blinks, pants now and then' })).toBeDefined()
  const seen: unknown[] = []
  for (let i = 0; i < 5; i++) {
    seen.push((await ui.find({ type: 'Svg' }))?.props.alt)
    await clock.advance(3000)
  }
  expect(seen).toEqual(['idle', 'working', 'happy', 'sad', 'waiting'].map(m => `a pixel collie, ${m}`))
  expect(await ui.find({ type: 'Text', text: 'Ready for your next prompt' })).toBeDefined()
  await ui.unmount()
})

test('the panel lists every session, the longest wait first, and tells same names apart', () => {
  const snap = (id: string, name: string, state: 'waiting' | 'working' | 'ready', since: number, extra = {}) =>
    ({ id, name, state, task: null, updatedAt: 0, since, ...extra })
  const self = snap('self1234', 'influencer-ai-platform', 'working', 0, { task: 'Writing the panel' })
  const rows = paneRows(
    self,
    [snap('aaaa1111', 'docs', 'ready', 0), snap('bbbb2222', 'api', 'waiting', 50_000, { waitingFor: 'Bash' }), snap('cccc3333', 'api', 'waiting', 10_000)],
    250_000,
  )
  expect(rows.map(r => r.label)).toEqual(['api #cccc', 'api #bbbb', 'influencer-ai-platform', 'docs'])
  expect(rows[1]).toMatchObject({ detail: 'Needs your answer for Bash', age: '3m', isSelf: false })
  expect(rows[2]).toMatchObject({ detail: 'Writing the panel', isSelf: true })
  expect(rows[3]!.detail).toBe('Ready for a prompt')
  expect(age(30_000)).toBe('just now')
  expect(age(3_900_000)).toBe('1h 5m')
  expect(summary([self, snap('d', 'docs', 'ready', 0)])).toBe('1 working, 1 idle')
})

test('the panel says how many need you, and Minimize keeps only those', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.store(on)
  on('classic.PermissionRequest', () => ({}) as never)
  // the session facts a snapshot reads, answered beneath the mod
  on('session.id', () => ({ value: 'self1234' }) as never)
  on('session.cwd', () => ({ value: '/work/influencer-ai-platform' }) as never)
  on('env.get', () => ({ value: '/home/test' }) as never)
  on('fs.write', () => ({ value: undefined }) as never)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: {} } as never)
  const PANE = { plugin: 'herd', component: 'Pane', requestId: 'sessions', props: { title: 'Sessions', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { bodyRows: 30, offset: 0 }, view: {} } as never } as const
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '1 needs you' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Needs your answer for Bash/ })).toBeDefined()
  await ui.press({ key: 'size' })
  expect(await ui.find({ type: 'Text', text: /Needs your answer for Bash/ })).toBeDefined()
  expect((await ui.find({ key: 'size' }))?.props.label).toBe('Expand')
  await ui.unmount()
})

test('the label is the tab title, the newest one, with the folder as the fallback', () => {
  expect(lastTitle('"aiTitle":"Pixel pet"\n"aiTitle":"Claude Code pixel pet mod"\n')).toBe('Claude Code pixel pet mod')
  expect(lastTitle('')).toBeNull()
  expect(lastTitle('"aiTitle":"broken')).toBeNull()
  const snap = (id: string, title: string | null) => ({ id, name: 'influencer-ai-platform', title, state: 'ready' as const, task: null, updatedAt: 0, since: 0 })
  expect(paneRows(null, [snap('aaaa1', 'TT students'), snap('bbbb2', null), snap('cccc3', null)], 0).map(r => r.label)).toEqual([
    'TT students',
    'influencer-ai-platform #bbbb',
    'influencer-ai-platform #cccc',
  ])
})

test('a click on a row brings the session iTerm tab to the front', async ($, on) => {
  const GUID = '0F1E2D3C-4B5A-6978-8796-A5B4C3D2E1F0'
  expect(itermGuid(`w0t0p0:${GUID}`)).toBe(GUID)
  expect(itermGuid('w0t0p0:"; do shell script "rm')).toBeNull()
  expect(itermGuid(undefined)).toBeNull()

  mock.clock(on, { now: 0 })
  mock.store(on)
  on('classic.PermissionRequest', () => ({}) as never)
  on('session.id', () => ({ value: 'self1234' }) as never)
  on('session.cwd', () => ({ value: '/work/influencer-ai-platform' }) as never)
  on('env.get', (_$, e) => ({ value: (e as { name: string }).name === 'ITERM_SESSION_ID' ? `w0t0p0:${GUID}` : '/home/test' }) as never)
  on('fs.write', () => ({ value: undefined }) as never)
  const runs: (readonly string[])[] = []
  on('process.run', (_$, e) => {
    runs.push((e as { argv: readonly string[] }).argv)
    return { value: { stdout: 'ok\n', stderr: '', exitCode: 0 } } as never
  })
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: {} } as never)
  const PANE = { plugin: 'herd', component: 'Pane', requestId: 'sessions', props: { title: 'Sessions', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { bodyRows: 30, offset: 0 }, view: {} } as never } as const
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'go2:self1234' })
  const run = runs.find(argv => argv[0] === 'osascript')
  expect(run?.at(-1)).toBe(GUID)
  await ui.unmount()
})

test('the pane status fits its width: beside the dog from 40 columns, under it below', () => {
  const narrow = paneLayout(30, true)
  expect(narrow).toMatchObject({ isStacked: true, isShortLabels: false })
  expect(narrow.labelWidth + 1 + narrow.meterCells + 5).toBeLessThanOrEqual(30)
  const mid = paneLayout(45, true)
  expect(mid).toMatchObject({ isStacked: false, isShortLabels: false, isCompactInline: false })
  expect(paneLayout(44, true).isShortLabels).toBe(true) // 29 columns beside the dog: ctx / 5h
  expect(15 + mid.labelWidth + 1 + mid.meterCells + 5).toBeLessThanOrEqual(45)
  const wide = paneLayout(70, true)
  expect(wide).toMatchObject({ isStacked: false, isShortLabels: false, meterCells: 16, isCompactInline: true })
  expect(paneLayout(30, false).isStacked).toBe(false) // no dog, nothing to stack under
  for (const cols of [24, 30, 39, 40, 44, 52, 60, 80, 120]) {
    const l = paneLayout(cols, true)
    const side = l.isStacked ? cols : cols - 15
    expect(l.labelWidth + 1 + l.meterCells + 5 + (l.isCompactInline ? 9 : 0)).toBeLessThanOrEqual(Math.max(side, 4 + 3 + 6))
  }
})

test('the pane holds the dog, its status and every session; the band then steps aside', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.store(on)
  on('session.id', () => ({ value: 'self1234' }) as never)
  on('session.cwd', () => ({ value: '/work/influencer-ai-platform' }) as never)
  on('env.get', () => ({ value: '/home/test' }) as never)
  on('fs.write', () => ({ value: undefined }) as never)
  on('classic.PermissionRequest', () => ({}) as never)
  let isPaneShown = false
  on('ui.panes', () => ({ value: isPaneShown ? [{ id: 'sessions', title: 'Sessions', isShown: true, isFocused: false, isPlaced: true }] : [] }) as never)
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: {} } as never)
  for (const bodyColumns of [30, 60]) {
    const PANE = { plugin: 'herd', component: 'Pane', requestId: 'sessions', props: { title: 'Sessions', isFocused: false, bodyColumns, placement: 'dock', scroll: { bodyRows: 30, offset: 0 }, view: {} } as never } as const
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect((await ui.find({ key: 'pet' }))?.props.rows).toBe(bodyColumns >= 42 ? 8 : 4) // sitting dog with room, head without
    expect(await ui.find({ type: 'Text', text: 'Waiting for your answer' })).toBeDefined()
    expect(await ui.find({ key: 'compact' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '1 needs you' })).toBeDefined()
    await ui.unmount()
  }
  const bandProps = { plugin: 'herd', component: 'AbovePrompt', surface: 'terminal', props: { isWorking: false, bodyColumns: 100, hasSurvey: false } as never } as const
  const alone = await $.ui.mount(bandProps)
  expect(await alone.find({ key: 'pet' })).toBeDefined() // no pane on screen: the band keeps the dog
  await alone.unmount()
  isPaneShown = true
  const band = await $.ui.mount(bandProps)
  expect(await band.find({ key: 'pet' })).toBeUndefined()
  await band.unmount()
})

test('a row never wraps: its text is cut to the pane width', () => {
  expect(fit('Edikted Claude session switching script', 19)).toBe('Edikted Claude ses…')
  expect(fit('Edikted Claude ses…', 19)).toHaveLength(19)
  expect(fit('short', 19)).toBe('short')
  expect(fit('anything', 0)).toBe('…')
})

test('recaps: Claude Code’s own is read from the transcript, the newest wins, one per 5 minutes', () => {
  const row = JSON.stringify({ type: 'system', subtype: 'away_summary', content: 'We are building herd. Next, tests. (disable recaps in /config)', timestamp: '2026-10-20T07:14:37.317Z' })
  const away = lastAwaySummary(`${JSON.stringify({ subtype: 'away_summary', content: 'old', timestamp: '2026-10-19T07:00:00Z' })}\n${row}\n`)
  expect(away).toEqual({ text: 'We are building herd. Next, tests.', at: Date.parse('2026-10-20T07:14:37.317Z') })
  expect(lastAwaySummary('')).toBeNull()
  expect(lastAwaySummary('{"subtype":"away_summary","content":')).toBeNull()
  expect(firstSentence(away!.text)).toBe('We are building herd.')
  const own = { text: 'mine', at: away!.at + 1 }
  expect(newestRecap(away, own)).toBe(own)
  expect(newestRecap(null, away)).toBe(away)
  expect(isRecapDue(null, 0, true)).toBe(true)
  expect(isRecapDue(own, own.at + 4 * 60_000, true)).toBe(false)
  expect(isRecapDue(own, own.at + 5 * 60_000, true)).toBe(true)
  expect(isRecapDue(null, 0, false)).toBe(false) // option off: never
})

test('models read short', () => {
  expect(shortModel('claude-opus-5-5[1m]')).toBe('Opus 5.5')
  expect(shortModel('claude-sonnet-5-5')).toBe('Sonnet 5.5')
  expect(shortModel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  expect(shortModel('claude-3-5-sonnet-20241022')).toBe('Sonnet')
  expect(shortModel('opus')).toBe('Opus')
  expect(shortModel('gpt-x')).toBe('gpt-x')
  expect(shortModel(null)).toBeNull()
})

test('a finished turn you did not see waits for you, after a dialog and before work', () => {
  const snap = (id: string, state: 'waiting' | 'unseen' | 'working' | 'ready', since: number) => ({ id, name: id, state, task: null, updatedAt: 0, since, recap: { text: `${id} did things. Then more.`, at: 0 } })
  const rows = paneRows(null, [snap('r', 'ready', 0), snap('w', 'working', 0), snap('u', 'unseen', 5), snap('p', 'waiting', 9), snap('u2', 'unseen', 1)], 10)
  expect(rows.map(r => r.snap.id)).toEqual(['p', 'u2', 'u', 'w', 'r'])
  expect(rows.filter(r => needsYou(r.snap)).length).toBe(3)
  expect(rows[1]!.detail).toBe('Done: u2 did things.')
  expect(rows[4]!.detail).toBe('r did things.')
})

const GUID = '0F1E2D3C-4B5A-6978-8796-A5B4C3D2E1F0'
type On = Parameters<Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>>[1]
const TERM_ENV: Record<'iterm' | 'ghostty', Record<string, string>> = {
  iterm: { ITERM_SESSION_ID: `w0t0p0:${GUID}` },
  ghostty: { TERM_PROGRAM: 'ghostty' },
}
const sessionFacts = (on: On, front: { isFront: boolean; isDenied?: boolean }, calls: unknown[], term: 'iterm' | 'ghostty' = 'iterm', scripts: (readonly string[])[] = []) => {
  on('session.id', () => ({ value: 'self1234' }) as never)
  on('session.cwd', () => ({ value: '/work/herd' }) as never)
  on('session.model', () => ({ value: 'claude-opus-5-5[1m]' }) as never)
  on('env.get', (_$, e) => ({ value: TERM_ENV[term][(e as { name: string }).name] ?? '/home/test' }) as never)
  on('fs.write', () => ({ value: undefined }) as never)
  on('process.run', (_$, e) => {
    const argv = (e as { argv: readonly string[] }).argv
    if (argv[0] === 'osascript' || argv[0] === 'sh') scripts.push(argv)
    if (argv[0] === 'sh') return { value: { stdout: '/dev/ttys004\n', stderr: '', exitCode: 0 } } as never
    if (argv[0] === 'osascript' && argv[2]?.includes('focus t')) return { value: { stdout: 'ok\n', stderr: '', exitCode: 0 } } as never
    if (argv[0] === 'osascript' && front.isDenied) return { value: { stdout: '', stderr: 'Not authorized to send Apple events (-1743)', exitCode: 1 } } as never
    return { value: { stdout: argv[0] === 'osascript' ? (front.isFront ? 'yes\n' : 'no\n') : '', stderr: '', exitCode: 0 } } as never
  })
  on('model.complete', (_$, e) => {
    calls.push(e)
    return { value: { isAnswered: true, text: 'Building the recap line. Next, tests.', usage: { input_tokens: 900, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } } as never
  })
  on('turn.complete', () => ({ text: '' }) as never)
  on('prompt.submit', (_$, e) => ({ text: (e as { text: string }).text }) as never)
}
const TURN = { answer: 'I added the recap line.', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'end_turn' } as never
const PANE60 = { plugin: 'herd', component: 'Pane', requestId: 'sessions', surface: 'terminal', props: { title: 'Sessions', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { bodyRows: 40, offset: 0 }, view: {} } as never } as const
declare const setTimeout: (run: () => void, ms: number) => unknown
const settle = () => new Promise<void>(resolve => setTimeout(() => resolve(), 50)) // the recap runs detached from the turn

test('a turn ends out of sight: it waits for you, Haiku writes one recap, typing clears the wait', async ($, on) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  mock.store(on)
  const front = { isFront: false }
  const calls: unknown[] = []
  const scripts: (readonly string[])[] = []
  sessionFacts(on, front, calls, 'iterm', scripts)
  await $.prompt.submit({ text: 'add a recap line' } as never)
  await $.turn.complete(TURN)
  await settle()
  expect(calls.length).toBe(1)
  expect((calls[0] as { model: string; prompt: string }).model).toBe('haiku')
  expect((calls[0] as { prompt: string }).prompt).toContain('add a recap line')
  const ui = await $.ui.mount(PANE60)
  expect(await ui.find({ type: 'Text', text: '1 needs you' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Opus 5\.5/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Done: Building the recap line\./ })).toBeDefined()
  await ui.press({ key: 'more:self1234' })
  expect(await ui.find({ type: 'Text', text: /Next, tests\./ })).toBeDefined()
  await ui.unmount()
  await $.turn.complete(TURN) // a second turn inside 5 minutes: no new recap
  await settle()
  expect(calls.length).toBe(1)
  await clock.advance(5 * 60_000)
  await $.turn.complete(TURN)
  await settle()
  expect(calls.length).toBe(2)
  await $.prompt.submit({ text: 'thanks' } as never)
  const after = await $.ui.mount(PANE60)
  expect(await after.find({ type: 'Text', text: 'Nothing needs you' })).toBeDefined()
  await after.unmount()
  expect(scripts.some(argv => argv[0] === 'sh')).toBe(false) // outside Ghostty, no tty lookup
})

test('a turn ends while you look at its tab: nothing waits', async ($, on) => {
  mock.clock(on, { now: 1_800_000_000_000 })
  mock.store(on)
  sessionFacts(on, { isFront: true }, [])
  await $.turn.complete(TURN)
  await settle()
  const ui = await $.ui.mount(PANE60)
  expect(await ui.find({ type: 'Text', text: 'Nothing needs you' })).toBeDefined()
  await ui.unmount()
})

test('with fresh recaps off, no model call is ever made', { options: { recaps: false } }, async ($, on) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  mock.store(on)
  const calls: unknown[] = []
  sessionFacts(on, { isFront: false }, calls)
  for (let i = 0; i < 3; i++) {
    await $.turn.complete(TURN)
    await settle()
    await clock.advance(10 * 60_000)
  }
  expect(calls.length).toBe(0)
})

test('when osascript fails (no Automation permission), a finished turn never waits', async ($, on) => {
  mock.clock(on, { now: 1_800_000_000_000 })
  mock.store(on)
  sessionFacts(on, { isFront: false, isDenied: true }, [])
  await $.turn.complete(TURN)
  await settle()
  const ui = await $.ui.mount(PANE60)
  expect(await ui.find({ type: 'Text', text: 'Nothing needs you' })).toBeDefined()
  await ui.unmount()
})

test('in Ghostty, a turn that ends out of sight waits; one that ends in its focused tab does not', async ($, on) => {
  mock.clock(on, { now: 1_800_000_000_000 })
  mock.store(on)
  const front = { isFront: false }
  const scripts: (readonly string[])[] = []
  sessionFacts(on, front, [], 'ghostty', scripts)
  await $.turn.complete(TURN)
  await settle()
  const ui = await $.ui.mount(PANE60)
  expect(await ui.find({ type: 'Text', text: '1 needs you' })).toBeDefined()
  await ui.unmount()
  const fronts = scripts.filter(argv => argv[0] === 'osascript')
  expect(fronts.at(-1)?.at(-1)).toBe('/dev/ttys004')
  expect(fronts.at(-1)?.[2]).toContain('application "Ghostty"')
  front.isFront = true
  await $.prompt.submit({ text: 'next' } as never)
  await $.turn.complete(TURN)
  await settle()
  const after = await $.ui.mount(PANE60)
  expect(await after.find({ type: 'Text', text: 'Nothing needs you' })).toBeDefined()
  await after.unmount()
  expect(scripts.filter(argv => argv[0] === 'sh').length).toBe(1) // the tty is looked up once per load
})

test('a click on a Ghostty row focuses the terminal on that session’s tty', async ($, on) => {
  expect(ghosttyTty('/dev/ttys004\n')).toBe('/dev/ttys004')
  expect(ghosttyTty('/dev/ttys004" then do shell script "rm')).toBeNull()
  expect(ghosttyTty('ttys004')).toBeNull()
  expect(ghosttyTty(undefined)).toBeNull()

  mock.clock(on, { now: 0 })
  mock.store(on)
  const scripts: (readonly string[])[] = []
  sessionFacts(on, { isFront: true }, [], 'ghostty', scripts)
  const shown: string[] = []
  on('ui.toast', (_$, e) => { shown.push((e as { text: string }).text); return { value: undefined } as never })
  on('classic.PermissionRequest', () => ({}) as never)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: {} } as never)
  const ui = await $.ui.mount(PANE60)
  await ui.press({ key: 'go2:self1234' })
  const run = scripts.at(-1)
  expect(run?.[2]).toContain('focus t')
  expect(run?.at(-1)).toBe('/dev/ttys004')
  expect(shown).toEqual([]) // the jump landed: no toast
  await ui.unmount()
})

test('a click on a row in neither iTerm2 nor Ghostty says so in a toast', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.store(on)
  const commands: unknown[] = []
  renameFacts(on, commands)
  toasts.length = 0
  on('classic.PermissionRequest', () => ({}) as never)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: {} } as never)
  const ui = await $.ui.mount(PANE60)
  await ui.press({ key: 'go2:self1234' })
  expect(toasts.at(-1)).toBe('herd is not in an iTerm2 or Ghostty tab')
  await ui.unmount()
})

test('Haiku’s reply gives a recap and a name; a bad name or no JSON gives no name', () => {
  expect(parseRecapReply('{"recap": "Fixing the race. Next, CI.", "name": "Checkout test race fix"}')).toEqual({ recap: 'Fixing the race. Next, CI.', name: 'Checkout test race fix' })
  expect(parseRecapReply('```json\n{"recap": "R.", "name": "“Pricing table”"}\n```')).toEqual({ recap: 'R.', name: 'Pricing table' })
  expect(parseRecapReply('Just a sentence.')).toEqual({ recap: 'Just a sentence.', name: null })
  expect(parseRecapReply('{"recap": "Cut off at the cap. Next, te')).toEqual({ recap: null, name: null }) // never raw JSON
  expect(parseRecapReply('{"recap": "Whole recap.", "name": "Some na')).toEqual({ recap: 'Whole recap.', name: null })
  expect(parseRecapReply('{"recap": 42, "name": "X"}').recap).toBeNull()
  expect(parseRecapReply('{"recap": "R.", "name": "a name that is far too long to be a session name"}').name).toBeNull()
})

test('a suggested name is one clean line, safe as a /rename argument', () => {
  expect(cleanName('Fix\n/quit now')).toBe('Fix quit now')
  expect(cleanName('--force Checkout fix')).toBe('force Checkout fix')
  expect(cleanName('  “Pricing”   page \\ redesign ')).toBe('Pricing page redesign')
  expect(cleanName('one two three four five six seven')).toBeNull()
  expect(cleanName('   ')).toBeNull()
})

test('a rename is offered at most hourly, more rarely over your own name, and Keep holds for 3 hours on the same topic', () => {
  const H = 60 * 60_000
  expect(isDifferentName('Checkout test race fix', 'Fix the checkout test race')).toBe(false)
  expect(isDifferentName('Postgres 16 migration', 'Checkout test race fix')).toBe(true)
  expect(isDifferentName('Anything', null)).toBe(true)
  const base = { name: 'Postgres 16 migration', current: 'Checkout test race fix', isCustom: false, ask: null, now: 10 * H }
  expect(shouldAskRename(base)).toBe(true)
  expect(shouldAskRename({ ...base, current: 'Migration to Postgres 16' })).toBe(false) // already says it
  expect(shouldAskRename({ ...base, name: null })).toBe(false)
  expect(shouldAskRename({ ...base, ask: { lastAskAt: 9.5 * H, keptName: null, keptAt: 0 } })).toBe(false) // asked 30 min ago
  expect(shouldAskRename({ ...base, isCustom: true, ask: { lastAskAt: 8 * H, keptName: null, keptAt: 0 } })).toBe(false) // your name: 3 h
  expect(shouldAskRename({ ...base, isCustom: true, ask: { lastAskAt: 6.9 * H, keptName: null, keptAt: 0 } })).toBe(true)
  const kept = { lastAskAt: 8 * H, keptName: 'Postgres 16 migration', keptAt: 8 * H }
  expect(shouldAskRename({ ...base, ask: kept })).toBe(false) // you kept your name for this topic
  expect(shouldAskRename({ ...base, name: 'Pricing page redesign', ask: kept })).toBe(true) // a new topic
})

const NAMED = { text: '{"recap": "Rewriting the migration runner.", "name": "Postgres 16 migration"}' }
const toasts: string[] = []
const renameFacts = (on: On, commands: unknown[], refuse = false, reply = () => NAMED.text) => {
  on('session.id', () => ({ value: 'self1234' }) as never)
  on('session.cwd', () => ({ value: '/work/herd' }) as never)
  on('session.model', () => ({ value: 'claude-opus-5-5' }) as never)
  on('env.get', () => ({ value: '/home/test' }) as never) // not in iTerm: nothing waits on a tab
  on('fs.write', () => ({ value: undefined }) as never)
  on('process.run', () => ({ value: { stdout: '', stderr: '', exitCode: 0 } }) as never)
  on('model.complete', () => ({ value: { isAnswered: true, text: reply(), usage: { input_tokens: 900, output_tokens: 30, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }) as never)
  on('ui.panes', () => ({ value: [] }) as never)
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  on('command.run', (_$, e) => {
    commands.push(e)
    if (refuse) throw new Error('this command cannot run from a plugin') // the engine rejects the call
    return { value: {} } as never
  })
  on('prompt.fill', (_$, e) => { commands.push({ fill: (e as { text: string }).text }); return { isFilled: true } as never })
  on('ui.toast', (_$, e) => { toasts.push((e as { text: string }).text); return { value: undefined } as never })
}
const IDLE_BAND = { plugin: 'herd', component: 'AbovePrompt', surface: 'terminal', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { bodyRows: 20, offset: 0 }, view: {} } as never } as const

test('after a turn, the band offers the new name; Rename runs /rename with it', async ($, on) => {
  mock.clock(on, { now: 1_800_000_000_000 })
  mock.store(on)
  const commands: unknown[] = []
  renameFacts(on, commands)
  await $.turn.complete(TURN)
  await settle()
  const busy = await $.ui.mount({ ...IDLE_BAND, props: { ...(IDLE_BAND.props as object), isWorking: true } as never })
  expect(await busy.find({ key: 'rename-yes' })).toBeUndefined() // never mid-turn
  await busy.unmount()
  const ui = await $.ui.mount(IDLE_BAND)
  expect(await ui.find({ type: 'Text', text: '"Postgres 16 migration"' })).toBeDefined()
  await ui.press({ key: 'rename-yes' })
  expect(commands).toContainEqual(expect.objectContaining({ command: 'rename', args: 'Postgres 16 migration' }))
  expect(await ui.find({ key: 'rename-yes' })).toBeUndefined()
  await ui.unmount()
})

test('where /rename is refused, a toast says what to type and the prompt is left alone', async ($, on) => {
  mock.clock(on, { now: 1_800_000_000_000 })
  mock.store(on)
  const commands: unknown[] = []
  renameFacts(on, commands, true)
  await $.turn.complete(TURN)
  await settle()
  const ui = await $.ui.mount(IDLE_BAND)
  await ui.press({ key: 'rename-yes' })
  expect(commands.some(c => (c as { fill?: string }).fill)).toBe(false)
  expect(toasts).toContain('Type /rename Postgres 16 migration to rename the session.')
  await ui.unmount()
})

test('Keep closes the offer, and the same name is not offered again within 3 hours', async ($, on) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  mock.store(on)
  renameFacts(on, [])
  await $.turn.complete(TURN)
  await settle()
  const ui = await $.ui.mount(IDLE_BAND)
  await ui.press({ key: 'rename-keep' })
  expect(await ui.find({ key: 'rename-yes' })).toBeUndefined()
  await ui.unmount()
  await clock.advance(2 * 60 * 60_000)
  await $.turn.complete(TURN)
  await settle()
  const again = await $.ui.mount(IDLE_BAND)
  expect(await again.find({ key: 'rename-yes' })).toBeUndefined()
  await again.unmount()
})

test('with rename suggestions off, no name is ever offered', { options: { renames: false } }, async ($, on) => {
  mock.clock(on, { now: 1_800_000_000_000 })
  mock.store(on)
  renameFacts(on, [])
  await $.turn.complete(TURN)
  await settle()
  const ui = await $.ui.mount(IDLE_BAND)
  expect(await ui.find({ key: 'rename-yes' })).toBeUndefined()
  await ui.unmount()
})

test('the offer goes once the work no longer supports it', async ($, on) => {
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  mock.store(on)
  let reply = NAMED.text
  renameFacts(on, [], false, () => reply)
  await $.turn.complete(TURN)
  await settle()
  const ui = await $.ui.mount(IDLE_BAND)
  expect(await ui.find({ key: 'rename-yes' })).toBeDefined()
  await ui.unmount()
  reply = '{"recap": "Now on the pricing page.", "name": "Pricing page redesign"}'
  await clock.advance(6 * 60_000) // a new recap, inside the hourly gap: no new offer, and the old one no longer fits
  await $.turn.complete(TURN)
  await settle()
  const after = await $.ui.mount(IDLE_BAND)
  expect(await after.find({ key: 'rename-yes' })).toBeUndefined()
  await after.unmount()
})
