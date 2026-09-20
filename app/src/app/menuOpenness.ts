// How far open the menu is, as a number between 0 and 1.
//
// It used to be a boolean with an animation attached: the menu was open
// or shut, and a keyframe covered the distance between at a fixed speed
// whatever the producer's hand was doing. A finger that pushed it closed
// slowly got the same 340ms as a finger that flicked, which is the
// difference between a control you are operating and a control you are
// triggering.
//
// So the position is a number the gesture writes and the stylesheet
// reads, and the animation is what happens when nobody is holding it.
// The arithmetic lives here, away from the DOM, for the same reason
// labelDrag's does: this is the part with decisions in it.

/**
 * Past this, letting go opens it the rest of the way; under it, letting
 * go shuts it. Half, because there is nothing to prefer -- the menu is
 * as easy to reopen as to close, so neither direction has earned the
 * benefit of the doubt.
 */
export const SETTLE_AT = 0.5

/**
 * Where a drag has pushed it. The menu shuts upward -- it is hanging
 * from the burger and goes back into it -- so a finger moving up is a
 * finger closing it, and `deltaY` is negative for exactly that gesture.
 *
 * `travel` is the stack's own height rather than a chosen distance: the
 * menu should be shut when the finger has carried it as far as the menu
 * is tall, not at some number that stops being right when a button is
 * added.
 */
export function opennessFromDrag(startOpenness: number, deltaY: number, travel: number): number {
  // A zero-height stack would divide by zero and hand back NaN, which
  // reaches the stylesheet as a menu that cannot be drawn at all. It can
  // happen: the height is measured from a ref, and a measurement taken
  // before layout is 0.
  if (travel <= 0) return startOpenness
  return clamp(startOpenness + deltaY / travel)
}

/**
 * Where it lands when the finger comes off.
 *
 * The stagger down the stack is the stylesheet's, not this file's: it
 * falls out of a calc on --openness per item, so it keeps cascading
 * under a finger instead of only when an animation runs it. shell.css,
 * on .app-menu-bar > *, has the formula.
 */
export function settleOpenness(openness: number): 0 | 1 {
  return openness >= SETTLE_AT ? 1 : 0
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}
