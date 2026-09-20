import { useEffect, useState } from 'react'
import type { ThinkingState } from '@/features/chat/thinking'

// What the app shows while it is working.
//
// It used to be a sprout growing through four frames, which was the
// same animation whether the model answered straight out of its head or
// ran nine queries against the vineyard. The wait is often ten or
// twenty seconds and a producer had no way to tell a slow answer from a
// stuck one.
//
// Everything here comes off the stream. The only thing on a timer is
// the elapsed count, which is true by construction.

function useElapsedSeconds(since: number) {
  // Measured against a fixed start rather than counted up, so a busy
  // main thread or a backgrounded tab can't make the timer drift. The
  // clock is read in the interval callback rather than during render,
  // which keeps the render pure; the component is keyed on `since`, so
  // each request starts from zero without a reset having to run inside
  // an effect.
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!since) return
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - since) / 1000)), 250)
    return () => clearInterval(timer)
  }, [since])
  return seconds
}

export function ThinkingStatus({ state, since }: { state: ThinkingState; since: number }) {
  const elapsed = useElapsedSeconds(since)
  const tokens = state.inputTokens + state.outputTokens

  return (
    <div className="thinking" aria-live="polite">
      <span className="thinking-pulse" aria-hidden="true" />
      <span className="thinking-phrase">
        {state.phrase}
        {state.detail ? <span className="thinking-detail"> · {state.detail}</span> : null}
      </span>
      <span className="thinking-meta">
        {elapsed > 0 ? `${elapsed}s` : null}
        {/* Tokens appear only once the first turn has reported them, so
            the line doesn't sit at a confident 0 while it waits. */}
        {tokens > 0 ? ` · ${tokens.toLocaleString()} tokens` : null}
        {/* Only worth showing when it happened: a first question of the
            day legitimately has nothing cached, and a zero here would
            read as a fault rather than as a cold start. */}
        {state.cachedTokens > 0 ? ` (${state.cachedTokens.toLocaleString()} cached)` : null}
      </span>
    </div>
  )
}
