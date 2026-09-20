import type { SourceKind } from '@/features/chat/thinking'

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  feedback?: 'up' | 'down'
  /** What this answer looked at. Absent on anything answered outright. */
  sources?: SourceKind[]
  /**
   * What it cost, kept so the numbers survive the status line.
   *
   * `cost` is estimated US dollars, priced when the answer arrived
   * rather than on render. That is deliberate: it is what this request
   * cost at the rates in force at the time, and re-pricing a logged
   * answer against a future model's rates would quietly rewrite a number
   * somebody already paid. Absent on anything logged before the estimate
   * existed, which is why it is optional rather than defaulted to 0 --
   * "we don't know" and "it was free" are different claims.
   */
  tokens?: { total: number; cached: number; cost?: number }
}
