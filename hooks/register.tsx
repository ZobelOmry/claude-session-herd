import { atom, read, update } from 'claude-code'
import type { ElementConstructor, EngineInterface, Register, RenderNode, ResolveInput, TextProps } from 'claude-code'

import type { Flash, Recap, RenameAsk, SessionSnap, Task, Usage } from '../types'

// ---- art: the border collie, generated into ./collie (one letter per pixel; '.' is transparent) ----

import { HEAD, PALETTE, SITTING } from './collie'
import type { Mood, Sprite } from './collie'

const WIDTH = HEAD.width // both poses are 12 wide

const TERMINAL_DEFAULT = 0x01000000
const TICK_MS = 500
const SNAP_MS = 3000
const STALE_MS = 15_000
const FLASH_MS = 3000
const PIXEL_PX = 4

// ---- state ----

const frameAtom = atom({ plugin: 'herd', key: 'frame' } as const, 0)
const hiddenAtom = atom({ plugin: 'herd', key: 'isHidden' } as const, false)
const waitingAtom = atom({ plugin: 'herd', key: 'isWaiting' } as const, false)
const workingAtom = atom({ plugin: 'herd', key: 'isWorking' } as const, false)
const flashAtom = atom({ plugin: 'herd', key: 'flash' } as const, null as Flash | null)
const tasksAtom = atom({ plugin: 'herd', key: 'tasks' } as const, {} as Record<string, Task>)
const usageAtom = atom({ plugin: 'herd', key: 'usage' } as const, null as Usage | null)
const sessionsAtom = atom({ plugin: 'herd', key: 'sessions' } as const, [] as SessionSnap[])
const titleAtom = atom({ plugin: 'herd', key: 'title' } as const, null as string | null)
const selfAtom = atom({ plugin: 'herd', key: 'self' } as const, null as SessionSnap | null)
const stateSinceAtom = atom({ plugin: 'herd', key: 'stateSince' } as const, null as { state: SessionSnap['state']; since: number } | null)
const waitingForAtom = atom({ plugin: 'herd', key: 'waitingFor' } as const, null as string | null)
const compactAtom = atom({ plugin: 'herd', key: 'paneIsCompact' } as const, false)
const minuteAtom = atom({ plugin: 'herd', key: 'minute' } as const, 0)
const PANE = 'sessions'
const unseenAtom = atom({ plugin: 'herd', key: 'isUnseen' } as const, false)
const lastPromptAtom = atom({ plugin: 'herd', key: 'lastPrompt' } as const, null as string | null)
const ownRecapAtom = atom({ plugin: 'herd', key: 'ownRecap' } as const, null as Recap | null)
const awayRecapAtom = atom({ plugin: 'herd', key: 'awayRecap' } as const, null as Recap | null)
const expandedAtom = atom({ plugin: 'herd', key: 'expanded' } as const, {} as Record<string, boolean>)
const isCustomTitleAtom = atom({ plugin: 'herd', key: 'isCustomTitle' } as const, false)
const renameOfferAtom = atom({ plugin: 'herd', key: 'renameOffer' } as const, null as string | null)
const renameAskAtom = atom({ plugin: 'herd', key: 'renameAsk' } as const, null as RenameAsk | null)
const demoAtom = atom({ plugin: 'herd', key: 'demo' } as const, null as { mood: Mood; label: string } | null)

const DEMO: { mood: Mood; label: string }[] = [
  { mood: 'idle', label: 'Idle: sits, blinks, pants now and then' },
  { mood: 'working', label: 'Working: wags its tail and pants' },
  { mood: 'happy', label: 'Turn done: jumps for 3 seconds' },
  { mood: 'sad', label: 'Tool failed: ears down for 3 seconds' },
  { mood: 'waiting', label: 'Permission dialog: ears up, barks for you' },
]
const DEMO_STEP_MS = 3000

type $ = EngineInterface

// ---- drawing ----

// Terminal: each cell is a half-block glyph, so one text row holds two pixel rows.
export function toRasterCells(rows: readonly string[], width: number, height: number): string {
  const words = new Uint32Array(width * (height / 2) * 3)
  let i = 0
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 1) {
      const top = PALETTE[rows[y]?.[x] ?? '.']
      const bottom = PALETTE[rows[y + 1]?.[x] ?? '.']
      const [glyph, fg, bg] =
        top === undefined && bottom === undefined
          ? [0x20, TERMINAL_DEFAULT, TERMINAL_DEFAULT]
          : top === undefined
            ? [0x2584, bottom!, TERMINAL_DEFAULT]
            : [0x2580, top, bottom ?? TERMINAL_DEFAULT]
      words[i++] = glyph
      words[i++] = fg
      words[i++] = bg
    }
  }
  // ponytail: runtime has Uint8Array.prototype.toBase64; es2023 lib doesn't type it
  return (new Uint8Array(words.buffer) as unknown as { toBase64(): string }).toBase64()
}

// Desktop: one SVG per mood, a rect per pixel; SMIL flips the frames, so no redraw steals clicks.
const svgCache = new Map<string, string>()
function framesSvg(key: string, frames: string[][], width: number, height: number): string {
  const cached = svgCache.get(key)
  if (cached) return cached
  const dur = `${(frames.length * TICK_MS) / 1000}s`
  const groups = frames.map((rows, tick) => {
    const rects = rows.flatMap((row, y) =>
      [...row].flatMap((ch, x) => {
        const color = PALETTE[ch]
        return color === undefined
          ? []
          : [`<rect x="${x}" y="${y}" width="1" height="1" fill="#${color.toString(16).padStart(6, '0')}"/>`]
      }),
    )
    if (frames.length === 1) return `<g>${rects.join('')}</g>`
    const start = tick / frames.length
    const end = (tick + 1) / frames.length
    const [values, keyTimes] =
      tick === 0 ? ['visible;hidden', `0;${end}`] : ['hidden;visible;hidden', `0;${start};${end}`]
    return `<g visibility="${tick === 0 ? 'visible' : 'hidden'}"><animate attributeName="visibility" values="${values}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite" calcMode="discrete"/>${rects.join('')}</g>`
  })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width * PIXEL_PX}" height="${height * PIXEL_PX}" shape-rendering="crispEdges">${groups.join('')}</svg>`
  svgCache.set(key, svg)
  return svg
}

export function planOf(tasks: Record<string, Task>) {
  const list = Object.values(tasks)
  const done = list.filter(t => t.status === 'completed').length
  const current = list.find(t => t.status === 'in_progress')?.subject ?? null
  return { done, total: list.length, current }
}

// ---- copy and gauges (pure, so the tests pin them) ----

type Tone = 'permission' | 'success' | 'error' | 'warning' | 'suggestion' | 'subtle' | 'text'

export function duration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

// The one line that says what is happening, most urgent first. The dog's face says the same thing.
export function headline(
  isWaiting: boolean,
  flash: Flash | null,
  isWorking: boolean,
  current: string | null,
): { text: string; tone: Tone; isBold: boolean } {
  if (isWaiting) return { text: 'Waiting for your answer', tone: 'permission', isBold: true }
  if (flash?.kind === 'sad') return { text: 'A tool call failed', tone: 'error', isBold: false }
  if (flash?.kind === 'happy') {
    return { text: flash.durationMs ? `Done in ${duration(flash.durationMs)}` : 'Done', tone: 'success', isBold: true }
  }
  if (isWorking) return current ? { text: current, tone: 'text', isBold: true } : { text: 'Working', tone: 'suggestion', isBold: false }
  return { text: 'Ready for your next prompt', tone: 'subtle', isBold: false }
}

export function filledCells(percent: number, cells: number): number {
  return Math.min(cells, Math.round((Math.max(0, percent) / 100) * cells))
}

// Quiet while there is room, louder as the window fills.
export const contextTone = (percent: number): Tone => (percent >= 85 ? 'error' : percent >= 60 ? 'warning' : 'text')

// Sessions that need you are named; the rest are only counted.
export function sessionsLine(others: SessionSnap[]): { waiting: string[]; rest: string | null } {
  const waiting = others.filter(s => needsYou(s)).map(s => s.title || s.name)
  const working = others.filter(s => s.state === 'working').length
  const idle = others.filter(s => s.state === 'ready').length
  const parts = [working ? `${working} working` : '', idle ? `${idle} idle` : ''].filter(Boolean)
  const lead = waiting.length ? 'also' : 'other sessions:'
  return { waiting, rest: parts.length && (waiting.length || working) ? `${lead} ${parts.join(', ')}` : null }
}

// Breathing room: the pane's body is inset by PANE_PAD on each side, and the dog stands OWL_GAP from its text.
export const PANE_PAD = 1
const OWL_GAP = 3

// The pane's status block at a given inner width (the body minus its padding).
// At 40+ columns the meters sit beside the dog; below, they drop under it.
export function paneLayout(columns: number, hasPet: boolean) {
  const isStacked = hasPet && columns < 40
  const side = hasPet && !isStacked ? columns - WIDTH - OWL_GAP : columns
  const isShortLabels = side < 30
  const labelWidth = isShortLabels ? 3 : 8
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
  const meterCells = clamp(side - labelWidth - 6, 4, 16) // 6 = the gap and " 100%"
  const isCompactInline = side - (labelWidth + 1 + meterCells + 5) >= 9 // 2 gap + "Compact"
  return { isStacked, isShortLabels, labelWidth, meterCells, planCells: clamp(side - 10, 6, 24), isCompactInline }
}

type TextEl = ElementConstructor<TextProps>

// A Button does not truncate its children, so a row's text is cut to the pane's width here.
export const fit = (text: string, cells: number) => (text.length <= cells ? text : `${text.slice(0, Math.max(0, cells - 1))}…`)

const bar = (Text: TextEl, filled: number, cells: number, tone: Tone) => [
  <Text key="on" color={tone}>{'━'.repeat(filled)}</Text>,
  <Text key="off" color="subtle">{'─'.repeat(cells - filled)}</Text>,
]

const meter = (Text: TextEl, label: string, percent: number, cells: number) => (
  <Text size="footnote" wrap="truncate">
    <Text color="subtle">{label} </Text>
    {bar(Text, filledCells(percent, cells), cells, contextTone(percent))}
    <Text color={contextTone(percent) === 'text' ? 'subtle' : contextTone(percent)}> {Math.round(percent)}%</Text>
  </Text>
)

// ---- the panel's rows (pure, so the tests pin them) ----

const TONE_OF = { waiting: 'permission', unseen: 'warning', working: 'suggestion', ready: 'subtle' } as const
const GLYPH_OF = { waiting: '●', unseen: '●', working: '◐', ready: '○' } as const

// Waiting for you: a permission dialog, or a finished turn whose tab you have not brought to the front since.
export const needsYou = (s: SessionSnap) => s.state === 'waiting' || s.state === 'unseen'

// ---- recaps and models (pure, so the tests pin them) ----

export const RECAP_MIN_GAP_MS = 5 * 60_000

// Claude Code's own recap is a transcript row `{"type":"system","subtype":"away_summary","content":…,"timestamp":…}`.
export function lastAwaySummary(grepOutput: string): Recap | null {
  const line = grepOutput.trim().split('\n').pop()
  if (!line) return null
  try {
    const row = JSON.parse(line) as { content?: unknown; timestamp?: string }
    const text = typeof row.content === 'string' ? row.content.replace(/\s*\(disable recaps in \/config\)\s*$/, '').trim() : ''
    const at = Date.parse(row.timestamp ?? '')
    return text && Number.isFinite(at) ? { text, at } : null
  } catch {
    return null
  }
}

export const newestRecap = (a: Recap | null, b: Recap | null): Recap | null => (!a ? b : !b ? a : a.at >= b.at ? a : b)

// One recap per session per 5 minutes at most, and none at all with the option off.
export const isRecapDue = (last: Recap | null, now: number, isOn: boolean) => isOn && (!last || now - last.at >= RECAP_MIN_GAP_MS)

// `claude-opus-5-5[1m]` → `Opus 5.5`; an alias or an unknown id passes through.
export function shortModel(id: string | null | undefined): string | null {
  if (!id) return null
  const m = /(opus|sonnet|haiku|fable)(?:[-_ ]?(\d{1,2})(?!\d)(?:[-.](\d{1,2})(?!\d))?)?/i.exec(id)
  if (!m) return id
  const name = m[1]![0]!.toUpperCase() + m[1]!.slice(1).toLowerCase()
  return m[2] ? `${name} ${m[2]}${m[3] ? `.${m[3]}` : ''}` : name
}

// Haiku answers {"recap","name"}; anything else is taken as a recap with no name.
export function parseRecapReply(text: string): { recap: string | null; name: string | null } {
  const trimmed = text.trim()
  const looksJson = /^(```|\{)/.test(trimmed)
  const json = /\{[\s\S]*\}/.exec(trimmed)?.[0]
  try {
    const row = JSON.parse(json ?? '') as { recap?: unknown; name?: unknown }
    const recap = typeof row.recap === 'string' && row.recap.trim() ? row.recap.replace(/\s+/g, ' ').trim() : null
    return { recap, name: typeof row.name === 'string' ? cleanName(row.name) : null }
  } catch {
    // cut off at the token cap, or prose around the JSON: keep a readable recap, never raw JSON
    const field = /"recap"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(trimmed)?.[1]
    if (field) return { recap: field.replace(/\\(.)/g, '$1').replace(/\s+/g, ' ').trim() || null, name: null }
    return { recap: looksJson ? null : trimmed.replace(/\s+/g, ' ') || null, name: null }
  }
}

// A name goes into /rename as its argument: one line, no control characters, quotes, slashes or a leading dash.
export function cleanName(raw: string): string | null {
  const name = raw
    .replace(/[\u0000-\u001f\u007f"'“”‘’`\\/]/g, ' ')
    .replace(/^[\s-]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
  const words = name.split(' ').filter(Boolean)
  return words.length >= 1 && words.length <= 6 && name.length <= 48 ? name : null
}

const HOUR = 60 * 60_000
const nameWords = (n: string) => new Set(n.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2))

// Two names say the same thing when most of their words are shared.
export function isDifferentName(a: string, b: string | null): boolean {
  if (!b) return true
  const x = nameWords(a), y = nameWords(b)
  if (!x.size || !y.size) return a.trim().toLowerCase() !== b.trim().toLowerCase()
  const shared = [...x].filter(w => y.has(w)).length
  return shared / new Set([...x, ...y]).size < 0.5
}

// At most once an hour (3 hours over a name you chose); after Keep, 3 hours unless the work moved to a new topic.
export function shouldAskRename(o: { name: string | null; current: string | null; isCustom: boolean; ask: RenameAsk | null; now: number }): boolean {
  if (!o.name || !isDifferentName(o.name, o.current)) return false
  if (o.now - (o.ask?.lastAskAt ?? -Infinity) < (o.isCustom ? 3 * HOUR : HOUR)) return false
  if (o.ask?.keptName && o.now - o.ask.keptAt < 3 * HOUR && !isDifferentName(o.name, o.ask.keptName)) return false
  return true
}

export const firstSentence = (text: string) => text.split(/(?<=[.!?])\s+/)[0] ?? text

// What Haiku is asked after a turn: the last prompt and the reply, both cut to their ends.
export function recapPrompt(title: string | null, prompt: string | null, answer: string): string {
  const tail = (t: string, n: number) => (t.length > n ? `…${t.slice(-n)}` : t)
  return [
    'Below is the latest exchange in a Claude Code session. Answer with JSON only: {"recap": "...", "name": "..."}.',
    'recap: one or two short sentences (at most 35 words) on what the session is working on and what happens next.',
    'name: a 2 to 5 word name for the session, naming the work itself (like "Checkout test race fix"), no quotes or punctuation.',
    title ? `Session title: ${title}` : '',
    prompt ? `<prompt>\n${tail(prompt, 1500)}\n</prompt>` : '',
    `<reply>\n${tail(answer, 3000)}\n</reply>`,
  ].filter(Boolean).join('\n')
}

export function age(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000)
  if (minutes < 1) return 'just now'
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export function summary(snaps: SessionSnap[]): string | null {
  const working = snaps.filter(s => s.state === 'working').length
  const idle = snaps.filter(s => s.state === 'ready').length
  const parts = [working ? `${working} working` : '', idle ? `${idle} idle` : ''].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

export type PaneRow = { snap: SessionSnap; label: string; detail: string; age: string; isSelf: boolean }

// Every session, this one included: the ones that wait first, longest wait on top; same names get an id suffix.
export function paneRows(self: SessionSnap | null, others: SessionSnap[], now: number): PaneRow[] {
  const all = [...(self ? [self] : []), ...others]
  const nameCount = new Map<string, number>()
  const base = (s: SessionSnap) => s.title || s.name
  for (const s of all) nameCount.set(base(s), (nameCount.get(base(s)) ?? 0) + 1)
  return all
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || (a.since ?? 0) - (b.since ?? 0))
    .map(snap => ({
      snap,
      isSelf: snap.id === self?.id,
      label: (nameCount.get(base(snap)) ?? 0) > 1 ? `${base(snap)} #${snap.id.slice(0, 4)}` : base(snap),
      detail:
        snap.state === 'waiting'
          ? `Needs your answer${snap.waitingFor ? ` for ${snap.waitingFor}` : ''}`
          : snap.state === 'unseen'
            ? (snap.recap ? `Done: ${firstSentence(snap.recap.text)}` : 'Done, waiting for your reply')
            : snap.state === 'working'
              ? (snap.task ?? (snap.recap ? firstSentence(snap.recap.text) : 'Working'))
              : (snap.recap ? firstSentence(snap.recap.text) : 'Ready for a prompt'),
      age: snap.since ? age(now - snap.since) : '',
    }))
}

// ---- jump to a session: iTerm only (ITERM_SESSION_ID is `w0t3p0:<GUID>`, the GUID is iTerm's `unique id`) ----

// The id comes back from a shared folder and goes into a script, so only a GUID passes.
export function itermGuid(envValue: string | undefined | null): string | null {
  const guid = envValue?.split(':').pop() ?? ''
  return /^[0-9A-F-]{36}$/i.test(guid) ? guid : null
}

const FOCUS_SCRIPT = `on run {sid}
  tell application "iTerm2"
    repeat with w in windows
      repeat with t in tabs of w
        repeat with s in sessions of t
          if unique id of s is sid then
            select w
            tell t to select
            tell s to select
            activate
            return "ok"
          end if
        end repeat
      end repeat
    end repeat
  end tell
  return "none"
end run`

async function focusSession($: $, snap: SessionSnap) {
  const guid = itermGuid(snap.itermId)
  if (!guid) return $.ui.toast(`${snap.title || snap.name} is not in an iTerm tab`)
  const { stdout } = await $.process.run(['osascript', '-e', FOCUS_SCRIPT, guid], { timeoutMs: 5000 })
  if (stdout.trim() !== 'ok') $.ui.toast(`No iTerm tab for ${snap.title || snap.name}`)
}

// True only while iTerm is the front app and this session's tab is its current one.
const FRONT_SCRIPT = `on run {sid}
  tell application "iTerm2"
    if not frontmost then return "no"
    if unique id of current session of current window is sid then return "yes"
  end tell
  return "no"
end run`

async function isTabInFront($: $): Promise<boolean> {
  const guid = itermGuid(await $.env.get('ITERM_SESSION_ID'))
  if (!guid) return true // not in iTerm: nothing to watch, so a finished turn never waits on a tab
  const { stdout, exitCode } = await $.process.run(['osascript', '-e', FRONT_SCRIPT, guid], { timeoutMs: 5000 })
  // fail open: a denied Automation permission or a hung iTerm must never mark every turn as waiting
  return exitCode !== 0 || stdout.trim() !== 'no'
}

async function markUnseenIfAway($: $) {
  if (await isTabInFront($).catch(() => true)) return
  await update($, unseenAtom, () => true)
  await writeSnap($).catch(() => {})
}

// Rename runs Claude Code's own /rename; where a plugin may not run it, a toast says what to type.
async function renameTo($: $, name: string) {
  await update($, renameOfferAtom, () => null)
  try {
    // a refusal can come back as a { deny } answer rather than a rejection: both fall back to the prompt
    const ran = (await $.command.run({ command: 'rename', args: name })) as { deny?: unknown }
    if (ran && ran.deny) throw new Error(String(ran.deny))
    await update($, titleAtom, () => name)
    await update($, isCustomTitleAtom, () => true)
    await writeSnap($).catch(() => {})
  } catch {
    // no prompt.fill: it would replace whatever you were typing
    $.ui.toast(`Type /rename ${name} to rename the session.`)
  }
}

async function keepName($: $, name: string) {
  const now = await $.clock.now()
  await update($, renameOfferAtom, () => null)
  await update($, renameAskAtom, a => ({ lastAskAt: a?.lastAskAt ?? now, keptName: name, keptAt: now }))
}

// ---- cross-session snapshots: one JSON file per session in a shared folder ----

async function snapDir($: $): Promise<string> {
  return `${(await $.env.get('HOME')) ?? '/tmp'}/.claude/herd/sessions`
}

// The tab title lives in the transcript as `"aiTitle"` rows (Claude Code's) and `"customTitle"` rows (yours, from
// /rename), the newest last. grep, not $.fs.read: a long transcript is past fs.read's 4 MiB.
export function lastTitle(grepOutput: string, field: 'aiTitle' | 'customTitle' = 'aiTitle'): string | null {
  const line = grepOutput.trim().split('\n').pop()
  if (!line) return null
  try {
    return ((JSON.parse(`{${line}}`) as Record<string, string | undefined>)[field] ?? '').trim() || null
  } catch {
    return null
  }
}

async function refreshTranscript($: $) {
  const [home, cwd, id] = await Promise.all([$.env.get('HOME'), $.session.cwd(), $.session.id()])
  const transcript = `${home}/.claude/projects/${cwd.replace(/[^a-zA-Z0-9]/g, '-')}/${id}.jsonl`
  const [titles, customs, aways] = await Promise.all([
    $.process.run(['grep', '-oE', '"aiTitle":"([^"\\\\]|\\\\.)*"', transcript], { timeoutMs: 5000 }),
    $.process.run(['grep', '-oE', '"customTitle":"([^"\\\\]|\\\\.)*"', transcript], { timeoutMs: 5000 }),
    $.process.run(['grep', '-F', '"subtype":"away_summary"', transcript], { timeoutMs: 5000 }),
  ])
  const custom = lastTitle(customs.stdout, 'customTitle')
  const title = custom ?? lastTitle(titles.stdout)
  if (title && title !== (await read($, titleAtom))) {
    await update($, titleAtom, () => title)
    if (custom) await update($, renameOfferAtom, () => null) // you renamed it yourself: the offer is moot
  }
  if ((await read($, isCustomTitleAtom)) !== !!custom) await update($, isCustomTitleAtom, () => !!custom)
  const away = lastAwaySummary(aways.stdout)
  if (away && !same(away, await read($, awayRecapAtom))) await update($, awayRecapAtom, () => away)
}

let isRecapInFlight = false // module var on purpose: two quick turns must not both ask Haiku before the first answer lands

async function makeRecap($: $, answer: string, isRenameOn: boolean) {
  if (isRecapInFlight) return
  isRecapInFlight = true
  try {
    const [titleThen, prompt] = await Promise.all([read($, titleAtom), read($, lastPromptAtom)])
    const reply = await $.model.complete({ model: 'haiku', prompt: recapPrompt(titleThen, prompt, answer), maxTokens: 200, timeoutMs: 30_000 })
    if (!reply.isAnswered || !reply.text.trim()) return
    const { recap, name } = parseRecapReply(reply.text)
    const at = await $.clock.now()
    if (recap) {
      await update($, ownRecapAtom, () => ({ text: recap, at }))
      await writeSnap($).catch(() => {})
    }
    if (!isRenameOn) return
    // read after the call: you may have renamed the session while Haiku was answering
    const [title, isCustom, ask, offer] = await Promise.all([read($, titleAtom), read($, isCustomTitleAtom), read($, renameAskAtom), read($, renameOfferAtom)])
    if (!shouldAskRename({ name, current: title, isCustom, ask, now: at })) {
      // an offer still up must still be news and still match the work, or it goes
      if (offer && (!isDifferentName(offer, title) || (name !== null && isDifferentName(offer, name)))) await update($, renameOfferAtom, () => null)
      return
    }
    await update($, renameOfferAtom, () => name)
    await update($, renameAskAtom, a => ({ lastAskAt: at, keptName: a?.keptName ?? null, keptAt: a?.keptAt ?? 0 }))
  } finally {
    isRecapInFlight = false
  }
}

async function writeSnap($: $, extra: Partial<SessionSnap> = {}) {
  const [id, cwd, isWaiting, isWorking, tasks, waitingFor, stateSince, title, now, termId, isUnseen, own, away, model] = await Promise.all([
    $.session.id(),
    $.session.cwd(),
    read($, waitingAtom),
    read($, workingAtom),
    read($, tasksAtom),
    read($, waitingForAtom),
    read($, stateSinceAtom),
    read($, titleAtom),
    $.clock.now(),
    $.env.get('ITERM_SESSION_ID'),
    read($, unseenAtom),
    read($, ownRecapAtom),
    read($, awayRecapAtom),
    $.session.model().catch(() => null),
  ])
  const state = isWaiting ? 'waiting' : isWorking ? 'working' : isUnseen ? 'unseen' : 'ready'
  let since = stateSince?.since ?? now
  if (stateSince?.state !== state) {
    since = now
    await update($, stateSinceAtom, () => ({ state, since: now }))
  }
  const snap: SessionSnap = {
    id,
    name: cwd.split('/').filter(Boolean).pop() ?? cwd,
    title,
    state,
    task: planOf(tasks).current,
    updatedAt: now,
    since,
    waitingFor: isWaiting ? waitingFor : null,
    itermId: itermGuid(termId),
    recap: newestRecap(own, away),
    model: shortModel(model),
    ...extra,
  }
  const self = { ...snap, updatedAt: 0 }
  if (!same(await read($, selfAtom), self)) await update($, selfAtom, () => self)
  await $.fs.write(`${await snapDir($)}/${id}.json`, JSON.stringify(snap))
}

const STATE_ORDER = { waiting: 0, unseen: 1, working: 2, ready: 3 } as const

export function liveOthers(snaps: SessionSnap[], selfId: string, now: number): SessionSnap[] {
  return snaps
    .filter(s => s.id !== selfId && !s.isEnded && now - s.updatedAt < STALE_MS)
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.name.localeCompare(b.name))
}

async function readOthers($: $): Promise<SessionSnap[]> {
  const dir = await snapDir($)
  const [entries, selfId, now] = await Promise.all([$.fs.list(dir).catch(() => []), $.session.id(), $.clock.now()])
  const fresh = entries.filter(f => f.name.endsWith('.json') && now - f.mtimeMs < STALE_MS)
  const snaps = await Promise.all(
    fresh.map(f =>
      $.fs
        .read(`${dir}/${f.name}`)
        .then(text => JSON.parse(text as string) as SessionSnap)
        .catch(() => null),
    ),
  )
  return liveOthers(snaps.filter((s): s is SessionSnap => s !== null), selfId, now)
}

let isEnded = false
let hasSeenSessions = false // first read only learns who already waits // module var on purpose: a reload re-runs session.start, which resets it

let ticks = 0 // module var on purpose: counts refreshes, the transcript is reread every 20th (a minute)

async function refresh($: $) {
  if (isEnded) return
  if ((await read($, unseenAtom)) && (await isTabInFront($).catch(() => false))) await update($, unseenAtom, () => false)
  if (++ticks % 20 === 0) void refreshTranscript($).catch(() => {})
  const [usage] = await Promise.all([$.session.usage(), writeSnap($).catch(() => {})])
  const nextUsage: Usage = {
    contextPercent:
      usage.context.percent ?? (usage.context.tokens !== undefined && usage.context.window ? (usage.context.tokens / usage.context.window) * 100 : null),
    fiveHourPercent: usage.rateLimits.find(r => r.kind === 'five_hour')?.percentUsed ?? null,
    costUsd: usage.cost?.usd === undefined ? null : Math.round(usage.cost.usd * 100) / 100,
  }
  if (!same(await read($, usageAtom), nextUsage)) await update($, usageAtom, () => nextUsage)
  // updatedAt is dropped so a heartbeat alone never redraws the band (a redraw replaces the buttons under the pointer).
  const others = (await readOthers($)).map(s => ({ ...s, updatedAt: 0 }))
  const isFirstRead = !hasSeenSessions
  const before = await read($, sessionsAtom)
  if (!same(before, others)) {
    const wasWaiting = new Set(before.filter(needsYou).map(s => s.id))
    if (hasSeenSessions) {
      for (const s of others) {
        if (!needsYou(s) || wasWaiting.has(s.id)) continue
        $.ui.toast(s.state === 'waiting' ? `${s.title || s.name} needs your answer` : `${s.title || s.name} is done and waits for you`)
      }
    }
    await update($, sessionsAtom, () => others)
  }
  if (isFirstRead) hasSeenSessions = true
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

async function setFlash($: $, kind: Flash['kind'], durationMs?: number) {
  const now = await $.clock.now()
  await update($, flashAtom, () => ({ kind, until: now + FLASH_MS, durationMs }))
}

async function setWaiting($: $, isWaiting: boolean, tool: string | null = null) {
  if ((await read($, waitingAtom)) === isWaiting) return
  await update($, waitingForAtom, () => tool)
  await update($, waitingAtom, () => isWaiting)
  await writeSnap($).catch(() => {})
}

// What the dog and its lines say, read once for the pane or the band.
async function readStatus($: $, isWorking: boolean) {
  const [demo, isWaiting, flash, tasks, usage] = await Promise.all([
    read($, demoAtom),
    read($, waitingAtom),
    read($, flashAtom),
    read($, tasksAtom),
    read($, usageAtom),
  ])
  const mood: Mood = demo ? demo.mood : isWaiting ? 'waiting' : (flash?.kind ?? (isWorking ? 'working' : 'idle'))
  const plan = planOf(tasks)
  const head = demo ? { text: demo.label, tone: 'text' as Tone, isBold: true } : headline(isWaiting, flash, isWorking, plan.current)
  return { mood, plan, head, usage }
}

// The terminal Raster redraws on each tick (so only it reads the frame); the desktop SVG animates itself.
// The sitting dog where there is height for it (a wide pane), the head everywhere else (the band, a narrow pane).
async function drawPet($: $, e: ResolveInput, mood: Mood, sprite: Sprite = HEAD): Promise<RenderNode | null> {
  if (e.surface === 'terminal') {
    const { Raster } = $.ui.resolve(e)
    const frames = sprite.moods[mood]
    const frame = await read($, frameAtom)
    return <Raster key="pet" columns={sprite.width} rows={sprite.height / 2} cells={toRasterCells(frames[frame % frames.length]!, sprite.width, sprite.height)} />
  }
  if (e.surface === 'desktop') {
    const { Svg } = $.ui.resolve(e)
    return <Svg key="pet" source={framesSvg(`${sprite.height}:${mood}`, sprite.moods[mood], sprite.width, sprite.height)} alt={`a pixel collie, ${mood}`} width={sprite.width * PIXEL_PX} height={sprite.height * PIXEL_PX} isInteractive />
  }
  return null
}

// ---- hooks ----

export const register: Register = (on, options) => {
  const isRecapOn = options.recaps !== false
  const isRenameOn = options.renames !== false

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    isEnded = false
    await $.command.register({ name: 'pet', description: 'Show or hide the pixel collie' })
    await $.command.register({ name: 'sessions', description: 'Show or hide the panel of all your sessions' })
    // unasked: placed only on a wide terminal, and never again once the person closed it
    if ((await $.store.get('paneClosed')) !== true) void $.ui.open({ id: PANE, title: 'Sessions' })
    await $.command.register({ name: 'pet-demo', description: "Play every one of the collie's reactions" })
    // The terminal Raster redraws on each tick; the desktop SVG animates itself.
    $.clock.every(TICK_MS, async () => {
      await update($, frameAtom, frame => frame + 1)
      const flash = await read($, flashAtom)
      const now = await $.clock.now()
      if (flash && now > flash.until) await update($, flashAtom, () => null)
      const minute = Math.floor(now / 60_000)
      if ((await read($, minuteAtom)) !== minute) await update($, minuteAtom, () => minute)
    })
    $.clock.every(SNAP_MS, () => void refresh($).catch(() => {}))
    void refreshTranscript($).catch(() => {})
    void refresh($).catch(() => {})
    return started
  })

  on('session.end', async ($, e, next) => {
    isEnded = true
    await update($, tasksAtom, () => ({}))
    await writeSnap($, { isEnded: true }).catch(() => {})
    return next(e)
  })

  on('command.run', { command: 'pet-demo' }, async $ => {
    await update($, demoAtom, () => DEMO[0]!)
    DEMO.forEach((step, i) => i && $.clock.after(i * DEMO_STEP_MS, () => void update($, demoAtom, () => step)))
    $.clock.after(DEMO.length * DEMO_STEP_MS, () => void update($, demoAtom, () => null))
    await update($, hiddenAtom, () => false)
    return { text: `Playing ${DEMO.length} reactions, ${DEMO_STEP_MS / 1000}s each.` }
  })

  on('command.run', { command: 'sessions' }, async $ => {
    if ((await $.ui.panes()).some(pane => pane.id === PANE)) {
      await $.ui.close({ id: PANE })
      await $.store.set('paneClosed', true)
      return { text: 'Sessions panel closed. Type /sessions to open it again.' }
    }
    await $.store.set('paneClosed', false)
    const opened = await $.ui.open({ id: PANE, title: 'Sessions' })
    return { text: opened.isPlaced ? 'Sessions panel opened.' : `Sessions panel waits: ${opened.reason}` }
  })

  on('command.run', { command: 'pet' }, async $ => {
    const isHidden = await update($, hiddenAtom, hidden => !hidden)
    return { text: isHidden ? 'The collie went for a walk.' : 'The collie is back.' }
  })

  // ---- reactions ----

  on('turn.start', async ($, e, next) => {
    if (e.agentId) return next(e)
    await update($, workingAtom, () => true)
    await update($, flashAtom, () => null)
    await setWaiting($, false)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) return next(e)
    await update($, workingAtom, () => false)
    await setWaiting($, false)
    if (!e.isAborted) {
      await setFlash($, 'happy', e.durationMs)
      // a reply you were not looking at waits for you until its tab comes to the front (checked detached: osascript is slow)
      void markUnseenIfAway($).catch(() => {})
      const [own, away, now] = await Promise.all([read($, ownRecapAtom), read($, awayRecapAtom), $.clock.now()])
      if (e.answer && isRecapDue(newestRecap(own, away), now, isRecapOn)) void makeRecap($, e.answer, isRenameOn).catch(() => {})
    }
    void refreshTranscript($).catch(() => {}) // the title is written, and rewritten, after turns
    void writeSnap($).catch(() => {})
    return next(e)
  })

  // Typing in this session is seeing it: the finished turn no longer waits, and its prompt feeds the next recap.
  on('prompt.submit', async ($, e, next) => {
    await update($, lastPromptAtom, () => e.text)
    if (await read($, unseenAtom)) {
      await update($, unseenAtom, () => false)
      await writeSnap($).catch(() => {})
    }
    return next(e)
  })

  // The permission dialog is about to ask the person: the dog barks for you until it is answered.
  on('classic.PermissionRequest', async ($, e, next) => {
    await setWaiting($, true, e.tool_name)
    return next(e)
  })
  // ponytail: one flag, so with parallel dialogs the first answer clears it; a per-call set if that matters
  on('tool.call', async ($, e, next) => {
    try {
      return await next(e)
    } finally {
      await setWaiting($, false)
    }
  }).catch(($, e, next) => next(e))
  on('classic.PostToolUseFailure', async ($, e, next) => {
    await setWaiting($, false)
    await setFlash($, 'sad')
    return next(e)
  })

  // ---- plan: the main agent's task list (observers; .catch replays the tool's own result) ----

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId && !result.deny) {
      await update($, tasksAtom, () =>
        Object.fromEntries(e.todos.map((t, i) => [String(i), { subject: t.activeForm || t.content, status: t.status }])),
      )
    }
    return result
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId && !result.deny && !result.isError && result.result) {
      const { id } = result.result.task
      await update($, tasksAtom, tasks => {
        const isFinished = Object.values(tasks).every(t => t.status === 'completed')
        return { ...(isFinished ? {} : tasks), [id]: { subject: e.activeForm || e.subject, status: 'pending' } }
      })
    }
    return result
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId && !result.deny && !result.isError && result.result?.success) {
      await update($, tasksAtom, tasks => {
        const { [e.taskId]: old, ...rest } = tasks
        if (e.status === 'deleted' || !old) return rest
        return {
          ...rest,
          [e.taskId]: { subject: e.activeForm || e.subject || old.subject, status: e.status ?? old.status },
        }
      })
    }
    return result
  }).catch(($, e, next) => next(e))

  // ---- the sessions panel ----

  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (e.origin.kind === 'person') await $.store.set('paneClosed', true)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const [self, others, isCompact, minute, isWorking, isHidden, expanded] = await Promise.all([
      read($, selfAtom),
      read($, sessionsAtom),
      read($, compactAtom),
      read($, minuteAtom),
      read($, workingAtom),
      read($, hiddenAtom),
      read($, expandedAtom),
    ])
    const status = await readStatus($, isWorking)
    const pet = isHidden ? null : await drawPet($, e, status.mood, e.props.bodyColumns - 2 * PANE_PAD >= 40 ? SITTING : HEAD)
    const cols = e.props.bodyColumns - 2 * PANE_PAD
    const layout = paneLayout(cols, pet !== null)
    const rows = paneRows(self, others, minute * 60_000)
    const attention = rows.filter(r => needsYou(r.snap))
    const shown = isCompact ? attention : rows
    const counts = summary(rows.filter(r => !needsYou(r.snap)).map(r => r.snap))

    const { head, plan, usage } = status
    const context = usage?.contextPercent ?? null
    const fiveHour = usage?.fiveHourPercent ?? null
    const label = (long: string, short: string) => (layout.isShortLabels ? short : long).padEnd(layout.labelWidth)
    const compactButton = (
      <Button
        key="compact"
        label="Compact"
        plain={context !== null && context >= 70 ? undefined : true}
        variant={context !== null && context >= 70 ? 'primary' : undefined}
        dimColor={!(context !== null && context >= 70)}
        onPress={() => $.session.compact({}).catch(() => $.ui.toast('Compact runs once the turn ends.'))}
      />
    )
    const headLine = (
      <Text key="head" color={head.tone} bold={head.isBold} weight={head.isBold ? 'semibold' : 'regular'} wrap={layout.isStacked ? 'truncate' : 'wrap'}>
        {head.text}
      </Text>
    )
    const planLine = plan.total > 0 && (
      <Text key="plan" wrap="truncate">
        {bar(Text, plan.total ? Math.round((plan.done / plan.total) * layout.planCells) : 0, layout.planCells, 'success')}
        <Text color="subtle">  {plan.done} of {plan.total}</Text>
      </Text>
    )
    const meters = [
      context !== null && (
        <Box key="ctx" flexDirection="row" columnGap={2}>
          {meter(Text, label('context', 'ctx'), context, layout.meterCells)}
          {layout.isCompactInline && compactButton}
        </Box>
      ),
      fiveHour !== null
        ? <Box key="5h">{meter(Text, label('5h limit', '5h'), fiveHour, layout.meterCells)}</Box>
        : usage?.costUsd ? <Text key="cost" color="subtle" size="footnote">${usage.costUsd.toFixed(2)} spent</Text> : null,
      (!layout.isCompactInline || context === null) && <Box key="compact-row">{compactButton}</Box>,
    ]

    return (
      <Box flexDirection="column" rowGap={1} paddingX={PANE_PAD} paddingTop={1}>
        {/* This session: the dog, then what it is doing and how full it is. */}
        <Box flexDirection="column" rowGap={layout.isStacked ? 1 : 0}>
          <Box flexDirection="row" columnGap={OWL_GAP} alignItems="flex-start">
            {pet}
            <Box flexDirection="column" flexGrow={1} flexShrink={1}>
              {headLine}
              {planLine}
              {!layout.isStacked && meters}
            </Box>
          </Box>
          {layout.isStacked && <Box flexDirection="column">{meters}</Box>}
        </Box>

        <Text color="subtle" wrap="truncate">{'─'.repeat(cols)}</Text>

        {/* Every session. */}
        <Box flexDirection="row" justifyContent="space-between" columnGap={2}>
          <Text bold color={attention.length ? 'permission' : 'success'}>
            {attention.length ? `${attention.length} ${attention.length === 1 ? 'needs' : 'need'} you` : 'Nothing needs you'}
          </Text>
          <Button
            key="size"
            label={isCompact ? 'Expand' : 'Minimize'}
            hotkey="m"
            plain
            dimColor
            onPress={() => update($, compactAtom, v => !v)}
          />
        </Box>

        {/* Both lines of a row are one target: a click on either jumps to that session's tab. "more" opens the full recap. */}
        {shown.map(r => {
          const id = r.snap.id
          const recap = r.snap.recap
          const isOpen = expanded[id] === true
          // "more" whenever the row does not already show the whole recap
          const hasMore = !!recap && (r.snap.state === 'waiting' || firstSentence(recap.text) !== recap.text || fit(r.detail, cols - 4 - r.age.length) !== r.detail)
          const model = r.snap.model && cols >= 34 ? `  ${r.snap.model}` : ''
          const self = r.isSelf ? '  this session' : ''
          return (
            <Box key={id} flexDirection="column">
              <Button key={`go:${id}`} plain onPress={() => focusSession($, r.snap)}>
                <Text color={TONE_OF[r.snap.state]}>{GLYPH_OF[r.snap.state]} </Text>
                {needsYou(r.snap) ? (
                  <Text backgroundColor={TONE_OF[r.snap.state]} color="inverseText" bold> {fit(r.label, cols - 4 - model.length - self.length)} </Text>
                ) : (
                  <Text bold={r.isSelf}>{fit(r.label, cols - 2 - model.length - self.length)}</Text>
                )}
                <Text color="subtle">{model}{self}</Text>
              </Button>
              <Box flexDirection="row" justifyContent="space-between" columnGap={1}>
                <Button key={`go2:${id}`} plain onPress={() => focusSession($, r.snap)}>
                  <Text color={needsYou(r.snap) ? TONE_OF[r.snap.state] : 'subtle'}>{'  '}{fit(r.detail, cols - 4 - r.age.length - (hasMore ? 6 : 0))}</Text>
                  <Text color="subtle">  {r.age}</Text>
                </Button>
                {hasMore && (
                  <Button key={`more:${id}`} label={isOpen ? 'less' : 'more'} plain dimColor onPress={() => update($, expandedAtom, all => ({ ...all, [id]: !isOpen }))} />
                )}
              </Box>
              {isOpen && recap && (
                <Box paddingLeft={2}>
                  <Text wrap="wrap" color="text">
                    {recap.text}
                    <Text color="subtle">  recap {age(minute * 60_000 - recap.at)}{age(minute * 60_000 - recap.at) === 'just now' ? '' : ' ago'}</Text>
                  </Text>
                </Box>
              )}
            </Box>
          )
        })}

        {isCompact && counts && <Text color="subtle">{counts}</Text>}
      </Box>
    )
  })

  // ---- the band: only while the pane is not on screen (closed, waiting for width, or a tab behind another) ----

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    // The rename question shows above the prompt while the session is idle, with or without the dog.
    const offer = e.props.isWorking ? null : await read($, renameOfferAtom)
    const ask = offer ? (
      <Box key="rename" flexDirection="row" columnGap={2} alignItems="center">
        <Text wrap="truncate">
          <Text color="subtle">Rename this session to </Text>
          <Text bold>{`"${offer}"`}</Text>
          <Text color="subtle">?</Text>
        </Text>
        <Button key="rename-yes" label="Rename" variant="primary" onPress={() => renameTo($, offer)} />
        <Button key="rename-keep" label="Keep" plain dimColor onPress={() => keepName($, offer)} />
        <Text color="subtle">click one</Text>
      </Box>
    ) : null
    const onTop = async () => (ask ? <Box flexDirection="column" rowGap={1}>{ask}{await next(e)}</Box> : next(e))
    if (await read($, hiddenAtom)) return onTop()
    const panes = await $.ui.panes().catch(() => []) // unknown: draw the band, so the dog never disappears
    if (panes.some(p => p.id === PANE && p.isPlaced && p.isShown)) return onTop()
    const [status, sessions] = await Promise.all([readStatus($, e.props.isWorking), read($, sessionsAtom)])
    const pet = await drawPet($, e, status.mood)
    if (!pet) return onTop()

    const { head, plan, usage } = status
    const isNarrow = e.props.bodyColumns < 80
    const context = usage?.contextPercent ?? null
    const ruleCells = isNarrow ? 12 : 24
    const ruleDone = plan.total ? Math.round((plan.done / plan.total) * ruleCells) : 0
    const others = sessionsLine(sessions)

    const band = (
      <Box key="band" flexDirection="row" justifyContent="flex-end" alignItems="flex-start" columnGap={2}>
        <Box flexDirection="column">
          <Text color={head.tone} bold={head.isBold} weight={head.isBold ? 'semibold' : 'regular'} wrap="truncate">
            {head.text}
          </Text>

          {plan.total > 0 && (
            <Text wrap="truncate">
              {bar(Text, ruleDone, ruleCells, 'success')}
              <Text color="subtle">  {plan.done} of {plan.total}</Text>
            </Text>
          )}

          <Box flexDirection="row" columnGap={3} alignItems="center">
            {context !== null && meter(Text, isNarrow ? 'ctx' : 'context', context, 8)}
            {usage?.fiveHourPercent != null
              ? meter(Text, isNarrow ? '5h' : '5h limit', usage.fiveHourPercent, 8)
              : usage?.costUsd
                ? <Text color="subtle" size="footnote">${usage.costUsd.toFixed(2)} spent</Text>
                : null}
            <Button
              key="compact"
              label="Compact"
              plain={context !== null && context >= 70 ? undefined : true}
              variant={context !== null && context >= 70 ? 'primary' : undefined}
              dimColor={!(context !== null && context >= 70)}
              onPress={() => $.session.compact({}).catch(() => $.ui.toast('Compact runs once the turn ends.'))}
            />
          </Box>

          {(others.waiting.length > 0 || others.rest) && (
            <Text wrap="truncate" size="footnote">
              {others.waiting.slice(0, 2).map((name, i) => (
                <Text key={name} color="permission" bold>
                  {i ? '   ' : ''}{name} is waiting for you
                </Text>
              ))}
              {others.waiting.length > 2 && <Text color="permission">  and {others.waiting.length - 2} more</Text>}
              {others.rest && <Text color="subtle">{others.waiting.length ? '   ' : ''}{others.rest}</Text>}
            </Text>
          )}
        </Box>
        {pet}
      </Box>
    )
    return ask ? <Box flexDirection="column" rowGap={1}>{ask}{band}</Box> : band
  })
}
