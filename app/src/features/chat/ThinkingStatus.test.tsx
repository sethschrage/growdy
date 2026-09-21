import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ThinkingStatus } from '@/features/chat/ThinkingStatus'
import { IDLE_THINKING, type ThinkingState } from '@/features/chat/thinking'

function state(over: Partial<ThinkingState> = {}): ThinkingState {
  return { ...IDLE_THINKING, ...over }
}

describe('the steps behind the status line', () => {
  it('offers nothing to open before anything has happened', () => {
    render(<ThinkingStatus state={state()} since={Date.now()} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('opens for reasoning even when no tool ran', () => {
    // An answer straight out of the model's head has reasoning and no
    // steps, and it is still worth being able to read.
    // The control is a chevron rather than a worded button (#230 moved it
    // inside the status line, which is the only part always on screen),
    // so what it calls itself is the accessible name.
    render(<ThinkingStatus state={state({ reasoning: 'Checking the dates' })} since={1} />)
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Show the working so far')
  })

  it('names both when there is both', () => {
    render(
      <ThinkingStatus
        state={state({ reasoning: 'Thinking it over', steps: [{ phrase: 'One', running: false }] })}
        since={1}
      />,
    )
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe(
      'Show the working and 1 step so far',
    )
  })

  it('shows the reasoning above the steps that followed from it', () => {
    render(
      <ThinkingStatus
        state={state({
          reasoning: 'The frost question needs last week.',
          steps: [{ phrase: 'Reading your vineyard data', running: false }],
        })}
        since={1}
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('The frost question needs last week.')).toBeTruthy()
  })

  it('says nothing about reasoning against a function that does not send it', () => {
    // An older deployed function never emits the event. The panel should
    // be the steps and nothing else, not an empty paragraph.
    render(
      <ThinkingStatus state={state({ steps: [{ phrase: 'One', running: false }] })} since={1} />,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByText('', { selector: '.thinking-reasoning' })).toBeNull()
  })

  it('stays shut until asked', () => {
    // Most answers do not need explaining, and a list that opened itself
    // would shove the conversation around on every send.
    render(
      <ThinkingStatus
        state={state({ steps: [{ phrase: 'Reading your vineyard data', running: true }] })}
        since={Date.now()}
      />,
    )
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Reading your vineyard data')).toBeNull()
  })

  it('counts the steps so far, in words that match the number', () => {
    // The count is in the label rather than on screen: the control is a
    // chevron in the status line, and a screen reader is the reader that
    // needs the number.
    const { rerender } = render(
      <ThinkingStatus state={state({ steps: [{ phrase: 'One', running: false }] })} since={1} />,
    )
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Show the 1 step so far')
    rerender(
      <ThinkingStatus
        state={state({
          steps: [
            { phrase: 'One', running: false },
            { phrase: 'Two', running: true },
          ],
        })}
        since={1}
      />,
    )
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Show the 2 steps so far')
  })

  it('puts the list above the status line, not below it', () => {
    // The line is the last thing in the conversation and the compose bar
    // floats over the bottom of that scroller, so anything under the line
    // is under the bar. This is the bug that shipped: the disclosure was
    // never once reachable while an answer was running.
    const { container } = render(
      <ThinkingStatus
        state={state({ steps: [{ phrase: 'Reading your vineyard data', running: true }] })}
        since={1}
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    const block = container.querySelector('.thinking-block')!
    const children = [...block.children].map((child) => child.className)
    expect(children[0]).toContain('thinking-steps')
    expect(children[1]).toContain('thinking')
  })

  it('shows each step and what it looked at when opened', () => {
    render(
      <ThinkingStatus
        state={state({
          steps: [
            { phrase: 'Reading your vineyard data', detail: 'plantings, parcels', running: false },
            { phrase: 'Searching what it remembers', running: true },
          ],
        })}
        since={Date.now()}
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Reading your vineyard data')).toBeTruthy()
    expect(screen.getByText('plantings, parcels')).toBeTruthy()
    expect(screen.getByText('Searching what it remembers')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hide the working so far' })).toBeTruthy()
  })

  it('marks the running step apart from the finished ones', () => {
    // The whole point of the list: four done and one running is an answer
    // working, and the same wait with nothing running is a stuck one.
    render(
      <ThinkingStatus
        state={state({
          steps: [
            { phrase: 'Done one', running: false },
            { phrase: 'Still going', running: true },
          ],
        })}
        since={Date.now()}
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    const items = screen.getAllByRole('listitem')
    expect(items[0].className).not.toContain('thinking-step--running')
    expect(items[1].className).toContain('thinking-step--running')
  })
})
