import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PRESSED, setUpPress } from '@/lib/press'

// jsdom has no PointerEvent and no layout, so the two things this module
// reads from the platform are supplied here: the pointer fields, and
// what is under a point. Everything else is the module's own logic.
function pointer(
  type: string,
  { id = 1, primary = true, x = 0, y = 0 }: { id?: number; primary?: boolean; x?: number; y?: number } = {},
) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })
  Object.assign(event, { pointerId: id, isPrimary: primary })
  return event as PointerEvent
}

describe('setUpPress', () => {
  let detach: () => void
  let button: HTMLButtonElement
  let elsewhere: HTMLDivElement
  // What the next pointermove will find under the finger.
  let under: Element | null

  beforeEach(() => {
    button = document.createElement('button')
    button.className = 'chat-extras'
    elsewhere = document.createElement('div')
    document.body.append(button, elsewhere)
    under = button
    document.elementFromPoint = () => under
    detach = setUpPress()
  })

  afterEach(() => {
    detach()
    document.body.replaceChildren()
  })

  it('lifts the button while the finger is down on it', () => {
    button.dispatchEvent(pointer('pointerdown'))
    expect(button.classList.contains(PRESSED)).toBe(true)
  })

  it('leaves everything else alone', () => {
    elsewhere.dispatchEvent(pointer('pointerdown'))
    expect(elsewhere.classList.contains(PRESSED)).toBe(false)
  })

  it('counts a press on the padded-out target as a press on the button', () => {
    const icon = document.createElement('svg')
    button.append(icon)
    icon.dispatchEvent(pointer('pointerdown'))
    expect(button.classList.contains(PRESSED)).toBe(true)
  })

  it('drops the button when the finger slides off it', () => {
    button.dispatchEvent(pointer('pointerdown'))
    under = elsewhere
    window.dispatchEvent(pointer('pointermove', { x: 500 }))
    expect(button.classList.contains(PRESSED)).toBe(false)
  })

  it('lifts it again when the finger slides back on', () => {
    button.dispatchEvent(pointer('pointerdown'))
    under = null
    window.dispatchEvent(pointer('pointermove', { x: 500 }))
    under = button
    window.dispatchEvent(pointer('pointermove', { x: 5 }))
    expect(button.classList.contains(PRESSED)).toBe(true)
  })

  it('ignores a second finger while the first is still down', () => {
    button.dispatchEvent(pointer('pointerdown'))
    const other = document.createElement('button')
    other.className = 'new-chat'
    document.body.append(other)
    other.dispatchEvent(pointer('pointerdown', { id: 2 }))
    expect(other.classList.contains(PRESSED)).toBe(false)
    // and the second finger's travel does not drop the first
    under = null
    window.dispatchEvent(pointer('pointermove', { id: 2, x: 500 }))
    expect(button.classList.contains(PRESSED)).toBe(true)
  })

  it('ignores a non-primary pointer', () => {
    button.dispatchEvent(pointer('pointerdown', { primary: false }))
    expect(button.classList.contains(PRESSED)).toBe(false)
  })

  it('ignores a disabled button', () => {
    button.disabled = true
    button.dispatchEvent(pointer('pointerdown'))
    expect(button.classList.contains(PRESSED)).toBe(false)
  })

  it('settles when the finger lifts', () => {
    button.dispatchEvent(pointer('pointerdown'))
    window.dispatchEvent(pointer('pointerup'))
    expect(button.classList.contains(PRESSED)).toBe(false)
  })

  it('settles when a scroller takes the gesture', () => {
    button.dispatchEvent(pointer('pointerdown'))
    window.dispatchEvent(pointer('pointercancel'))
    expect(button.classList.contains(PRESSED)).toBe(false)
  })

  it('takes a new press once the last one has ended', () => {
    button.dispatchEvent(pointer('pointerdown'))
    window.dispatchEvent(pointer('pointerup'))
    button.dispatchEvent(pointer('pointerdown', { id: 7 }))
    expect(button.classList.contains(PRESSED)).toBe(true)
  })

  it('stops following once detached', () => {
    detach()
    button.dispatchEvent(pointer('pointerdown'))
    expect(button.classList.contains(PRESSED)).toBe(false)
  })

  it('clears a press that was still held when it detached', () => {
    button.dispatchEvent(pointer('pointerdown'))
    detach()
    expect(button.classList.contains(PRESSED)).toBe(false)
  })
})
