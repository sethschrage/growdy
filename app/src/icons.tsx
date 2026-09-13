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
        <rect key={`leaf-${x}-${y}`} x={x} y={y} width={1} height={1} fill="#5b8c3e" />
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
