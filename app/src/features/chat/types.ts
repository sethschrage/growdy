import type { SourceKind } from '@/features/chat/thinking'

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  feedback?: 'up' | 'down'
  /** What this answer looked at. Absent on anything answered outright. */
  sources?: SourceKind[]
  /** What it cost, kept so the number survives the status line. */
  tokens?: { total: number; cached: number }
}
