// The pixel art: the theme rather than the controls.
//
// Everything here is still hand-plotted 1x1 rects on a small grid, and
// stays that way on purpose. The clouds drifting behind the chat, the
// burger that unpacks itself into a menu bar and the sprout that is the
// app's own mark are the retro identity -- redrawing them as crisp
// vector shapes would be the same mistake as setting the wordmark in
// Helvetica. See ui/icons.tsx for the other half of that decision: the
// things a producer taps to do something got sharpened; these did not.
//
// The line between the two files is "is this a control, or is this the
// app's face". PixelSprout sits on both sides -- it is the mark, and it
// is also the button that opens the features menu -- and it stays here,
// because being the mark is the part that would be lost.

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

// Four growth stages of the same sprout -- seed, sprout, full stem, bloom --
// stacked and cross-faded by CSS (see .thinking-sprout-frame) instead of a
// generic dot pulse, so "the model is thinking" reads as something actually
// growing rather than a spinner borrowed from any other app.
const SPROUT_GROWTH_FRAMES: { cells: readonly (readonly [number, number])[]; fill: string }[][] = [
  [
    { cells: [[5, 8]], fill: '#3f6b29' },
    { cells: [[4, 8], [6, 8]], fill: '#6a9c40' },
  ],
  [
    { cells: [[5, 7], [5, 8]], fill: '#3f6b29' },
    { cells: [[4, 7], [6, 7]], fill: '#6a9c40' },
  ],
  [
    { cells: [[5, 5], [5, 6], [5, 7], [5, 8]], fill: '#3f6b29' },
    { cells: [[3, 6], [4, 6], [6, 6], [7, 6]], fill: '#6a9c40' },
  ],
  [
    { cells: [[5, 2], [5, 3], [5, 4], [5, 5], [5, 6], [5, 7], [5, 8]], fill: '#3f6b29' },
    { cells: [[3, 6], [4, 6], [6, 6], [7, 6]], fill: '#6a9c40' },
    { cells: [[4, 0], [6, 0], [4, 1], [6, 1], [5, 0]], fill: '#c1440e' },
    { cells: [[5, 1]], fill: '#f6d998' },
  ],
]

export function PixelSproutGrowth({ size = 20 }: { size?: number }) {
  return (
    <span className="thinking-sprout" style={{ width: size, height: size }} aria-hidden="true">
      {SPROUT_GROWTH_FRAMES.map((groups, i) => (
        <svg key={i} className="thinking-sprout-frame" viewBox="0 0 10 10" shapeRendering="crispEdges">
          {groups.map(({ cells, fill }) =>
            cells.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />),
          )}
        </svg>
      ))}
    </span>
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

// The burger's own rows, reused rather than redrawn: the closed icon's
// top and bottom buns become the menu's cap and its closing tap target,
// and the lettuce-and-cheese pair becomes the divider under the toggle.
// An earlier version turned each row into a column for a menu that
// spread sideways; the menu drops now, so the rows stay rows.
export function PixelBunRow({ width = 44, className }: { width?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={width}
      height={(width * 2) / 10}
      viewBox="0 0 10 2"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect x={0} y={0} width={10} height={1} fill={BURGER_ROWS[5].fill} />
      <rect x={1} y={1} width={8} height={1} fill={BURGER_ROWS[6].fill} />
    </svg>
  )
}

export function PixelToppingRow({ width = 36, className }: { width?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={width}
      height={(width * 2) / 10}
      viewBox="0 0 10 2"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect x={0} y={0} width={10} height={1} fill={BURGER_ROWS[2].fill} />
      <rect x={0} y={1} width={10} height={1} fill={BURGER_ROWS[3].fill} />
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
