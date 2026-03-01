interface HoneycombLogoProps {
  size?: number
  className?: string
  color?: string
  strokeWidth?: number
}

export default function HoneycombLogo({
  size = 32,
  className,
  color = 'currentColor',
  strokeWidth = 1.6,
}: HoneycombLogoProps) {
  // 3-cell honeycomb cluster: two hexagons on top, one centered below
  // Each hexagon has radius ~7, arranged in a tight cluster
  const r = 7
  const h = r * Math.sqrt(3) / 2 // ~6.06

  // Hex center positions
  const hexes = [
    { cx: 13, cy: 8 },   // top-left
    { cx: 25, cy: 8 },   // top-right
    { cx: 19, cy: 8 + h * 2 }, // bottom-center
  ]

  const hexPoints = (cx: number, cy: number) => {
    return [0, 1, 2, 3, 4, 5]
      .map(i => {
        const angle = (Math.PI / 3) * i - Math.PI / 2
        const x = cx + r * Math.cos(angle)
        const y = cy + r * Math.sin(angle)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 38 28"
      width={size}
      height={size * 0.74}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {hexes.map((hex, i) => (
        <polygon key={i} points={hexPoints(hex.cx, hex.cy)} />
      ))}
    </svg>
  )
}
