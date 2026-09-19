import type { ReactNode } from 'react'

// One button shape for both menus, in two states.
//
// Collapsed it is a circle with an icon, which is what fits beside a
// conversation without covering it. Expanded it grows a label to its
// right and becomes an oval -- the same button, longer, rather than a
// drawer sliding in over the app. That distinction is the point: a
// drawer is somewhere else, and this is the same place with more of it
// visible.
//
// The label is always in the DOM, clipped to nothing when collapsed, so
// the growth is a transition on max-width rather than an element
// appearing. `width: auto` cannot be animated; a max-width wide enough
// for the longest label can, and the button's own width follows its
// content, so nothing is padded out to a fixed size.
//
// aria-label carries the same text either way, so what a screen reader
// announces doesn't depend on whether the menu happens to be expanded.
export function MenuButton({
  label,
  expanded,
  onClick,
  children,
}: {
  label: string
  expanded: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`menu-icon-button${expanded ? ' menu-icon-button--expanded' : ''}`}
      aria-label={label}
      onClick={onClick}
      role="menuitem"
    >
      <span className="menu-icon-button-glyph">{children}</span>
      <span className="menu-label" aria-hidden="true">
        {label}
      </span>
    </button>
  )
}
