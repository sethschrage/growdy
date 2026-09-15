const SPROUT_LEAF_CELLS = [
  [6, 2],
  [5, 3],
  [6, 3],
  [7, 3],
  [2, 4],
  [1, 5],
  [2, 5],
  [3, 5],
  [4, 5],
  [2, 6],
] as const

const SPROUT_STEM_CELLS = [
  [5, 4],
  [5, 5],
  [5, 6],
  [5, 7],
  [5, 8],
] as const

export function PixelSprout({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" shapeRendering="crispEdges" aria-hidden="true">
      {SPROUT_LEAF_CELLS.map(([x, y]) => (
        <rect key={`leaf-${x}-${y}`} x={x} y={y} width={1} height={1} fill="#6a9c40" />
      ))}
      {SPROUT_STEM_CELLS.map(([x, y]) => (
        <rect key={`stem-${x}-${y}`} x={x} y={y} width={1} height={1} fill="#3f6b29" />
      ))}
    </svg>
  )
}

const CLOUD_ROWS = [
  [5, 0, 4],
  [3, 1, 8],
  [1, 2, 12],
  [1, 3, 12],
  [3, 4, 8],
] as const

export function PixelCloud({
  width,
  top,
  left,
  duration,
}: {
  width: number
  top: string
  left: string
  duration: string
}) {
  return (
    <svg
      className="cloud"
      width={width}
      height={(width / 14) * 5}
      viewBox="0 0 14 5"
      shapeRendering="crispEdges"
      style={{ top, left, animationDuration: duration }}
      aria-hidden="true"
    >
      {CLOUD_ROWS.map(([x, y, w], i) => (
        <rect key={i} x={x} y={y} width={w} height={1} fill="#fff8ea" />
      ))}
    </svg>
  )
}

const ARROW_CELLS = [
  [1, 0],
  [1, 1],
  [2, 1],
  [1, 2],
  [2, 2],
  [3, 2],
  [1, 3],
  [2, 3],
  [3, 3],
  [4, 3],
  [1, 4],
  [2, 4],
  [3, 4],
  [1, 5],
  [2, 5],
  [1, 6],
] as const

export function PixelArrow({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden="true">
      {ARROW_CELLS.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
      ))}
    </svg>
  )
}

const BURGER_ROWS = [
  { y: 0, x: 2, w: 6, fill: '#e8a33d' },
  { y: 1, x: 0, w: 10, fill: '#e8a33d' },
  { y: 2, x: 0, w: 10, fill: '#7cb342' },
  { y: 3, x: 0, w: 10, fill: '#f4c542' },
  { y: 4, x: 0, w: 10, fill: '#6b3f2a' },
  { y: 5, x: 0, w: 10, fill: '#e8a33d' },
  { y: 6, x: 1, w: 8, fill: '#e8a33d' },
] as const

export function PixelBurger({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={(size * 7) / 10} viewBox="0 0 10 7" shapeRendering="crispEdges" aria-hidden="true">
      {BURGER_ROWS.map(({ y, x, w, fill }) => (
        <rect key={y} x={x} y={y} width={w} height={1} fill={fill} />
      ))}
    </svg>
  )
}

// These two reuse BURGER_ROWS's own geometry rather than drawing new
// shapes -- each row becomes a column (row index -> new x, row's x/width
// span -> new y-range), turning the closed icon's horizontal layers into
// vertical ones for the open menu bar.
const BUN_ROW_COLOR = BURGER_ROWS[0].fill

export function PixelBunSlice({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 7 10" shapeRendering="crispEdges" aria-hidden="true">
      {BURGER_ROWS.map(({ y, x, w }) => (
        <rect key={y} x={y} y={x} width={1} height={w} fill={BUN_ROW_COLOR} />
      ))}
    </svg>
  )
}

const TOPPING_ROWS = BURGER_ROWS.filter((row) => row.y === 2 || row.y === 3)

export function PixelToppingSlice({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 2 10" shapeRendering="crispEdges" aria-hidden="true">
      {TOPPING_ROWS.map(({ y, x, w, fill }) => (
        <rect key={y} x={y - 2} y={x} width={1} height={w} fill={fill} />
      ))}
    </svg>
  )
}

const EXIT_CELLS = [
  [0, 0],
  [1, 0],
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [0, 5],
  [0, 6],
  [1, 6],
  [2, 3],
  [3, 3],
  [4, 3],
  [4, 2],
  [4, 4],
  [5, 3],
] as const

export function PixelExit({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden="true">
      {EXIT_CELLS.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
      ))}
    </svg>
  )
}

const COMPOSE_CELLS = [
  // square outline, open at top-right where the badge takes over
  [1, 4],
  [2, 4],
  [3, 4],
  [4, 4],
  [5, 4],
  [0, 5],
  [0, 6],
  [0, 7],
  [0, 8],
  [0, 9],
  [1, 10],
  [2, 10],
  [3, 10],
  [4, 10],
  [5, 10],
  [6, 10],
  [7, 6],
  [7, 7],
  [7, 8],
  [7, 9],
  // plus-in-circle badge breaking the top-right corner
  [6, 0],
  [7, 0],
  [8, 0],
  [5, 1],
  [9, 1],
  [4, 2],
  [10, 2],
  [4, 3],
  [10, 3],
  [10, 4],
  [5, 5],
  [9, 5],
  [6, 6],
  [7, 2],
  [6, 3],
  [7, 3],
  [8, 3],
  [7, 4],
] as const

export function PixelCompose({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 11 11" shapeRendering="crispEdges" aria-hidden="true">
      {COMPOSE_CELLS.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
      ))}
    </svg>
  )
}

const HISTORY_CELLS = [
  [2, 0],
  [3, 0],
  [4, 0],
  [1, 1],
  [5, 1],
  [0, 2],
  [6, 2],
  [0, 3],
  [6, 3],
  [0, 4],
  [6, 4],
  [1, 5],
  [5, 5],
  [2, 6],
  [3, 6],
  [4, 6],
  [3, 1],
  [3, 2],
  [3, 3],
  [4, 3],
] as const

export function PixelHistory({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden="true">
      {HISTORY_CELLS.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
      ))}
    </svg>
  )
}

const CHECK_CELLS = [
  [0, 3],
  [1, 4],
  [1, 5],
  [2, 6],
  [3, 5],
  [3, 4],
  [4, 3],
  [5, 2],
  [5, 1],
  [6, 0],
] as const

export function PixelCheck({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden="true">
      {CHECK_CELLS.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#fff" />
      ))}
    </svg>
  )
}

const X_CELLS = [
  [0, 0],
  [1, 1],
  [2, 2],
  [3, 3],
  [4, 4],
  [5, 5],
  [6, 6],
  [6, 0],
  [5, 1],
  [4, 2],
  [2, 4],
  [1, 5],
  [0, 6],
] as const

export function PixelX({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden="true">
      {X_CELLS.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#fff" />
      ))}
    </svg>
  )
}

// Three connected nodes -- the menu icon for the Knowledge Categories
// screen, docs/decisions/0019 -- reading as "connections" rather than a
// literal book. Two earlier book designs (a closed spine+cover, then an
// open-book wedge) both stopped reading clearly at actual button size.
// Deliberately not an X-crossing or checkmark shape, since those already
// mean "negative"/"positive" feedback elsewhere in this icon set --
// three nodes branching from one point avoids that collision while still
// reading as "linked together" at 18px.
const NETWORK_CELLS = [
  [3, 0],
  [4, 0],
  [5, 0],
  [3, 1],
  [4, 1],
  [5, 1],
  [3, 2],
  [4, 2],
  [5, 2],
  [4, 3],
  [3, 4],
  [4, 4],
  [5, 4],
  [2, 5],
  [6, 5],
  [0, 6],
  [1, 6],
  [2, 6],
  [6, 6],
  [7, 6],
  [8, 6],
  [0, 7],
  [1, 7],
  [2, 7],
  [6, 7],
  [7, 7],
  [8, 7],
  [0, 8],
  [1, 8],
  [2, 8],
  [6, 8],
  [7, 8],
  [8, 8],
] as const

export function PixelNetwork({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 9 9" shapeRendering="crispEdges" aria-hidden="true">
      {NETWORK_CELLS.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
      ))}
    </svg>
  )
}

const PLUS_CELLS = [
  [3, 0],
  [3, 1],
  [3, 2],
  [0, 3],
  [1, 3],
  [2, 3],
  [3, 3],
  [4, 3],
  [5, 3],
  [6, 3],
  [3, 4],
  [3, 5],
  [3, 6],
] as const

// The sprout menu's "new observation" button -- a plain plus, same thin
// single-cell-wide-line treatment as PixelCheck/PixelX rather than a
// pin/waypoint glyph, which didn't read clearly at this grid size.
export function PixelPlus({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden="true">
      {PLUS_CELLS.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
      ))}
    </svg>
  )
}

const GRID_CELLS = [
  [0, 1],
  [3, 1],
  [6, 1],
  [0, 3],
  [3, 3],
  [6, 3],
  [0, 5],
  [3, 5],
  [6, 5],
] as const

// The sprout menu's "your vineyard data" button -- rows of dots reading as
// planted positions in a row, distinct from PixelNetwork's Knowledge
// Categories (external reference sources) -- this is the producer's own
// internal parcel/plot/row/planting data.
export function PixelGrid({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden="true">
      {GRID_CELLS.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
      ))}
    </svg>
  )
}
