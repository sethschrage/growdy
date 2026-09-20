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
    const { rerender } = render(
      <ThinkingStatus state={state({ steps: [{ phrase: 'One', running: false }] })} since={1} />,
    )
    expect(screen.getByRole('button').textContent).toBe('1 step')
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
    expect(screen.getByRole('button').textContent).toBe('2 steps')
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
    expect(screen.getByRole('button', { name: 'Hide steps' })).toBeTruthy()
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
