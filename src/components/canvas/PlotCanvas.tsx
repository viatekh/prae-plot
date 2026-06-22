import { useRef, useEffect, useCallback, useState } from 'react'
import { Stage, Layer, Rect, Ellipse, Line, Circle, Text, Image as KonvaImage, Group, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useProjectStore } from '../../store/projectStore'
import { generateId } from '../../lib/utils'
import type {
  AnyElement, PlacedFixture, RectElement, EllipseElement, PolygonElement, TrussElement, TextElement, CableElement, Distro,
} from '../../types'
import { CABLE_COLORS } from '../../types'
import { SYMBOL_RADIUS, defaultSymbolColors } from '../../lib/symbols'

const BASE_PX = 50
const MIN_SCALE = 0.1
const MAX_SCALE = 8
const CABLE_SNAP_RADIUS = 0.6 // metres

const UNIVERSE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#f97316', '#84cc16']

// Module-level ref so EditorPage can grab the stage image without prop-drilling
let _getStageDataURL: (() => string) | null = null
export function getPlotDataURL(): string {
  return _getStageDataURL?.() ?? ''
}

function snapValue(v: number, grid: number, snap: boolean): number {
  if (!snap) return v
  return Math.round(v / grid) * grid
}

// ── Grid ──────────────────────────────────────────────────────

function GridLayer({ width, height, view, gridSize }: {
  width: number; height: number
  view: { scale: number; x: number; y: number }; gridSize: number
}) {
  const step = gridSize * BASE_PX
  const worldLeft  = Math.max(0, -view.x / view.scale)
  const worldTop   = Math.max(0, -view.y / view.scale)
  const worldRight  = (width  - view.x) / view.scale
  const worldBottom = (height - view.y) / view.scale

  // Clamp start to 0 — no negative grid
  const startX = Math.max(0, Math.floor(worldLeft / step) * step)
  const startY = Math.max(0, Math.floor(worldTop  / step) * step)

  const minor: React.ReactElement[] = []
  const major: React.ReactElement[] = []

  for (let x = startX; x <= worldRight; x += step) {
    const isMajor = x % (step * 5) < 0.5
    const arr = isMajor ? major : minor
    arr.push(<Line key={`vx${x}`}
      points={[x, worldTop, x, worldBottom]}
      stroke={isMajor ? '#d1d5db' : '#f1f5f9'}
      strokeWidth={(isMajor ? 0.5 : 0.25) / view.scale}
      listening={false} />)
  }
  for (let y = startY; y <= worldBottom; y += step) {
    const isMajor = y % (step * 5) < 0.5
    const arr = isMajor ? major : minor
    arr.push(<Line key={`vy${y}`}
      points={[worldLeft, y, worldRight, y]}
      stroke={isMajor ? '#d1d5db' : '#f1f5f9'}
      strokeWidth={(isMajor ? 0.5 : 0.25) / view.scale}
      listening={false} />)
  }

  // Origin corner marker — thick L-shaped lines at (0,0)
  const mk = 8 / view.scale
  const mw = 1.2 / view.scale
  const originLines = [
    <Line key='ox' points={[0, 0, mk * 3, 0]} stroke='#64748b' strokeWidth={mw} listening={false} />,
    <Line key='oy' points={[0, 0, 0, mk * 3]} stroke='#64748b' strokeWidth={mw} listening={false} />,
  ]

  return <Layer listening={false}>{minor}{major}{originLines}</Layer>
}

// ── Fixture symbol ────────────────────────────────────────────

function FixtureSymbol({ fixture, selected, scale, showUniverseColors, draggable, onClick, onDragEnd }: {
  fixture: PlacedFixture; selected: boolean; scale: number; showUniverseColors: boolean; draggable: boolean
  onClick: (e: KonvaEventObject<MouseEvent>) => void
  onDragEnd: (id: string, x: number, y: number) => void
}) {
  const colors = defaultSymbolColors[fixture.symbol]
  const r = SYMBOL_RADIUS / scale
  const strokeColor = selected ? '#f97316' : colors.stroke
  const x = fixture.x * BASE_PX
  const y = fixture.y * BASE_PX

  const addrLabel = `${fixture.universe}.${String(fixture.address).padStart(3, '0')}`

  // ── Theatrical / architectural symbols ──────────────────────────────────────
  // Conventions matching industry standard (Capture/Vectorworks/Cast):
  //   White fill = fixture body (clean, readable)
  //   Thick outer circle = housing
  //   Inner geometry = fixture type identifier
  //   Beam direction = upward (rotated by fixture.rotation)
  const renderBody = () => {
    const lw  = 1.2 / scale   // body line weight
    const lw2 = 2.0 / scale   // housing outline
    const white = '#ffffff'
    const accent = strokeColor  // selected = orange, normal = type colour

    switch (fixture.symbol) {

      // MOVING HEAD WASH — bullseye: thick outer ring, inner ring, 4 radial ticks
      case 'wash': return (<>
        <Circle radius={r} fill={white} stroke={accent} strokeWidth={lw2} />
        <Circle radius={r * 0.52} fill={colors.fill + '55'} stroke={accent} strokeWidth={lw} />
        <Circle radius={r * 0.18} fill={accent} />
        {[0, 90, 180, 270].map((a) => {
          const rad = a * Math.PI / 180
          return <Line key={a}
            points={[Math.cos(rad)*r*0.56, Math.sin(rad)*r*0.56,
                     Math.cos(rad)*r*0.92, Math.sin(rad)*r*0.92]}
            stroke={accent} strokeWidth={lw} />
        })}
      </>)

      // MOVING HEAD SPOT — circle + full crosshair + beam triangle
      case 'spot': return (<>
        <Circle radius={r} fill={white} stroke={accent} strokeWidth={lw2} />
        {/* Cross inside (gobo slot) */}
        <Line points={[-r*0.7, 0, r*0.7, 0]} stroke={accent} strokeWidth={lw} />
        <Line points={[0, -r*0.7, 0, r*0.7]} stroke={accent} strokeWidth={lw} />
        {/* Beam triangle above (direction indicator) */}
        <Line points={[-r*0.55, -r*0.85, 0, -r*1.85, r*0.55, -r*0.85]}
          closed fill={colors.fill + '44'} stroke={accent} strokeWidth={lw} />
      </>)

      // MOVING HEAD BEAM — small tight circle + narrow converging beam lines
      case 'beam': return (<>
        <Circle radius={r * 0.62} fill={white} stroke={accent} strokeWidth={lw2} />
        <Circle radius={r * 0.22} fill={accent} />
        {/* Narrow beam — lines converge to a point above */}
        <Line points={[-r*0.42, -r*0.62, 0, -r*2.1, r*0.42, -r*0.62]}
          stroke={accent} strokeWidth={lw} />
        <Line points={[-r*0.42, -r*0.62, r*0.42, -r*0.62]}
          stroke={accent} strokeWidth={lw} />
      </>)

      // PAR CAN — circle with 3 horizontal hatch lines (parabolic reflector lines)
      case 'par': return (<>
        <Circle radius={r} fill={white} stroke={accent} strokeWidth={lw2} />
        {([-0.42, 0, 0.42] as number[]).map((yOff) => {
          const hw = Math.sqrt(Math.max(0, r*r - (yOff*r)**2)) * 0.85
          return <Line key={yOff} points={[-hw, yOff*r, hw, yOff*r]} stroke={accent} strokeWidth={lw} />
        })}
      </>)

      // STROBE / BLINDER — wide flat rectangle, 3 vertical flash lines
      case 'strobe': return (<>
        <Rect x={-r*1.15} y={-r*0.52} width={r*2.3} height={r*1.04}
          fill={white} stroke={accent} strokeWidth={lw2} cornerRadius={2/scale} />
        {([-r*0.42, 0, r*0.42] as number[]).map((xOff) => (
          <Line key={xOff} points={[xOff, -r*0.28, xOff, r*0.28]}
            stroke={accent} strokeWidth={lw2} />
        ))}
      </>)

      // FRESNEL / FLOOD — circle with concentric ring + wide trapezoid beam
      case 'flood': return (<>
        <Circle radius={r} fill={white} stroke={accent} strokeWidth={lw2} />
        <Circle radius={r*0.48} fill={colors.fill + '44'} stroke={accent} strokeWidth={lw} />
        {/* Wide beam trapezoid above */}
        <Line points={[-r*0.72, -r*0.9, -r*1.6, -r*2.1, r*1.6, -r*2.1, r*0.72, -r*0.9]}
          stroke={accent} strokeWidth={lw} fill='transparent' />
      </>)

      // LED PIXEL BAR — thin horizontal rectangle, evenly spaced dots
      case 'pixel': return (<>
        <Rect x={-r*1.6} y={-r*0.48} width={r*3.2} height={r*0.96}
          fill={white} stroke={accent} strokeWidth={lw2} cornerRadius={2/scale} />
        {([-1.05, -0.35, 0.35, 1.05] as number[]).map((xOff) => (
          <Circle key={xOff} x={xOff*r} radius={3/scale}
            fill={colors.fill} stroke={accent} strokeWidth={0.5/scale} />
        ))}
      </>)

      // OTHER — circle with X
      default: return (<>
        <Circle radius={r} fill={white} stroke={accent} strokeWidth={lw2} />
        <Line points={[-r*0.55, -r*0.55, r*0.55, r*0.55]} stroke={accent} strokeWidth={lw} />
        <Line points={[ r*0.55, -r*0.55,-r*0.55, r*0.55]} stroke={accent} strokeWidth={lw} />
      </>)
    }
  }

  return (
    <Group
      id={fixture.id}
      x={x} y={y} rotation={fixture.rotation} draggable={draggable}
      onClick={onClick}
      onDragEnd={(e) => onDragEnd(fixture.id, e.target.x() / BASE_PX, e.target.y() / BASE_PX)}
      onTransformEnd={(e) => {
        const node = e.target
        useProjectStore.getState().updateFixture(fixture.id, { rotation: node.rotation() })
        node.scaleX(1); node.scaleY(1)
      }}
    >
      {renderBody()}
      {/* Universe color ring */}
      {showUniverseColors && <Circle radius={r + 4 / scale} fill='transparent' stroke={UNIVERSE_COLORS[(fixture.universe - 1) % UNIVERSE_COLORS.length]} strokeWidth={2 / scale} listening={false} />}
      {/* CH above symbol */}
      {fixture.channel > 0 && <Text x={-22 / scale} y={-r - 18 / scale} width={44 / scale} text={String(fixture.channel)} fontSize={10 / scale} fontFamily='monospace' fill='#1f2937' fontStyle='bold' align='center' listening={false} />}
      {/* DMX address below symbol */}
      <Text x={-26 / scale} y={r + 3 / scale} width={52 / scale} text={addrLabel} fontSize={8 / scale} fontFamily='monospace' fill='#6b7280' align='center' listening={false} />
      {/* Label further below */}
      {fixture.label && <Text x={-26 / scale} y={r + 14 / scale} width={52 / scale} text={fixture.label} fontSize={8 / scale} fontFamily='monospace' fill='#374151' align='center' listening={false} />}
    </Group>
  )
}

// ── Stage element ─────────────────────────────────────────────

function StageElementNode({ el, selected, scale, onClick, onDragEnd }: {
  el: AnyElement; selected: boolean; scale: number
  onClick: (e: KonvaEventObject<MouseEvent>) => void
  onDragEnd: (id: string, x: number, y: number) => void
}) {
  const sw = (selected ? 2 : 1) / scale
  const stroke = selected ? '#f97316' : (el.stroke || '#374151')

  // Resolved fill: empty string → transparent
  const resolvedFill = (raw: string | undefined, fallback: string) =>
    raw === '' || raw === 'transparent' ? 'transparent' : (raw || fallback)

  if (el.type === 'rect') {
    const re = el as RectElement
    const cx = re.x * BASE_PX + (re.width * BASE_PX) / 2
    const cy = re.y * BASE_PX + (re.height * BASE_PX) / 2
    return (
      <Group id={re.id} rotation={re.rotation} x={0} y={0} draggable={!re.locked} onClick={onClick}
        onDragEnd={(e) => { onDragEnd(re.id, re.x + e.target.x() / BASE_PX, re.y + e.target.y() / BASE_PX); e.target.x(0); e.target.y(0) }}
        onTransformEnd={(e) => {
          const node = e.target as Konva.Node
          useProjectStore.getState().updateElement(re.id, {
            x: (re.x * BASE_PX + node.x()) / BASE_PX, y: (re.y * BASE_PX + node.y()) / BASE_PX,
            width: Math.max(0.1, (re.width * BASE_PX * node.scaleX()) / BASE_PX),
            height: Math.max(0.1, (re.height * BASE_PX * node.scaleY()) / BASE_PX),
            rotation: node.rotation(),
          } as Partial<RectElement>)
          node.x(0); node.y(0); node.scaleX(1); node.scaleY(1)
        }}
      >
        <Rect
          id={re.id}
          x={re.x * BASE_PX} y={re.y * BASE_PX}
          width={re.width * BASE_PX} height={re.height * BASE_PX}
          rotation={re.rotation}
          fill={resolvedFill(re.fill, '#d1d5db')} stroke={stroke} strokeWidth={sw}
        />
        {re.label && <Text x={cx} y={cy} text={re.label} fontSize={11 / scale} fontFamily='sans-serif' fill='#374151' align='center' offsetX={re.label.length * 3 / scale} listening={false} />}
      </Group>
    )
  }
  if (el.type === 'ellipse') {
    const ee = el as EllipseElement
    return (
      <Group id={ee.id} draggable={!ee.locked} onClick={onClick}
        onDragEnd={(e) => { onDragEnd(ee.id, ee.x + e.target.x() / BASE_PX, ee.y + e.target.y() / BASE_PX); e.target.x(0); e.target.y(0) }}
        onTransformEnd={(e) => {
          const node = e.target as Konva.Node
          useProjectStore.getState().updateElement(ee.id, {
            x: (ee.x * BASE_PX + node.x()) / BASE_PX, y: (ee.y * BASE_PX + node.y()) / BASE_PX,
            radiusX: Math.max(0.1, (ee.radiusX * BASE_PX * node.scaleX()) / BASE_PX),
            radiusY: Math.max(0.1, (ee.radiusY * BASE_PX * node.scaleY()) / BASE_PX),
            rotation: node.rotation(),
          } as Partial<EllipseElement>)
          node.x(0); node.y(0); node.scaleX(1); node.scaleY(1)
        }}
      >
        <Ellipse
          id={ee.id}
          x={ee.x * BASE_PX} y={ee.y * BASE_PX}
          radiusX={ee.radiusX * BASE_PX} radiusY={ee.radiusY * BASE_PX}
          rotation={ee.rotation}
          fill={resolvedFill(ee.fill, '#d1d5db')} stroke={stroke} strokeWidth={sw}
        />
        {ee.label && <Text x={ee.x * BASE_PX} y={ee.y * BASE_PX} text={ee.label} fontSize={11 / scale} fontFamily='sans-serif' fill='#374151' align='center' offsetX={ee.label.length * 3 / scale} listening={false} />}
      </Group>
    )
  }
  if (el.type === 'polygon') {
    const pe = el as PolygonElement
    const pts = pe.points.map((v, i) => i % 2 === 0 ? v * BASE_PX + pe.x * BASE_PX : v * BASE_PX + pe.y * BASE_PX)
    const cx = (Math.max(...pts.filter((_,i)=>i%2===0)) + Math.min(...pts.filter((_,i)=>i%2===0)))/2
    const cy = (Math.max(...pts.filter((_,i)=>i%2!==0)) + Math.min(...pts.filter((_,i)=>i%2!==0)))/2
    return (
      <Group draggable={!pe.locked} onClick={onClick} onDragEnd={(e) => { const dx = e.target.x() / BASE_PX; const dy = e.target.y() / BASE_PX; onDragEnd(pe.id, pe.x + dx, pe.y + dy); e.target.x(0); e.target.y(0) }}>
        <Line id={pe.id} points={pts} closed fill={resolvedFill(pe.fill, '#d1d5db')} stroke={stroke} strokeWidth={sw} />
        {pe.label && <Text x={cx} y={cy} text={pe.label} fontSize={11/scale} fontFamily='sans-serif' fill='#374151' align='center' offsetX={pe.label.length*3/scale} listening={false} />}
      </Group>
    )
  }
  if (el.type === 'truss') {
    const te = el as TrussElement
    const x1 = te.x * BASE_PX; const y1 = te.y * BASE_PX
    const x2 = te.x2 * BASE_PX; const y2 = te.y2 * BASE_PX
    const cx = (x1 + x2) / 2; const cy = (y1 + y2) / 2
    const length = Math.sqrt((te.x2 - te.x) ** 2 + (te.y2 - te.y) ** 2)
    return (
      <Group draggable={!te.locked} onClick={onClick} onDragEnd={(e) => { const dx = e.target.x() / BASE_PX; const dy = e.target.y() / BASE_PX; onDragEnd(te.id, te.x + dx, te.y + dy); e.target.x(0); e.target.y(0) }}>
        <Line points={[x1, y1, x2, y2]} stroke={stroke} strokeWidth={(selected ? 5 : 4) / scale} lineCap='round' hitStrokeWidth={20 / scale} />
        {Array.from({ length: Math.floor(length / 0.5) + 1 }).map((_, i) => {
          const t = (i * 0.5) / length; if (t > 1) return null
          const hx = x1 + (x2 - x1) * t; const hy = y1 + (y2 - y1) * t
          const angle = Math.atan2(y2 - y1, x2 - x1)
          const dx = Math.sin(angle) * 4 / scale; const dy = -Math.cos(angle) * 4 / scale
          return <Line key={i} points={[hx - dx, hy - dy, hx + dx, hy + dy]} stroke={stroke} strokeWidth={1.5 / scale} listening={false} />
        })}
        <Text x={cx + 5 / scale} y={cy - 14 / scale} text={`${length.toFixed(2)}m`} fontSize={9 / scale} fontFamily='monospace' fill='#374151' listening={false} />
        {te.label && <Text x={cx + 5 / scale} y={cy + 2 / scale} text={te.label} fontSize={9 / scale} fontFamily='monospace' fill='#374151' listening={false} />}
      </Group>
    )
  }
  if (el.type === 'cable') {
    const ce = el as CableElement
    const color = CABLE_COLORS[ce.cableType] ?? '#9ca3af'
    const allPts = [
      { x: ce.x, y: ce.y },
      ...(ce.waypoints ?? []),
      { x: ce.x2, y: ce.y2 },
    ]
    const konvaPts = allPts.flatMap((p) => [p.x * BASE_PX, p.y * BASE_PX])
    // Total length — sum of segment distances
    let length = 0
    for (let i = 1; i < allPts.length; i++) {
      length += Math.sqrt((allPts[i].x - allPts[i - 1].x) ** 2 + (allPts[i].y - allPts[i - 1].y) ** 2)
    }
    // Mid-point for label
    const midIdx = Math.floor(allPts.length / 2)
    const midP = allPts[midIdx]
    return (
      <Group draggable={!ce.locked} onClick={onClick} onDragEnd={(e) => { const dx = e.target.x() / BASE_PX; const dy = e.target.y() / BASE_PX; onDragEnd(ce.id, ce.x + dx, ce.y + dy); e.target.x(0); e.target.y(0) }}>
        <Line points={konvaPts} stroke={selected ? '#f97316' : color} strokeWidth={(selected ? 2.5 : 2) / scale} dash={[8 / scale, 4 / scale]} lineCap='round' lineJoin='round' hitStrokeWidth={16 / scale} />
        {allPts.map((p, i) => (
          <Circle key={i} x={p.x * BASE_PX} y={p.y * BASE_PX} radius={i === 0 || i === allPts.length - 1 ? 3 / scale : 2 / scale} fill={i > 0 && i < allPts.length - 1 ? 'white' : color} stroke={color} strokeWidth={1 / scale} listening={false} />
        ))}
        <Text x={midP.x * BASE_PX + 3 / scale} y={midP.y * BASE_PX - 12 / scale}
          text={[ce.autoLabel, ce.annotation, `${length.toFixed(1)}m`].filter(Boolean).join(' · ')}
          fontSize={8 / scale} fontFamily='monospace' fill={color} listening={false} />
      </Group>
    )
  }
  if (el.type === 'text') {
    const txe = el as TextElement
    return (
      <Text
        id={txe.id}
        x={txe.x * BASE_PX} y={txe.y * BASE_PX}
        text={txe.text} fontSize={(txe.fontSize || 14) / scale}
        fontFamily='sans-serif' fill={txe.fill || '#1f2937'}
        rotation={txe.rotation}
        draggable={!txe.locked} onClick={onClick}
        onDragEnd={(e) => onDragEnd(txe.id, e.target.x() / BASE_PX, e.target.y() / BASE_PX)}
        onTransformEnd={(e) => {
          const node = e.target as Konva.Text
          useProjectStore.getState().updateElement(txe.id, {
            x: node.x() / BASE_PX,
            y: node.y() / BASE_PX,
            fontSize: Math.max(6, (txe.fontSize || 14) * node.scaleX()),
            rotation: node.rotation(),
          } as Partial<TextElement>)
          node.scaleX(1); node.scaleY(1)
        }}
      />
    )
  }
  return null
}

// ── Background image ──────────────────────────────────────────

function BackgroundImageLayer({ img }: { img: NonNullable<ReturnType<typeof useProjectStore.getState>['project']>['backgroundImage'] }) {
  const [konvaImg, setKonvaImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!img) return
    const i = new window.Image()
    i.src = img.src
    i.onload = () => setKonvaImg(i)
  }, [img?.src])
  if (!img || !konvaImg || img.visible === false) return null
  return (
    <Layer listening={false}>
      <KonvaImage image={konvaImg} x={img.x * BASE_PX} y={img.y * BASE_PX} width={img.width * BASE_PX} height={img.height * BASE_PX} rotation={img.rotation} opacity={img.opacity} />
    </Layer>
  )
}

// ── Distro node ───────────────────────────────────────────────

function DistroNode({ distro, scale, activeTool, onCableClick, onSelectClick }: {
  distro: Distro; scale: number; activeTool: string
  onCableClick: (d: Distro) => void
  onSelectClick: (d: Distro, shift: boolean) => void
}) {
  const W = 90 / scale
  const H = 54 / scale
  const px = (distro.x ?? 0) * BASE_PX
  const py = (distro.y ?? 0) * BASE_PX
  return (
    <Group
      x={px} y={py}
      draggable={activeTool === 'select'}
      onClick={(e) => {
        e.cancelBubble = true
        if (activeTool === 'cable') { onCableClick(distro) }
        else if (activeTool === 'select') { onSelectClick(distro, e.evt.shiftKey) }
      }}
      onDragEnd={(e) => {
        useProjectStore.getState().updateDistro(distro.id, {
          x: e.target.x() / BASE_PX,
          y: e.target.y() / BASE_PX,
        })
        e.target.x(0); e.target.y(0)
      }}
    >
      <Rect x={-W / 2} y={-H / 2} width={W} height={H} fill='#dc2626' stroke='#991b1b' strokeWidth={2 / scale} cornerRadius={3 / scale} />
      <Text x={-W / 2 + 4 / scale} y={-H / 2 + 5 / scale} text={distro.name} width={W - 8 / scale} fontSize={8 / scale} fontFamily='monospace' fontStyle='bold' fill='white' listening={false} />
      <Text x={-W / 2 + 4 / scale} y={-H / 2 + 17 / scale} text={`${distro.incomingRating}A · ${distro.phases}Ø`} fontSize={7 / scale} fontFamily='monospace' fill='#fecaca' listening={false} />
      <Text x={-W / 2 + 4 / scale} y={-H / 2 + 28 / scale} text={`${distro.circuits.length} way${distro.circuits.length !== 1 ? 's' : ''}`} fontSize={7 / scale} fontFamily='monospace' fill='#fecaca' listening={false} />
      {/* Power bolt icon */}
      <Text x={W / 2 - 16 / scale} y={-H / 2 + 4 / scale} text='⚡' fontSize={10 / scale} fill='rgba(255,255,255,0.6)' listening={false} />
    </Group>
  )
}

// ── Device node ───────────────────────────────────────────────

const DEVICE_ICONS: Record<string, string> = {
  'console':       '🎚',
  'dimmer-rack':   '⬛',
  'media-server':  '💻',
  'network-switch':'🔀',
  'dmx-splitter':  '⑂',
  'power-splitter':'⑂',
  'amplifier':     '🔊',
  'other':         '◻',
}
const DEVICE_COLORS: Record<string, string> = {
  'console':       '#1d4ed8',
  'dimmer-rack':   '#374151',
  'media-server':  '#0f766e',
  'network-switch':'#0369a1',
  'dmx-splitter':  '#7c3aed',
  'power-splitter':'#b45309',
  'amplifier':     '#0f766e',
  'other':         '#6b7280',
}

function DeviceNode({ device, scale, activeTool, selected, onSelectClick, onCableClick }: {
  device: import('../../types').Device; scale: number; activeTool: string; selected: boolean
  onSelectClick: (d: import('../../types').Device, shift: boolean) => void
  onCableClick: (d: import('../../types').Device) => void
}) {
  const W = 80 / scale
  const H = 46 / scale
  const px = (device.x ?? 0) * BASE_PX
  const py = (device.y ?? 0) * BASE_PX
  const bgColor = DEVICE_COLORS[device.category] ?? '#6b7280'
  return (
    <Group x={px} y={py} draggable={activeTool === 'select'}
      onClick={(e) => {
        e.cancelBubble = true
        if (activeTool === 'cable') onCableClick(device)
        else if (activeTool === 'select') onSelectClick(device, e.evt.shiftKey)
      }}
      onDragEnd={(e) => {
        useProjectStore.getState().updateDevice(device.id, { x: e.target.x() / BASE_PX, y: e.target.y() / BASE_PX })
        e.target.x(0); e.target.y(0)
      }}
    >
      <Rect x={-W/2} y={-H/2} width={W} height={H} fill={bgColor} stroke={selected ? '#f97316' : '#00000030'} strokeWidth={(selected ? 2.5 : 1.5) / scale} cornerRadius={3/scale} />
      <Text x={-W/2+4/scale} y={-H/2+4/scale} text={device.name} width={W-8/scale} fontSize={8/scale} fontFamily='monospace' fontStyle='bold' fill='white' listening={false} />
      {device.manufacturer && <Text x={-W/2+4/scale} y={-H/2+16/scale} text={device.manufacturer} width={W-8/scale} fontSize={7/scale} fontFamily='monospace' fill='rgba(255,255,255,0.65)' listening={false} />}
      <Text x={W/2-16/scale} y={-H/2+3/scale} text={DEVICE_ICONS[device.category] ?? '◻'} fontSize={10/scale} fill='rgba(255,255,255,0.5)' listening={false} />
    </Group>
  )
}

// ── Main canvas ───────────────────────────────────────────────

export default function PlotCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })

  const {
    project, activeTool, selectedIds, view, gridVisible, snapToGrid, gridSize,
    activeLayerId, activeCableType, autoAddress, showUniverseColors,
    setView, setSelectedIds, addElement, updateElement, updateFixture, addFixture, selectedFixtureType,
  } = useProjectStore()

  // Polygon drawing state
  const [polyPoints, setPolyPoints] = useState<{ x: number; y: number }[]>([])
  // Cable drawing state — array of all vertices placed so far
  const [cablePoints, setCablePoints] = useState<{ x: number; y: number }[]>([])
  // Calibration state
  const [calibPts, setCalibPts] = useState<{ x: number; y: number }[]>([])
  // Cursor world pos for previews
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null)
  // Pan state
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0, vx: 0, vy: 0 })
  // Rubber-band selection state
  const [selectBox, setSelectBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const rubberStart = useRef<{ x: number; y: number } | null>(null)
  // Cable snap target
  const [snapTarget, setSnapTarget] = useState<{ id: string; x: number; y: number } | null>(null)
  // Track start/end connections for current cable
  const cableConnections = useRef<{ start?: string; end?: string }>({})

  // Register the stage data URL getter so EditorPage can export
  useEffect(() => {
    _getStageDataURL = () => stageRef.current?.toDataURL({ pixelRatio: 2 }) ?? ''
    return () => { _getStageDataURL = null }
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => setSize({ width: container.offsetWidth, height: container.offsetHeight }))
    ro.observe(container)
    setSize({ width: container.offsetWidth, height: container.offsetHeight })
    return () => ro.disconnect()
  }, [])

  // Sync Konva Transformer nodes when selection changes
  useEffect(() => {
    const tr = trRef.current
    const stage = stageRef.current
    if (!tr || !stage) return

    const nodes = selectedIds
      .map((id) => stage.findOne('#' + id))
      .filter((n): n is Konva.Node => !!n)

    tr.nodes(nodes)

    // Full scale handles only for rects; rotation-only for everything else
    const singleEl = selectedIds.length === 1
      ? project?.elements.find((e) => e.id === selectedIds[0])
      : null
    if (singleEl?.type === 'rect' || singleEl?.type === 'ellipse') {
      tr.enabledAnchors(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top-center', 'bottom-center', 'middle-left', 'middle-right'])
    } else {
      tr.enabledAnchors([])
    }

    tr.getLayer()?.batchDraw()
  }, [selectedIds, project])

  // Auto-switch to properties tab when cable tool is active or something is selected
  useEffect(() => {
    if (activeTool === 'cable') useProjectStore.getState().setActiveRightPanel('properties')
  }, [activeTool])
  useEffect(() => {
    if (selectedIds.length > 0) useProjectStore.getState().setActiveRightPanel('properties')
  }, [selectedIds])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Delete' || e.key === 'Backspace') useProjectStore.getState().deleteSelected()
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        e.preventDefault()
        useProjectStore.getState().copySelected()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        e.preventDefault()
        useProjectStore.getState().pasteClipboard()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) useProjectStore.getState().redo()
        else useProjectStore.getState().undo()
      }
      if (e.key === 'Escape') {
        setPolyPoints([]); setCablePoints([]); setCalibPts([])
        useProjectStore.getState().setActiveTool('select')
      }
      // Tool shortcuts
      const noMod = !e.metaKey && !e.ctrlKey && !e.altKey
      if (noMod) {
        if (e.key === 'v' || e.key === 'V') useProjectStore.getState().setActiveTool('select')
        if (e.key === 'h' || e.key === 'H') useProjectStore.getState().setActiveTool('pan')
        if (e.key === 'f' || e.key === 'F') useProjectStore.getState().setActiveTool('fixture')
        if (e.key === 'c' || e.key === 'C') useProjectStore.getState().setActiveTool('cable')
        if (e.key === 'r' || e.key === 'R') useProjectStore.getState().setActiveTool('rect')
        if (e.key === 'e' || e.key === 'E') useProjectStore.getState().setActiveTool('ellipse')
        if (e.key === 'p' || e.key === 'P') useProjectStore.getState().setActiveTool('polygon')
        if (e.key === 't' || e.key === 'T') useProjectStore.getState().setActiveTool('truss')
        if (e.key === 'x' || e.key === 'X') useProjectStore.getState().setActiveTool('text')
      }
      // Ctrl+D — duplicate selected
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault()
        const state = useProjectStore.getState()
        const { selectedIds: sel, project: proj } = state
        if (!proj || sel.length === 0) return
        const newIds: string[] = []
        const maxCh = Math.max(0, ...proj.fixtures.map((f) => f.channel))
        let chOffset = 0
        for (const id of sel) {
          const el = proj.elements.find((el) => el.id === id)
          const fixture = proj.fixtures.find((f) => f.id === id)
          if (el) {
            const newId = generateId()
            state.addElement({ ...el, id: newId, x: el.x + 1, y: el.y + 1 })
            newIds.push(newId)
          }
          if (fixture) {
            const newId = generateId()
            state.addFixture({ ...fixture, id: newId, x: fixture.x + 1, y: fixture.y + 1, channel: maxCh + 1 + chOffset })
            chOffset++
            newIds.push(newId)
          }
        }
        if (newIds.length > 0) state.setSelectedIds(newIds)
      }
      // Ctrl+0 — zoom to fit
      if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault()
        const { project: proj } = useProjectStore.getState()
        if (!proj) return
        const allX: number[] = [], allY: number[] = []
        for (const f of proj.fixtures) { allX.push(f.x); allY.push(f.y) }
        for (const el of proj.elements) { allX.push(el.x); allY.push(el.y) }
        if (allX.length === 0) return
        const pad = 3
        const minX = (Math.min(...allX) - pad) * BASE_PX
        const minY = (Math.min(...allY) - pad) * BASE_PX
        const maxX = (Math.max(...allX) + pad) * BASE_PX
        const maxY = (Math.max(...allY) + pad) * BASE_PX
        const scaleX = size.width / (maxX - minX || 1)
        const scaleY = size.height / (maxY - minY || 1)
        const newScale = Math.min(scaleX, scaleY, MAX_SCALE)
        setView({ scale: newScale, x: -minX * newScale, y: -minY * newScale })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [size, setView])

  const worldPos = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return { x: 0, y: 0 }
    const ptr = stage.getPointerPosition()
    if (!ptr) return { x: 0, y: 0 }
    return {
      x: (ptr.x - view.x) / (view.scale * BASE_PX),
      y: (ptr.y - view.y) / (view.scale * BASE_PX),
    }
  }, [view])

  const snap = useCallback((v: { x: number; y: number }) => ({
    x: snapValue(v.x, gridSize, snapToGrid),
    y: snapValue(v.y, gridSize, snapToGrid),
  }), [gridSize, snapToGrid])

  // Layer visibility/lock helpers
  const layers = project?.layers ?? []
  const layerMap = Object.fromEntries(layers.map((l) => [l.id, l]))
  const isVisible = (layerId?: string) => {
    if (!layerId) return true
    return layerMap[layerId]?.visible !== false
  }
  const isLocked = (layerId?: string) => {
    if (!layerId) return false
    return layerMap[layerId]?.locked === true
  }

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const oldScale = view.scale
    const pointer = stage.getPointerPosition()!
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, oldScale * (e.evt.deltaY < 0 ? 1.1 : 0.9)))
    const mousePointTo = { x: (pointer.x - view.x) / oldScale, y: (pointer.y - view.y) / oldScale }
    setView({ scale: newScale, x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale })
  }

  const handleStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    const isBackground = e.target === e.target.getStage() || e.target.name() === 'bg'
    if (activeTool === 'pan' || e.evt.button === 1 || e.evt.altKey) {
      setIsPanning(true)
      setPanStart({ x: e.evt.clientX, y: e.evt.clientY, vx: view.x, vy: view.y })
      return
    }
    if (!isBackground) return

    const wp = snap(worldPos())

    if (activeTool === 'select') {
      setSelectedIds([])
      rubberStart.current = worldPos()
      return
    }

    if (activeTool === 'rect') {
      const id = generateId()
      addElement({ id, type: 'rect', x: wp.x, y: wp.y, width: 4, height: 2, rotation: 0, locked: false, label: 'Stage', fill: '#d1d5db', stroke: '#374151', strokeWidth: 1, layerId: activeLayerId } as RectElement)
      setSelectedIds([id]); useProjectStore.getState().setActiveTool('select')
    }
    if (activeTool === 'ellipse') {
      const id = generateId()
      addElement({ id, type: 'ellipse', x: wp.x, y: wp.y, radiusX: 2, radiusY: 2, rotation: 0, locked: false, label: '', fill: '#d1d5db', stroke: '#374151', strokeWidth: 1, layerId: activeLayerId } as EllipseElement)
      setSelectedIds([id]); useProjectStore.getState().setActiveTool('select')
    }
    if (activeTool === 'polygon') {
      setPolyPoints((prev) => [...prev, wp])
    }
    if (activeTool === 'truss') {
      const id = generateId()
      addElement({ id, type: 'truss', x: wp.x, y: wp.y, x2: wp.x + 6, y2: wp.y, rotation: 0, locked: false, label: '', fill: '#374151', stroke: '#374151', strokeWidth: 2, layerId: activeLayerId } as TrussElement)
      setSelectedIds([id]); useProjectStore.getState().setActiveTool('select')
    }
    if (activeTool === 'text') {
      const text = window.prompt('Enter text:')
      if (!text) return
      const id = generateId()
      addElement({ id, type: 'text', x: wp.x, y: wp.y, text, fontSize: 14, rotation: 0, locked: false, label: '', fill: '#1f2937', stroke: '', strokeWidth: 0, layerId: activeLayerId } as TextElement)
      setSelectedIds([id]); useProjectStore.getState().setActiveTool('select')
    }
    if (activeTool === 'fixture' && selectedFixtureType) {
      const mode = selectedFixtureType.modes[0]
      const id = generateId()
      const existing = project?.fixtures ?? []
      const nextCh = existing.length > 0 ? Math.max(...existing.map((f) => f.channel)) + 1 : 1
      // Auto-address: find next available DMX slot
      let universe = 1, address = 1
      if (autoAddress && existing.length > 0) {
        const byUniverse: Record<number, number> = {}
        for (const f of existing) {
          const end = f.address + Math.max(0, (f.channelCount || 1) - 1)
          byUniverse[f.universe] = Math.max(byUniverse[f.universe] ?? 0, end)
        }
        const lastUniv = Math.max(...Object.keys(byUniverse).map(Number))
        const nextAddr = byUniverse[lastUniv] + 1
        const chCnt = mode?.channelCount || 1
        if (nextAddr + chCnt - 1 <= 512) {
          universe = lastUniv; address = nextAddr
        } else {
          universe = lastUniv + 1; address = 1
        }
      }
      addFixture({
        id,
        manufacturer: selectedFixtureType.manufacturer,
        model: selectedFixtureType.name,
        shortName: selectedFixtureType.shortName,
        symbol: selectedFixtureType.symbol,
        x: wp.x, y: wp.y, rotation: 0,
        channel: nextCh,
        universe, address,
        mode: mode?.name ?? 'Default',
        channelCount: mode?.channelCount ?? 0,
        availableModes: selectedFixtureType.modes,
        weight: selectedFixtureType.weight ?? 0,
        powerRating: selectedFixtureType.powerConsumption ?? 0,
        label: '', notes: '', color: '', dimmerNumber: '',
        layerId: activeLayerId,
      })
      setSelectedIds([id])
    }
    if (activeTool === 'cable') {
      const pt = snapTarget ? { x: snapTarget.x, y: snapTarget.y } : wp
      if (cablePoints.length === 0) {
        cableConnections.current = { start: snapTarget?.id }
      }
      setCablePoints((prev) => [...prev, pt])
    }
    if (activeTool === 'calibrate') {
      if (calibPts.length === 0) {
        setCalibPts([wp])
      } else {
        const pt1 = calibPts[0]
        const pt2 = wp
        const canvasDist = Math.sqrt((pt2.x - pt1.x) ** 2 + (pt2.y - pt1.y) ** 2)
        if (canvasDist < 0.01) { setCalibPts([]); return }
        const input = window.prompt(`Distance between the two points (meters):\n\nCurrent canvas distance: ${canvasDist.toFixed(2)}m`, canvasDist.toFixed(2))
        if (!input) { setCalibPts([]); return }
        const realDist = parseFloat(input)
        if (isNaN(realDist) || realDist <= 0) { alert('Invalid distance.'); setCalibPts([]); return }
        const scaleFactor = realDist / canvasDist
        const bg = useProjectStore.getState().project?.backgroundImage
        if (bg) {
          // Only rescale — don't move the image position
          useProjectStore.getState().updateBackgroundImage({
            width: bg.width * scaleFactor,
            height: bg.height * scaleFactor,
          })
        }
        setCalibPts([])
        useProjectStore.getState().setActiveTool('select')
      }
    }
  }

  // Drag handler that offsets cable waypoints correctly
  const handleElementDragEnd = useCallback((id: string, x: number, y: number) => {
    const el = project?.elements.find((e) => e.id === id)
    if (el?.type === 'cable') {
      const ce = el as CableElement
      const dx = x - ce.x; const dy = y - ce.y
      updateElement(id, {
        x, y,
        x2: ce.x2 + dx,
        y2: ce.y2 + dy,
        waypoints: (ce.waypoints ?? []).map((p) => ({ x: p.x + dx, y: p.y + dy })),
      } as Partial<AnyElement>)
    } else {
      updateElement(id, { x, y })
    }
  }, [project, updateElement])

  const handleStageMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    if (isPanning) {
      setView({ x: panStart.vx + e.evt.clientX - panStart.x, y: panStart.vy + e.evt.clientY - panStart.y })
      return
    }
    const wp = worldPos()
    // Rubber-band selection
    if (activeTool === 'select' && rubberStart.current && e.evt.buttons === 1) {
      setSelectBox({ x1: rubberStart.current.x, y1: rubberStart.current.y, x2: wp.x, y2: wp.y })
    }
    // Cable snap to fixture/distro
    if (activeTool === 'cable') {
      let snapped: { id: string; x: number; y: number } | null = null
      for (const f of visibleFixtures) {
        const d = Math.hypot(wp.x - f.x, wp.y - f.y)
        if (d < CABLE_SNAP_RADIUS) { snapped = { id: f.id, x: f.x, y: f.y }; break }
      }
      if (!snapped) {
        for (const d of visibleDistros) {
          if (d.x === undefined || d.y === undefined) continue
          const dist = Math.hypot(wp.x - d.x, wp.y - d.y)
          if (dist < CABLE_SNAP_RADIUS) { snapped = { id: d.id, x: d.x, y: d.y }; break }
        }
      }
      if (!snapped) {
        for (const dv of (project?.devices ?? [])) {
          if (dv.x === undefined || dv.y === undefined) continue
          const dist = Math.hypot(wp.x - dv.x, wp.y - dv.y)
          if (dist < CABLE_SNAP_RADIUS) { snapped = { id: dv.id, x: dv.x, y: dv.y }; break }
        }
      }
      setSnapTarget(snapped)
      setCursorPos(snapped ? { x: snapped.x, y: snapped.y } : wp)
    } else {
      setCursorPos(wp)
    }
  }

  const handleStageMouseUp = () => {
    setIsPanning(false)
    if (selectBox) {
      const minX = Math.min(selectBox.x1, selectBox.x2)
      const maxX = Math.max(selectBox.x1, selectBox.x2)
      const minY = Math.min(selectBox.y1, selectBox.y2)
      const maxY = Math.max(selectBox.y1, selectBox.y2)
      const inBox = (x: number, y: number) => x >= minX && x <= maxX && y >= minY && y <= maxY
      const selEl = visibleElements.filter((el) => inBox(el.x, el.y)).map((el) => el.id)
      const selFx = visibleFixtures.filter((f) => inBox(f.x, f.y)).map((f) => f.id)
      if (selEl.length + selFx.length > 0) setSelectedIds([...selEl, ...selFx])
      setSelectBox(null)
    }
    rubberStart.current = null
  }

  const handleStageDblClick = (_e: KonvaEventObject<MouseEvent>) => {
    if (activeTool === 'polygon' && polyPoints.length >= 3) {
      const id = generateId()
      const fp = polyPoints[0]
      const relPts = polyPoints.flatMap((p) => [p.x - fp.x, p.y - fp.y])
      addElement({ id, type: 'polygon', x: fp.x, y: fp.y, points: relPts, rotation: 0, locked: false, label: 'Stage', fill: '#d1d5db', stroke: '#374151', strokeWidth: 1, layerId: activeLayerId } as PolygonElement)
      setPolyPoints([]); setSelectedIds([id])
      useProjectStore.getState().setActiveTool('select')
    }
    if (activeTool === 'cable' && cablePoints.length >= 2) {
      const id = generateId()
      // Remove the duplicate point added by the first click of the dblclick
      const pts = cablePoints.slice(0, -1)
      if (pts.length < 2) { setCablePoints([]); cableConnections.current = {}; setSnapTarget(null); return }
      const start = pts[0]
      const end = pts[pts.length - 1]
      const midPts = pts.slice(1, -1)
      const endConnection = snapTarget?.id ?? cableConnections.current.end
      addElement({
        id, type: 'cable',
        x: start.x, y: start.y, x2: end.x, y2: end.y,
        waypoints: midPts,
        cableType: activeCableType,
        rotation: 0, locked: false, label: '',
        fill: '', stroke: CABLE_COLORS[activeCableType] ?? '#9ca3af', strokeWidth: 2,
        layerId: activeLayerId,
        startConnectedTo: cableConnections.current.start,
        endConnectedTo: endConnection,
      } as CableElement)
      setCablePoints([]); setSelectedIds([id])
      cableConnections.current = {}; setSnapTarget(null)
    }
  }

  const visibleElements = (project?.elements ?? []).filter((el) => isVisible(el.layerId) && !isLocked(el.layerId))
  const visibleFixtures = (project?.fixtures ?? []).filter((f) => isVisible(f.layerId) && !isLocked(f.layerId))

  const cursor =
    activeTool === 'pan' || isPanning ? 'grab'
    : activeTool === 'calibrate' ? 'crosshair'
    : activeTool === 'cable' ? (cablePoints.length > 0 ? 'crosshair' : 'cell')
    : activeTool === 'polygon' || activeTool === 'rect' || activeTool === 'ellipse' || activeTool === 'truss' || activeTool === 'text' ? 'crosshair'
    : activeTool === 'fixture' ? 'cell'
    : 'default'

  const visibleDistros = (project?.distros ?? []).filter(
    (d) => d.x !== undefined && d.y !== undefined && isVisible(d.layerId ?? 'power')
  )

  return (
    <div ref={containerRef} className='flex-1 overflow-hidden bg-white relative' style={{ cursor }}>
      <Stage
        ref={stageRef}
        width={size.width} height={size.height}
        scaleX={view.scale} scaleY={view.scale}
        x={view.x} y={view.y}
        onWheel={handleWheel}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onDblClick={handleStageDblClick}
      >
        <Layer listening={false}>
          <Rect x={-view.x / view.scale} y={-view.y / view.scale} width={size.width / view.scale} height={size.height / view.scale} fill='white' name='bg' />
        </Layer>

        {gridVisible && <GridLayer width={size.width} height={size.height} view={view} gridSize={gridSize} />}

        {project?.backgroundImage && <BackgroundImageLayer img={project.backgroundImage} />}

        <Layer>
          {visibleElements.map((el) => (
            <StageElementNode
              key={el.id} el={el}
              selected={selectedIds.includes(el.id)}
              scale={view.scale}
              onClick={(e) => {
                if (isLocked(el.layerId)) return
                e.cancelBubble = true
                if (e.evt.shiftKey) setSelectedIds(selectedIds.includes(el.id) ? selectedIds.filter((i) => i !== el.id) : [...selectedIds, el.id])
                else setSelectedIds([el.id])
              }}
              onDragEnd={handleElementDragEnd}
            />
          ))}

          {visibleFixtures.map((f) => (
            <FixtureSymbol
              key={f.id} fixture={f}
              selected={selectedIds.includes(f.id)}
              scale={view.scale}
              showUniverseColors={showUniverseColors}
              draggable={activeTool === 'select' && !isLocked(f.layerId)}
              onClick={(e) => {
                if (isLocked(f.layerId)) return
                // When cable tool active, route the click to cable drawing
                if (activeTool === 'cable') {
                  e.cancelBubble = true
                  const pt = { x: f.x, y: f.y }
                  if (cablePoints.length === 0) {
                    // Start cable from this fixture
                    cableConnections.current = { start: f.id }
                    setCablePoints([pt])
                  } else {
                    // End cable on this fixture — finish immediately
                    const id = generateId()
                    const allPts = [...cablePoints, pt]
                    const start = allPts[0]
                    const end = allPts[allPts.length - 1]
                    const midPts = allPts.slice(1, -1)
                    addElement({
                      id, type: 'cable',
                      x: start.x, y: start.y, x2: end.x, y2: end.y,
                      waypoints: midPts,
                      cableType: activeCableType,
                      rotation: 0, locked: false, label: '',
                      fill: '', stroke: CABLE_COLORS[activeCableType] ?? '#9ca3af', strokeWidth: 2,
                      layerId: activeLayerId,
                      startConnectedTo: cableConnections.current.start,
                      endConnectedTo: f.id,
                    } as CableElement)
                    setCablePoints([])
                    setSelectedIds([id])
                    cableConnections.current = {}
                    setSnapTarget(null)
                  }
                  return
                }
                e.cancelBubble = true
                if (e.evt.shiftKey) setSelectedIds(selectedIds.includes(f.id) ? selectedIds.filter((i) => i !== f.id) : [...selectedIds, f.id])
                else setSelectedIds([f.id])
              }}
              onDragEnd={(id, x, y) => updateFixture(id, { x, y })}
            />
          ))}

          {/* Polygon preview */}
          {activeTool === 'polygon' && polyPoints.length > 0 && (<>
            {polyPoints.map((p, i) => <Circle key={i} x={p.x * BASE_PX} y={p.y * BASE_PX} radius={3 / view.scale} fill='#3b82f6' listening={false} />)}
            {cursorPos && <Line points={[...polyPoints, cursorPos].flatMap((p) => [p.x * BASE_PX, p.y * BASE_PX])} stroke='#3b82f6' strokeWidth={1 / view.scale} dash={[6 / view.scale, 4 / view.scale]} listening={false} />}
          </>)}

          {/* Cable snap highlight */}
          {activeTool === 'cable' && snapTarget && (
            <Circle x={snapTarget.x * BASE_PX} y={snapTarget.y * BASE_PX} radius={SYMBOL_RADIUS / view.scale + 6 / view.scale} fill='transparent' stroke='#22c55e' strokeWidth={2 / view.scale} dash={[4 / view.scale, 3 / view.scale]} listening={false} />
          )}

          {/* Cable preview — growing polyline */}
          {activeTool === 'cable' && cablePoints.length > 0 && cursorPos && (()=>{
            const color = CABLE_COLORS[activeCableType] ?? '#9ca3af'
            const previewPts = [...cablePoints, cursorPos]
            const konvaPts = previewPts.flatMap((p) => [p.x * BASE_PX, p.y * BASE_PX])
            let totalLen = 0
            for (let i = 1; i < previewPts.length; i++) {
              totalLen += Math.sqrt((previewPts[i].x - previewPts[i-1].x)**2 + (previewPts[i].y - previewPts[i-1].y)**2)
            }
            return (
              <Group listening={false}>
                <Line points={konvaPts} stroke={color} strokeWidth={2 / view.scale} dash={[8 / view.scale, 4 / view.scale]} lineCap='round' lineJoin='round' />
                {cablePoints.map((p, i) => <Circle key={i} x={p.x * BASE_PX} y={p.y * BASE_PX} radius={i === 0 ? 4 / view.scale : 3 / view.scale} fill={color} />)}
                <Text x={cursorPos.x * BASE_PX + 5 / view.scale} y={cursorPos.y * BASE_PX - 14 / view.scale} text={`${totalLen.toFixed(1)}m · dbl-click to finish`} fontSize={8 / view.scale} fontFamily='monospace' fill={color} />
              </Group>
            )
          })()}
          {activeTool === 'cable' && cablePoints.length === 0 && cursorPos && (
            <Text x={cursorPos.x * BASE_PX + 8 / view.scale} y={cursorPos.y * BASE_PX - 14 / view.scale} text='Click to start · dbl-click to finish' fontSize={8 / view.scale} fontFamily='monospace' fill={CABLE_COLORS[activeCableType] ?? '#9ca3af'} listening={false} />
          )}

          {/* Calibration preview */}
          {activeTool === 'calibrate' && calibPts.length > 0 && cursorPos && (<>
            <Circle x={calibPts[0].x * BASE_PX} y={calibPts[0].y * BASE_PX} radius={5 / view.scale} fill='#f97316' stroke='white' strokeWidth={1 / view.scale} listening={false} />
            <Line points={[calibPts[0].x * BASE_PX, calibPts[0].y * BASE_PX, cursorPos.x * BASE_PX, cursorPos.y * BASE_PX]} stroke='#f97316' strokeWidth={1.5 / view.scale} dash={[6 / view.scale, 3 / view.scale]} listening={false} />
            <Circle x={cursorPos.x * BASE_PX} y={cursorPos.y * BASE_PX} radius={5 / view.scale} fill='white' stroke='#f97316' strokeWidth={1.5 / view.scale} listening={false} />
            <Text
              x={((calibPts[0].x + cursorPos.x) / 2) * BASE_PX + 4 / view.scale}
              y={((calibPts[0].y + cursorPos.y) / 2) * BASE_PX - 14 / view.scale}
              text={`${Math.sqrt((cursorPos.x - calibPts[0].x) ** 2 + (cursorPos.y - calibPts[0].y) ** 2).toFixed(2)}m`}
              fontSize={9 / view.scale} fontFamily='monospace' fill='#f97316' listening={false}
            />
          </>)}

          {/* Rubber-band selection rect */}
          {selectBox && (
            <Rect
              x={Math.min(selectBox.x1, selectBox.x2) * BASE_PX}
              y={Math.min(selectBox.y1, selectBox.y2) * BASE_PX}
              width={Math.abs(selectBox.x2 - selectBox.x1) * BASE_PX}
              height={Math.abs(selectBox.y2 - selectBox.y1) * BASE_PX}
              fill='rgba(59,130,246,0.08)'
              stroke='#3b82f6'
              strokeWidth={1 / view.scale}
              dash={[4 / view.scale, 3 / view.scale]}
              listening={false}
            />
          )}

          {/* Selection transformer */}
          <Transformer
            ref={trRef}
            rotateEnabled={true}
            borderStroke='#f97316'
            borderStrokeWidth={1.5 / view.scale}
            anchorFill='white'
            anchorStroke='#f97316'
            anchorStrokeWidth={1.5}
            anchorSize={8}
            rotateAnchorOffset={20 / view.scale}
            keepRatio={false}
          />
        </Layer>

        {/* Placed distros */}
        {visibleDistros.length > 0 && (
          <Layer>
            {visibleDistros.map((d) => (
              <DistroNode
                key={d.id} distro={d} scale={view.scale}
                activeTool={activeTool}
                onSelectClick={(distro, shift) => {
                  if (shift) setSelectedIds(selectedIds.includes(distro.id) ? selectedIds.filter((i) => i !== distro.id) : [...selectedIds, distro.id])
                  else setSelectedIds([distro.id])
                }}
                onCableClick={(distro) => {
                  const pt = { x: distro.x ?? 0, y: distro.y ?? 0 }
                  if (cablePoints.length === 0) {
                    // Starting cable from distro
                    cableConnections.current = { start: distro.id }
                    setCablePoints([pt])
                  } else {
                    // Ending cable on distro — finish immediately
                    const id = generateId()
                    const allPts = [...cablePoints, pt]
                    const start = allPts[0]
                    const end = allPts[allPts.length - 1]
                    const midPts = allPts.slice(1, -1)
                    addElement({
                      id, type: 'cable',
                      x: start.x, y: start.y, x2: end.x, y2: end.y,
                      waypoints: midPts,
                      cableType: activeCableType,
                      rotation: 0, locked: false, label: '',
                      fill: '', stroke: CABLE_COLORS[activeCableType] ?? '#9ca3af', strokeWidth: 2,
                      layerId: activeLayerId,
                      startConnectedTo: cableConnections.current.start,
                      endConnectedTo: distro.id,
                    } as CableElement)
                    setCablePoints([])
                    setSelectedIds([id])
                    cableConnections.current = {}
                    setSnapTarget(null)
                  }
                }}
              />
            ))}
          </Layer>
        )}

        {/* Placed devices */}
        {(project?.devices ?? []).filter((d) => d.x !== undefined && d.y !== undefined).length > 0 && (
          <Layer>
            {(project?.devices ?? [])
              .filter((d) => d.x !== undefined && d.y !== undefined)
              .map((d) => (
                <DeviceNode
                  key={d.id} device={d} scale={view.scale}
                  activeTool={activeTool}
                  selected={selectedIds.includes(d.id)}
                  onSelectClick={(device, shift) => {
                    if (shift) setSelectedIds(selectedIds.includes(device.id) ? selectedIds.filter((i) => i !== device.id) : [...selectedIds, device.id])
                    else setSelectedIds([device.id])
                  }}
                  onCableClick={(device) => {
                    const pt = { x: device.x ?? 0, y: device.y ?? 0 }
                    if (cablePoints.length === 0) {
                      cableConnections.current = { start: device.id }
                      setCablePoints([pt])
                    } else {
                      const id = generateId()
                      const allPts = [...cablePoints, pt]
                      const start = allPts[0]; const end = allPts[allPts.length - 1]
                      addElement({
                        id, type: 'cable',
                        x: start.x, y: start.y, x2: end.x, y2: end.y,
                        waypoints: allPts.slice(1, -1),
                        cableType: activeCableType,
                        rotation: 0, locked: false, label: '',
                        fill: '', stroke: CABLE_COLORS[activeCableType] ?? '#9ca3af', strokeWidth: 2,
                        layerId: activeLayerId,
                        startConnectedTo: cableConnections.current.start,
                        endConnectedTo: device.id,
                      } as CableElement)
                      setCablePoints([]); setSelectedIds([id])
                      cableConnections.current = {}; setSnapTarget(null)
                    }
                  }}
                />
              ))}
          </Layer>
        )}
      </Stage>

      {/* Cursor world position overlay */}
      {cursorPos && (
        <div className='absolute bottom-2 left-2 bg-black/40 text-white text-xs font-mono px-2 py-0.5 rounded pointer-events-none select-none'>
          {cursorPos.x.toFixed(2)}m, {cursorPos.y.toFixed(2)}m
        </div>
      )}
    </div>
  )
}
