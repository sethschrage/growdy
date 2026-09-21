import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MessageContent } from '@/features/chat/MessageContent'

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
