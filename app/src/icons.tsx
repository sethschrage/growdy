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

export function PixelPlus({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden="true">
      {PLUS_CELLS.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
      ))}
    </svg>
  )
}

const QUESTION_CELLS = [
  [1, 0],
  [2, 0],
  [3, 0],
  [0, 1],
  [4, 1],
  [4, 2],
  [3, 3],
  [2, 4],
  [2, 6],
] as const

export function PixelQuestion({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={(size * 7) / 5} viewBox="0 0 5 7" shapeRendering="crispEdges" aria-hidden="true">
      {QUESTION_CELLS.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
      ))}
    </svg>
  )
}

const LEAF_CELLS = [
  [3, 0],
  [2, 1],
  [3, 1],
  [4, 1],
  [2, 2],
  [3, 2],
  [4, 2],
  [1, 3],
  [2, 3],
  [3, 3],
  [4, 3],
  [5, 3],
  [2, 4],
  [3, 4],
  [4, 4],
  [2, 5],
  [3, 5],
  [4, 5],
  [3, 6],
] as const

export function PixelLeaf({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden="true">
      {LEAF_CELLS.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
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

const NEW_CHAT_CELLS = [
  [0, 0],
  [1, 0],
  [2, 0],
  [3, 0],
  [4, 0],
  [5, 0],
  [6, 0],
  [0, 6],
  [1, 6],
  [2, 6],
  [3, 6],
  [4, 6],
  [5, 6],
  [6, 6],
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [0, 5],
  [6, 1],
  [6, 2],
  [6, 3],
  [6, 4],
  [6, 5],
] as const

export function PixelNewChat({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden="true">
      {NEW_CHAT_CELLS.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
      ))}
    </svg>
  )
}
