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
 * How far you have to move it before letting go commits to it: a
 * quarter of the way.
 *
 * It was "past halfway is open, short of it is shut", which sounds
 * neutral and is not. It made the producer carry the menu more than
 * half its own height before the app would believe they meant to close
 * it, and a gesture that has to be completed is barely a gesture -- you
 * may as well have pressed the button. A quarter is enough to have said
 * something.
 *
 * Read against where the gesture *started*, not against the middle, so
 * it means the same thing in both directions: a quarter of a pull opens
 * it, a quarter of a push shuts it.
 */
export const COMMIT_AT = 0.25

/** Which side of the fence a position is on, for a gesture that said nothing. */
export function wasOpen(openness: number): boolean {
  return openness >= 0.5
}

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
 * Which way it was going decides, not where it happens to be. Move it a
 * quarter or more and it keeps going that way; move it less than that
 * and it goes back where it came from -- so a small, undecided movement
 * is undone rather than being read as a decision the producer did not
 * make.
 *
 * The stagger down the stack is the stylesheet's, not this file's: it
 * falls out of a calc on --openness per item, so it keeps cascading
 * under a finger instead of only when an animation runs it. shell.css,
 * on .app-menu-bar > *, has the formula.
 */
export function settleFromDrag(startOpenness: number, endOpenness: number): 0 | 1 {
  const moved = endOpenness - startOpenness
  if (Math.abs(moved) >= COMMIT_AT) return moved > 0 ? 1 : 0
  return wasOpen(startOpenness) ? 1 : 0
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}
