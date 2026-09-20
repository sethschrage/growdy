// The arithmetic behind dragging the menu wider and thinner.
//
// Separate from the component because it is the part with decisions in
// it -- which direction counts as wider, when a drag is really a tap,
// where the edges are -- and because a pointer gesture is miserable to
// test through a DOM and trivial to test as a function.

/** As wide as the longest label this menu carries, plus its padding. */
export const WIDEST_LABEL = 180

/**
 * A press that moves less than this is a tap, not a drag. Fingers are
 * not still: a tap on a phone routinely travels two or three pixels,
 * and treating those as a drag would leave the menu a hair narrower
 * every time somebody tapped the handle.
 */
export const TAP_SLOP = 6

/**
 * Which way is wider. The menus hang off opposite edges and their labels
 * grow toward the middle of the screen, so the same finger movement
 * means opposite things: dragging left widens the right-hand menu and
 * narrows the left-hand one.
 */
export type GrowDirection = 'left' | 'right'

export function widthFromDrag(
  startWidth: number,
  deltaX: number,
  grow: GrowDirection,
  widest = WIDEST_LABEL,
): number {
  const toward = grow === 'left' ? -deltaX : deltaX
  return Math.min(widest, Math.max(0, startWidth + toward))
}

/** Whether a press that has moved this far should be read as a tap. */
export function isTap(totalMovement: number): boolean {
  return totalMovement < TAP_SLOP
}

/**
 * Where a tap takes it: all the way open, or all the way shut.
 */
export function widthAfterTap(current: number, widest = WIDEST_LABEL): number {
  return current > 0 ? 0 : widest
}

/**
 * How far the handle has to move before letting go commits to it.
 *
 * Lower than the menu's own quarter, because this gesture is shorter --
 * the labels are 180px wide against a stack nearly three times that --
 * and the same fraction of a shorter run is a longer-feeling pull.
 */
export const LABEL_COMMIT_AT = 0.15

/**
 * Where the labels land when the finger comes off: open or shut, never
 * in between.
 *
 * A drag used to leave them at whatever width it ended on, which meant
 * the menu could sit at 96px with every label cut off mid-word -- a
 * state nobody would choose on purpose and the producer kept landing in
 * by accident. The width is still continuous under the finger, because
 * that is what makes it feel like a handle; it is only the resting
 * places that are two.
 */
export function settleLabelWidth(
  startWidth: number,
  endWidth: number,
  widest = WIDEST_LABEL,
): number {
  const moved = (endWidth - startWidth) / widest
  if (Math.abs(moved) >= LABEL_COMMIT_AT) return moved > 0 ? widest : 0
  // Went nowhere in particular: back to whichever end it came from.
  return nearestEnd(startWidth, widest)
}

/** The closer of the two resting places. */
export function nearestEnd(width: number, widest = WIDEST_LABEL): number {
  return width * 2 >= widest ? widest : 0
}

/**
 * Where the remembered width lives. Namespaced because localStorage on
 * a deployed origin is shared by everything the app ever puts there.
 */
export const LABEL_WIDTH_KEY = 'growdy.menu-label-width'

/** Only the two methods used, so a test can pass a plain object. */
export type WidthStore = Pick<Storage, 'getItem' | 'setItem'>

/**
 * localStorage, or nothing. Reading it throws outright in a WebView with
 * site data blocked, which is a thing an iOS shell can be configured
 * into -- and a menu that cannot remember a width should still open.
 */
export function browserStore(): WidthStore | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * Keeps the width the producer chose. They set it once, deliberately,
 * by dragging or tapping the handle -- reopening to the default made
 * that a setting the app forgot on purpose every single time.
 */
export function rememberLabelWidth(width: number, store = browserStore()): void {
  try {
    store?.setItem(LABEL_WIDTH_KEY, String(Math.round(width)))
  } catch {
    // Full, or private-mode. Not worth a word to the producer: the menu
    // works, it just opens where it did last time it could be saved.
  }
}

/** The remembered width, or the default when there is nothing to trust. */
export function recallLabelWidth(store = browserStore(), widest = WIDEST_LABEL): number {
  let raw: string | null = null
  try {
    raw = store?.getItem(LABEL_WIDTH_KEY) ?? null
  } catch {
    return widest
  }
  if (raw === null) return widest
  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed)) return widest
  // Snapped, not just clamped. Clamping keeps a saved width inside the
  // range, which still allows a menu to open at 96px with every label
  // cut off -- and a value like that is in storage on any phone that ran
  // the version where a drag could end anywhere. The resting places are
  // open and shut, including the one a menu opens into.
  // No clamp in front of it: nearestEnd compares against the midpoint,
  // so a saved 9000 is already on the open side and a saved -40 on the
  // shut side. A clamp here would be a line no test could fail.
  return nearestEnd(parsed, widest)
}
