export type Flash = { kind: 'happy' | 'sad'; until: number; durationMs?: number }
export type Task = { subject: string; status: string }
export type Usage = { contextPercent: number | null; fiveHourPercent: number | null; costUsd: number | null }
export type Recap = { text: string; at: number }
export type SessionSnap = {
  id: string
  name: string
  title?: string | null
  state: 'waiting' | 'unseen' | 'working' | 'ready'
  task: string | null
  updatedAt: number
  since?: number
  waitingFor?: string | null
  isEnded?: boolean
  itermId?: string | null
  recap?: Recap | null
  model?: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'herd': {
      frame: number
      isHidden: boolean
      isWaiting: boolean
      isWorking: boolean
      flash: Flash | null
      tasks: Record<string, Task>
      usage: Usage | null
      sessions: SessionSnap[]
      self: SessionSnap | null
      title: string | null
      stateSince: { state: SessionSnap['state']; since: number } | null
      waitingFor: string | null
      paneIsCompact: boolean
      minute: number
      isUnseen: boolean
      lastPrompt: string | null
      ownRecap: Recap | null
      awayRecap: Recap | null
      expanded: Record<string, boolean>
      demo: { mood: 'idle' | 'working' | 'happy' | 'sad' | 'waiting'; label: string } | null
    }
  }
}
