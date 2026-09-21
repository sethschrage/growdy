// The press, the way the phone draws it.
//
// A web button shrinks when you push it -- the convention is a button
// going *into* the page, and growdy's wooden buttons sink --press for
// exactly that reason. iOS does the opposite with a glass control: it
// grows under your thumb, as though your finger were lifting it toward
// you, and it stays lifted for as long as you hold it. Slide off and it
// drops back; slide on again and it lifts again. That last part is what
// makes it read as an object rather than as a state.
//
// It is also the part `:active` cannot do. WebKit drops :active when the
// finger leaves and never gives it back, and while a scroller is
// deciding whether the gesture is a scroll it can drop it mid-press for
// reasons of its own. So the state is ours: tracked off pointer events,
// written to a class. What it looks like is liquid.css's business; this
// file only decides when it is true.
//
// Nothing here decides whether the button fires. A tap that ends off the
// button already produces no click, on every platform, so activation
// stays the platform's job and this stays cosmetic.

/** The glass controls. Everything else keeps the app's wooden press. */
const PRESSABLE = '.new-chat, .chat-extras, .icon-button'

export const PRESSED = 'pressed'

/**
 * Follow the finger across every glass control on the page.
 *
 * One delegated listener rather than one per button: these controls
 * mount and unmount with the chat (the send arrow only exists once
 * there is something to send), and a document-level listener does not
 * have to be told about that.
 *
 * Returns the detach, for tests and for symmetry.
 */
export function setUpPress(scope: Document = document): () => void {
  // The one pointer we are following. A second finger arriving on
  // another button while the first is still down is a case the phone
  // itself ignores, and following a single id is how we ignore it too.
  let held: HTMLElement | null = null
  let following = -1

  function drop() {
    held?.classList.remove(PRESSED)
    held = null
    following = -1
  }

  function down(event: PointerEvent) {
    if (held || !event.isPrimary) return
    const target = event.target
    if (!(target instanceof Element)) return
    const button = target.closest(PRESSABLE)
    if (!(button instanceof HTMLElement) || button.matches(':disabled')) return
    held = button
    following = event.pointerId
    button.classList.add(PRESSED)
  }

  function move(event: PointerEvent) {
    if (!held || event.pointerId !== following) return
    // A hit test rather than the button's own rectangle. The two buttons
    // in the capsule are padded out past their edges by an ::after so
    // that a 30px button is a 44px target, and being inside *that* is
    // what the phone counts as being on the button. A rectangle would
    // also grow with the press, which would make the button harder to
    // slide off the longer you held it.
    const under = scope.elementFromPoint(event.clientX, event.clientY)
    held.classList.toggle(PRESSED, under?.closest(PRESSABLE) === held)
  }

  function up(event: PointerEvent) {
    if (!held || event.pointerId !== following) return
    drop()
  }

  scope.addEventListener('pointerdown', down)
  // On the window, not on the button: the moment the finger is off the
  // button the button stops hearing about it, and sliding off is the
  // whole point.
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  // A scroller taking the gesture arrives as a cancel, and a press that
  // turned into a scroll was not a press.
  window.addEventListener('pointercancel', up)

  return () => {
    scope.removeEventListener('pointerdown', down)
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    drop()
  }
}
