import type { ReactNode } from 'react'

// The icons on things you tap.
//
// These were pixel art: 7x7 and 10x10 grids of 1x1 rects, hand-plotted.
// At 18-20px that is roughly two and a half screen pixels per cell,
// which is why they read as soft -- there was no detail available to be
// sharp, and no room for a clock hand or a camera shutter to exist at
// all. A toolbar needs to say which button does what at a glance, and
// five chunky blobs of the same weight don't.
//
// So: real vector shapes on a 24x24 grid, 2px strokes, square caps and
// mitred joins. The square caps are deliberate -- rounded ends would
// read as a generic modern icon set, and the point is a toolbar that
// still belongs to this app. Coordinates are whole numbers, so a 2px
// stroke straddles a pixel boundary evenly and stays crisp at any size
// the app actually uses.
//
// What stayed pixel art is in ui/pixelArt.tsx: the clouds, the burger
// menu, the sprout. Those are the theme rather than the controls --
// sharpening the sprout would be like setting the wordmark in Helvetica.
//
// Everything here draws in currentColor, so a button's own CSS decides
// the colour. The old set hard-coded #fff on the check and nothing on
// the rest, which is why the check was invisible on a light button.

type IconProps = { size?: number; className?: string }

function Icon({
  size = 20,
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

/** Send. */
export function ArrowIcon({ size = 18, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <path d="M4 12h14" />
      <path d="M12 6l6 6-6 6" />
    </Icon>
  )
}

/** Sign out: a door, and the way out of it. */
export function ExitIcon({ size = 18, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <path d="M13 4H5v16h8" />
      <path d="M11 12h9" />
      <path d="M16 8l4 4-4 4" />
    </Icon>
  )
}

/** New chat: a pencil over a page. */
export function ComposeIcon({ size = 20, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 5H5v14h14v-7" />
      <path d="M15 4l5 5-8 8H8v-4z" />
    </Icon>
  )
}

/** History: a clock reading four o'clock, which is legible where 12:00 isn't. */
export function HistoryIcon({ size = 18, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v5l4 2" />
    </Icon>
  )
}

/** Good response. */
export function CheckIcon({ size = 16, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <path d="M5 13l4 4 10-10" />
    </Icon>
  )
}

/** Bad response, or close. */
export function CloseIcon({ size = 16, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </Icon>
  )
}

/** Knowledge Categories: sources, and what they connect to. */
export function NetworkIcon({ size = 20, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <circle cx="12" cy="5" r="2.5" />
      <circle cx="5" cy="18" r="2.5" />
      <circle cx="19" cy="18" r="2.5" />
      <path d="M10 7L7 16" />
      <path d="M14 7l3 9" />
      <path d="M8 18h8" />
    </Icon>
  )
}

/** New observation. */
export function PlusIcon({ size = 20, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Icon>
  )
}

/** Your vineyard data: rows in a block, read from above. */
export function GridIcon({ size = 20, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <rect x="4" y="4" width="16" height="16" />
      <path d="M9 4v16" />
      <path d="M15 4v16" />
    </Icon>
  )
}

/** Possible observations: the review queue. */
export function SearchIcon({ size = 20, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l4 4" />
    </Icon>
  )
}

/**
 * Attach a photo. Distinct from PictureIcon on purpose: one of these
 * takes a picture and the other opens the ones already saved, and the
 * old set used a single icon for both -- the same symbol in the compose
 * bar and in the features menu, meaning two different things.
 */
export function CameraIcon({ size = 20, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <path d="M3 8h4l2-3h6l2 3h4v11H3z" />
      <circle cx="12" cy="13" r="3.5" />
    </Icon>
  )
}

/** Shared artifacts: a picture that has been saved. */
export function PictureIcon({ size = 20, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <rect x="4" y="5" width="16" height="14" />
      <path d="M4 16l4-4 4 4 3-3 5 5" />
      <path d="M9 9.5h.01" strokeWidth={2.5} />
    </Icon>
  )
}
