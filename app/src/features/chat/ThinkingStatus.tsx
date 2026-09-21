import { useEffect, useState } from 'react'
import { estimateThinkingCostUsd, formatCostUsd } from '@/features/chat/cost'
import type { ThinkingState } from '@/features/chat/thinking'
import { ChevronIcon } from '@/ui/icons'

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

/**
 * What the disclosure calls itself, for the label a screen reader reads.
 *
 * Named for what is behind it, which is not always the same thing: an
 * answer straight out of the model's head has reasoning and no steps,
 * and against a function deployed before reasoning was forwarded it is
 * steps and no reasoning.
 */
function label(steps: number, hasReasoning: boolean): string {
  if (steps === 0) return 'working'
  const counted = `${steps} ${steps === 1 ? 'step' : 'steps'}`
  return hasReasoning ? `working and ${counted}` : counted
}

export function ThinkingStatus({ state, since }: { state: ThinkingState; since: number }) {
  // Shut by default and remembered only for this request: the component
  // is keyed on the send, so opening the steps on one answer does not
  // open them on the next.
  const [open, setOpen] = useState(false)
  const elapsed = useElapsedSeconds(since)
  const tokens = state.inputTokens + state.outputTokens
  // The token count answers "how big was that"; this answers "was that a
  // lot", which is the question the producer has actually been asking.
  // Both, because the count is what one answer gets compared against the
  // last one with and money on its own loses that.
  const cost = estimateThinkingCostUsd(state)

  // Either half can be missing. An answer straight out of the model's
  // head has reasoning and no steps; a function deployed before
  // reasoning was forwarded gives steps and none of it.
  const hasWorking = state.steps.length > 0 || Boolean(state.reasoning)

  return (
    <div className="thinking-block">
      {/* Above the line, not below it.
          The status line is the last thing in the conversation and the
          compose bar floats over the bottom of that scroller, so anything
          rendered under the line is under the bar: the disclosure shipped
          and was never once reachable while an answer ran, which is the
          only time it exists. Opening upward grows the working into the
          conversation, which is empty space at that moment anyway. */}
      {open && state.reasoning ? (
        // The model's own reasoning, as prose, above the steps it took --
        // above rather than below because it is what led to them, and the
        // whole block is already inverted so that reading downward ends
        // at the line it belongs to.
        <p className="thinking-reasoning">{state.reasoning}</p>
      ) : null}
      {open && state.steps.length > 0 && (
        <ol className="thinking-steps">
          {state.steps.map((step, i) => (
            <li
              key={`${step.phrase}-${i}`}
              className={`thinking-step${step.running ? ' thinking-step--running' : ''}`}
            >
              <span className="thinking-step-phrase">{step.phrase}</span>
              {step.detail ? <span className="thinking-step-detail">{step.detail}</span> : null}
            </li>
          ))}
        </ol>
      )}
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
        {state.cachedTokens > 0 ? (
          <span className="thinking-cached"> ({state.cachedTokens.toLocaleString()} cached)</span>
        ) : null}
        {/* The money. Gated on the same tokens > 0 as the count it sits
            beside, because a confident "0¢" during the opening pause
            would be the same lie as a confident 0 tokens. "about"
            rather than a "≈", which a screen reader on this aria-live
            region either skips or reads as punctuation. */}
        {tokens > 0 ? (
          <span className="thinking-cost"> · about {formatCostUsd(cost)}</span>
        ) : null}
      </span>
      {/* The control lives inside the line, for the same reason the
          working lives above it: the line is the one part of this that is
          always on screen. */}
      {hasWorking && (
        <button
          type="button"
          className={`thinking-steps-toggle${open ? ' thinking-steps-toggle--open' : ''}`}
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          aria-label={
            open
              ? 'Hide the working so far'
              : `Show the ${label(state.steps.length, Boolean(state.reasoning))} so far`
          }
        >
          <ChevronIcon size={14} />
        </button>
      )}
    </div>
    </div>
  )
}
