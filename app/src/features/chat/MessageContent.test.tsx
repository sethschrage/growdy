import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MessageContent } from '@/features/chat/MessageContent'

// The two interactive fences render real cards, and those cards import
// the data layer, which builds the Supabase client at module load and
// throws without VITE_SUPABASE_URL. A developer has a .env and never
// sees it; CI does not, so this file passed locally and failed the first
// time it ran on a machine that had never been set up. Mocked the way
// every other component test here does it (AnswerMeta, ObservationForm,
// PlantingDetail) -- the import chain is what is being cut, not the
// behaviour, and nothing below calls either of these.
vi.mock('@/data/writes', () => ({
  confirmWrite: async () => ({}),
  declineWrite: async () => {},
}))

vi.mock('@/data/observations', () => ({
  createObservationCandidate: async () => null,
}))

// Which fences are interactive is a decision this component makes twice
// -- once picking the component, once stripping react-markdown's <pre>
// -- and the two have already drifted apart once. These pin both halves
// from the outside: what a producer ends up looking at.

describe('MessageContent', () => {
  it('renders an svg fence as an ordinary code block', () => {
    // The chat used to draw these. It no longer does, and old
    // conversations still carry the fences: a stray one has to read as
    // the text it is, not disappear and not be rendered as markup.
    const { container } = render(
      <MessageContent
        role="assistant"
        content={'```svg\n<svg><rect /></svg>\n```'}
        conversationId={null}
      />,
    )
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('pre code')?.textContent).toContain('<svg><rect /></svg>')
  })

  it('still turns a confirm-write fence into real buttons, outside a <pre>', () => {
    const proposal = JSON.stringify({ proposal_id: 'p1', summary: [{ rows: 1 }] })
    const { container } = render(
      <MessageContent
        role="assistant"
        content={'```confirm-write\n' + proposal + '\n```'}
        conversationId={null}
      />,
    )
    expect(screen.getByText('Confirm')).toBeTruthy()
    // Inside react-markdown's own <pre> the card's text inherits
    // white-space: pre and overflows the bubble instead of wrapping.
    expect(container.querySelector('pre .write-confirm-card')).toBeNull()
  })

  it('leaves a user message as plain text, markdown and all', () => {
    const { container } = render(
      <MessageContent role="user" content={'**not bold**'} conversationId={null} />,
    )
    expect(container.querySelector('strong')).toBeNull()
    expect(container.textContent).toBe('**not bold**')
  })
})
