'use client'

type BarItem = {
  label: string
  values: { value: number; color: string; label: string }[]
}

export function GroupedBarChart({
  items,
  unit = '×',
  height = 220,
}: {
  items: BarItem[]
  unit?: string
  height?: number
}) {
  const max = Math.max(0.01, ...items.flatMap((i) => i.values.map((v) => v.value)))
  const groupW = 56
  const gap = 28
  const width = Math.max(320, items.length * (groupW + gap) + 40)
  const padL = 36
  const padB = 52
  const padT = 16
  const innerH = height - padB - padT

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[520px] h-auto" role="img">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padT + innerH * (1 - t)
          return (
            <g key={t}>
              <line x1={padL} x2={width - 8} y1={y} y2={y} stroke="#27313B" strokeWidth="1" />
              <text x={4} y={y + 3} fill="#A9B8C6" fontSize="9">{(max * t).toFixed(t === 1 || t === 0 ? 0 : 1)}{unit}</text>
            </g>
          )
        })}
        {items.map((item, i) => {
          const x0 = padL + 12 + i * (groupW + gap)
          const barW = Math.max(8, (groupW - 8) / item.values.length)
          return (
            <g key={item.label}>
              {item.values.map((v, vi) => {
                const h = (v.value / max) * innerH
                const x = x0 + vi * (barW + 4)
                const y = padT + innerH - h
                return (
                  <g key={v.label}>
                    <rect x={x} y={y} width={barW} height={Math.max(2, h)} rx="4" fill={v.color} />
                    {h > 18 && (
                      <text x={x + barW / 2} y={y + 12} textAnchor="middle" fill="#061016" fontSize="9" fontWeight="700">
                        {v.value.toFixed(2)}
                      </text>
                    )}
                  </g>
                )
              })}
              <text
                x={x0 + groupW / 2 - 4}
                y={height - 8}
                textAnchor="middle"
                fill="#A9B8C6"
                fontSize="10"
              >
                {item.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function DualLineChart({
  points,
  aLabel,
  bLabel,
}: {
  points: { label: string; a: number; b: number }[]
  aLabel: string
  bLabel: string
}) {
  const height = 220
  const width = Math.max(480, points.length * 56 + 80)
  const pad = { l: 44, r: 16, t: 16, b: 40 }
  const innerW = width - pad.l - pad.r
  const innerH = height - pad.t - pad.b
  const max = Math.max(1, ...points.flatMap((p) => [p.a, p.b]))
  const x = (i: number) => pad.l + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const y = (v: number) => pad.t + innerH * (1 - v / max)
  const path = (key: 'a' | 'b') => points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p[key])}`).join(' ')
  const area = `M ${x(0)} ${y(0)} ${points.map((p, i) => `L ${x(i)} ${y(p.a)}`).join(' ')} L ${x(points.length - 1)} ${y(0)} Z`

  if (!points.length) {
    return <p className="text-sm text-[#A9B8C6] py-10 text-center">Log spend and return to draw this graph.</p>
  }

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[480px] h-auto" role="img">
        {[0, 0.5, 1].map((t) => {
          const yy = pad.t + innerH * (1 - t)
          return (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={yy} y2={yy} stroke="#27313B" />
              <text x={6} y={yy + 3} fill="#A9B8C6" fontSize="9">${Math.round((max * t) / 100).toLocaleString()}</text>
            </g>
          )
        })}
        <path d={area} fill="#53D6FF" opacity="0.12" />
        <path d={path('a')} fill="none" stroke="#53D6FF" strokeWidth="2.5" />
        <path d={path('b')} fill="none" stroke="#8DEBFF" strokeWidth="2.5" strokeDasharray="5 4" />
        {points.map((p, i) => (
          <g key={p.label}>
            <circle cx={x(i)} cy={y(p.a)} r="3.5" fill="#53D6FF" />
            <circle cx={x(i)} cy={y(p.b)} r="3.5" fill="#8DEBFF" />
            <text x={x(i)} y={height - 12} textAnchor="middle" fill="#A9B8C6" fontSize="9">{p.label}</text>
          </g>
        ))}
        <text x={pad.l} y={12} fill="#53D6FF" fontSize="10">{aLabel}</text>
        <text x={pad.l + 70} y={12} fill="#8DEBFF" fontSize="10">{bLabel}</text>
      </svg>
    </div>
  )
}

export function HorizontalBars({
  items,
  format = (n: number) => n.toLocaleString(),
}: {
  items: { label: string; sub?: string; value: number; color?: string }[]
  format?: (n: number) => string
}) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <div>
              <p className="text-sm text-[#F6FAFC]">{item.label}</p>
              {item.sub && <p className="text-[11px] text-[#A9B8C6]">{item.sub}</p>}
            </div>
            <p className="text-sm font-semibold text-[#8DEBFF] shrink-0">{format(item.value)}</p>
          </div>
          <div className="h-2.5 rounded-full bg-[#05070A] overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(4, (item.value / max) * 100)}%`, background: item.color || '#53D6FF' }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
