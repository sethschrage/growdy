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
 * Where a tap takes it: all the way open, or all the way shut. Anything
 * in between is reachable by dragging, but a tap should not leave the
 * menu at some width nobody chose.
 */
export function widthAfterTap(current: number, widest = WIDEST_LABEL): number {
  return current > 0 ? 0 : widest
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
  // Clamped on the way out as well as in: the value survives releases,
  // and a width saved when the longest label was longer would otherwise
  // open the menu wider than anything in it.
  return Math.min(widest, Math.max(0, parsed))
}
