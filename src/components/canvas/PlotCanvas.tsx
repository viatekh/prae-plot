import { useRef, useEffect, useCallback, useState } from 'react'
import { Stage, Layer, Rect, Ellipse, Line, Circle, Text, Image as KonvaImage, Group, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useProjectStore, formatCircuitRef } from '../../store/projectStore'
import { generateId, cableLength } from '../../lib/utils'
import type {
  AnyElement, PlacedFixture, RectElement, EllipseElement, PolygonElement, TrussElement, TextElement, CableElement,
  Distro, ViewOptions,
} from '../../types'
import { CABLE_COLORS, DEFAULT_TEXT_CM, isFreeform } from '../../types'
import { SYMBOL_RADIUS, symbolColors } from '../../lib/symbols'
import { symbolShapes, symbolLineWidth } from '../../lib/symbolGeometry'
import type { FillRole } from '../../lib/symbolGeometry'

const BASE_PX = 50
const MIN_SCALE = 0.1
const MAX_SCALE = 8
const CABLE_SNAP_RADIUS = 0.6 // metres

const UNIVERSE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#f97316', '#84cc16']

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
  const worldLeft  = -view.x / view.scale
  const worldTop   = -view.y / view.scale
  const worldRight  = (width  - view.x) / view.scale
  const worldBottom = (height - view.y) / view.scale

  const startX = Math.floor(worldLeft / step) * step
  const startY = Math.floor(worldTop  / step) * step

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

function FixtureSymbol({ fixture, selected, scale, vo, circuitRef, draggable, onClick, onDragStart, onDragEnd }: {
  fixture: PlacedFixture; selected: boolean; scale: number; vo: ViewOptions
  circuitRef: string; draggable: boolean
  onClick: (e: KonvaEventObject<MouseEvent>) => void
  onDragStart: (id: string) => void
  onDragEnd: (id: string, x: number, y: number) => void
}) {
  const colors = symbolColors(fixture.symbol)
  const r = SYMBOL_RADIUS / scale
  const strokeColor = selected ? '#f97316' : colors.stroke
  const x = fixture.x * BASE_PX
  const y = fixture.y * BASE_PX

  const addrLabel = `${fixture.universe}.${String(fixture.address).padStart(3, '0')}`

  // ── Theatrical / architectural symbols ──────────────────────────────────────
  // Geometry comes from lib/symbolGeometry so the canvas and the PDF plot
  // renderer draw exactly the same symbols. Coordinates there are in multiples
  // of the symbol radius, with the beam pointing "up" (−y).
  const renderBody = () =>
    symbolShapes(fixture.symbol).map((p, i) => {
      const paint = (role?: FillRole) =>
        role === 'body'   ? '#ffffff'
        : role === 'accent' ? strokeColor
        : role === 'tint'   ? colors.fill + '55'
        : role === 'type'   ? colors.fill
        : 'transparent'
      const sw = p.lw === undefined ? symbolLineWidth(1) : symbolLineWidth(p.lw)
      const stroke = sw > 0 ? strokeColor : undefined
      const strokeWidth = sw / scale

      if (p.k === 'circle') {
        return <Circle key={i} x={(p.cx ?? 0) * r} y={(p.cy ?? 0) * r} radius={p.r * r}
          fill={paint(p.fill)} stroke={stroke} strokeWidth={strokeWidth} />
      }
      if (p.k === 'rect') {
        return <Rect key={i} x={p.x * r} y={p.y * r} width={p.w * r} height={p.h * r}
          cornerRadius={(p.radius ?? 0) * r}
          fill={paint(p.fill)} stroke={stroke} strokeWidth={strokeWidth} />
      }
      return <Line key={i} points={p.pts.map((v) => v * r)} closed={p.closed}
        fill={paint(p.fill)} stroke={stroke} strokeWidth={strokeWidth} lineJoin='round' />
    })

  return (
    <Group
      id={fixture.id}
      x={x} y={y} rotation={fixture.rotation} draggable={draggable}
      onClick={onClick}
      onDragStart={() => onDragStart(fixture.id)}
      onDragEnd={(e) => onDragEnd(fixture.id, e.target.x() / BASE_PX, e.target.y() / BASE_PX)}
      onTransformEnd={(e) => {
        const node = e.target
        useProjectStore.getState().updateFixture(fixture.id, { rotation: node.rotation() })
        node.scaleX(1); node.scaleY(1)
      }}
    >
      {renderBody()}
      {/* Universe color ring */}
      {vo.universeColors && <Circle radius={r + 4 / scale} fill='transparent' stroke={UNIVERSE_COLORS[(fixture.universe - 1) % UNIVERSE_COLORS.length]} strokeWidth={2 / scale} listening={false} />}
      {/* Annotations counter-rotate so they stay upright whichever way the
          fixture points — a plot label is read off the page, not the symbol. */}
      <Group rotation={-fixture.rotation} listening={false}>
        {/* CH above symbol */}
        {vo.channels && fixture.channel > 0 && <Text x={-22 / scale} y={-r - 18 / scale} width={44 / scale} text={String(fixture.channel)} fontSize={10 / scale} fontFamily='monospace' fill='#1f2937' fontStyle='bold' align='center' listening={false} />}
        {/* Annotation stack below the symbol */}
        {(() => {
          const lines = [
            vo.addresses && addrLabel,
            vo.circuitRefs && circuitRef !== '—' && circuitRef,
            vo.fixtureLabels && fixture.label,
          ].filter(Boolean) as string[]
          return lines.map((line, i) => (
            <Text key={i} x={-30 / scale} y={r + (3 + i * 11) / scale} width={60 / scale} text={line}
              fontSize={8 / scale} fontFamily='monospace' fill={i === 0 ? '#6b7280' : '#374151'}
              align='center' listening={false} />
          ))
        })()}
      </Group>
    </Group>
  )
}

// ── Stage element ─────────────────────────────────────────────
// Two rules keep the Transformer honest:
//   1. the node it is attached to holds geometry only — a label inside it would
//      inflate the bounding box, so the handles would sit away from the shape
//      and resizing would behave as if the shape were somewhere else;
//   2. that geometry is local, with the node itself positioned, so scaling
//      multiplies the size rather than the distance from the origin.
// Labels are therefore drawn as siblings, and they never scale with the shape.

/** Object label, drawn upright beside the shape it names. */
function ShapeLabel({ text, x, y, scale }: { text: string; x: number; y: number; scale: number }) {
  const w = 240 / scale
  return (
    <Text
      x={x - w / 2} y={y - 7 / scale} width={w} text={text} listening={false}
      fontSize={11 / scale} fontFamily='sans-serif' fill='#374151' align='center'
    />
  )
}

interface ElementNodeProps {
  el: AnyElement
  selected: boolean
  scale: number
  locked: boolean
  vo: ViewOptions
  /** Freeform plots have no measurable geometry, only lengths typed in by hand. */
  freeform: boolean
  onClick: (e: KonvaEventObject<MouseEvent>) => void
  onDragStart: (id: string) => void
  /** Absolute new position in metres. */
  onDragEnd: (id: string, x: number, y: number) => void
}

function StageElementNode({ el, selected, scale, locked, vo, freeform, onClick, onDragStart, onDragEnd }: ElementNodeProps) {
  const sw = (selected ? 2 : 1) / scale
  const stroke = selected ? '#f97316' : (el.stroke || '#374151')
  const draggable = !el.locked && !locked
  const update = (updates: Partial<AnyElement>) => useProjectStore.getState().updateElement(el.id, updates)

  // Empty fill means "no fill" — but the shape still needs a hit area, or it
  // becomes impossible to click anywhere except exactly on its outline.
  const resolvedFill = (raw: string | undefined, fallback: string) =>
    raw === '' || raw === 'transparent' ? 'rgba(0,0,0,0.001)' : (raw || fallback)

  const common = {
    id: el.id,
    draggable,
    onClick,
    onDragStart: () => onDragStart(el.id),
    onDragEnd: (e: KonvaEventObject<DragEvent>) =>
      onDragEnd(el.id, e.target.x() / BASE_PX, e.target.y() / BASE_PX),
  }
  const showLabel = vo.elementLabels && !!el.label

  if (el.type === 'rect') {
    const re = el as RectElement
    const w = re.width * BASE_PX
    const h = re.height * BASE_PX
    const rad = (re.rotation * Math.PI) / 180
    const cx = re.x * BASE_PX + (w / 2) * Math.cos(rad) - (h / 2) * Math.sin(rad)
    const cy = re.y * BASE_PX + (w / 2) * Math.sin(rad) + (h / 2) * Math.cos(rad)
    return (<>
      <Rect
        {...common}
        x={re.x * BASE_PX} y={re.y * BASE_PX} width={w} height={h} rotation={re.rotation}
        fill={resolvedFill(re.fill, '#d1d5db')} stroke={stroke} strokeWidth={sw}
        onTransformEnd={(e) => {
          const node = e.target
          update({
            x: node.x() / BASE_PX, y: node.y() / BASE_PX,
            width: Math.max(0.05, re.width * node.scaleX()),
            height: Math.max(0.05, re.height * node.scaleY()),
            rotation: node.rotation(),
          } as Partial<RectElement>)
          node.scaleX(1); node.scaleY(1)
        }}
      />
      {showLabel && <ShapeLabel text={re.label} x={cx} y={cy} scale={scale} />}
    </>)
  }

  if (el.type === 'ellipse') {
    const ee = el as EllipseElement
    return (<>
      <Ellipse
        {...common}
        x={ee.x * BASE_PX} y={ee.y * BASE_PX} rotation={ee.rotation}
        radiusX={ee.radiusX * BASE_PX} radiusY={ee.radiusY * BASE_PX}
        fill={resolvedFill(ee.fill, '#d1d5db')} stroke={stroke} strokeWidth={sw}
        onTransformEnd={(e) => {
          const node = e.target
          update({
            x: node.x() / BASE_PX, y: node.y() / BASE_PX,
            radiusX: Math.max(0.05, ee.radiusX * node.scaleX()),
            radiusY: Math.max(0.05, ee.radiusY * node.scaleY()),
            rotation: node.rotation(),
          } as Partial<EllipseElement>)
          node.scaleX(1); node.scaleY(1)
        }}
      />
      {showLabel && <ShapeLabel text={ee.label} x={ee.x * BASE_PX} y={ee.y * BASE_PX} scale={scale} />}
    </>)
  }

  if (el.type === 'polygon') {
    const pe = el as PolygonElement
    const pts = pe.points.map((v) => v * BASE_PX)
    const xs = pts.filter((_, i) => i % 2 === 0)
    const ys = pts.filter((_, i) => i % 2 === 1)
    const rad = (pe.rotation * Math.PI) / 180
    const lx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0
    const ly = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0
    return (<>
      <Line
        {...common}
        x={pe.x * BASE_PX} y={pe.y * BASE_PX} rotation={pe.rotation}
        points={pts} closed
        fill={resolvedFill(pe.fill, '#d1d5db')} stroke={stroke} strokeWidth={sw}
        onTransformEnd={(e) => {
          const node = e.target
          const sx = node.scaleX(), sy = node.scaleY()
          update({
            x: node.x() / BASE_PX, y: node.y() / BASE_PX,
            points: pe.points.map((v, i) => (i % 2 === 0 ? v * sx : v * sy)),
            rotation: node.rotation(),
          } as Partial<PolygonElement>)
          node.scaleX(1); node.scaleY(1)
        }}
      />
      {showLabel && (
        <ShapeLabel
          text={pe.label}
          x={pe.x * BASE_PX + lx * Math.cos(rad) - ly * Math.sin(rad)}
          y={pe.y * BASE_PX + lx * Math.sin(rad) + ly * Math.cos(rad)}
          scale={scale}
        />
      )}
    </>)
  }

  if (el.type === 'truss') {
    const te = el as TrussElement
    // Geometry lives in the two endpoints, so the node carries no rotation of
    // its own: a transform is baked straight back into the end point.
    const ex = (te.x2 - te.x) * BASE_PX
    const ey = (te.y2 - te.y) * BASE_PX
    const length = Math.hypot(te.x2 - te.x, te.y2 - te.y)
    const rungs = Math.min(400, Math.floor(length / 0.5))
    const angle = Math.atan2(ey, ex)
    const dx = Math.sin(angle) * 4 / scale
    const dy = -Math.cos(angle) * 4 / scale
    const caption = [vo.positionLabels && te.label, !freeform && vo.positionLengths && `${length.toFixed(2)}m`]
      .filter(Boolean).join('  ')
    return (<>
      <Group
        {...common}
        x={te.x * BASE_PX} y={te.y * BASE_PX}
        onTransformEnd={(e) => {
          const node = e.target
          const rad = (node.rotation() * Math.PI) / 180
          const cos = Math.cos(rad), sin = Math.sin(rad)
          const sx = ex * node.scaleX(), sy = ey * node.scaleY()
          update({
            x: node.x() / BASE_PX, y: node.y() / BASE_PX,
            x2: (node.x() + sx * cos - sy * sin) / BASE_PX,
            y2: (node.y() + sx * sin + sy * cos) / BASE_PX,
          } as Partial<TrussElement>)
          node.rotation(0); node.scaleX(1); node.scaleY(1)
        }}
      >
        <Line points={[0, 0, ex, ey]} stroke={stroke} strokeWidth={(selected ? 5 : 4) / scale}
          lineCap='round' hitStrokeWidth={12 / scale} />
        {Array.from({ length: rungs + 1 }).map((_, i) => {
          const t = length > 0 ? (i * 0.5) / length : 0
          if (t > 1) return null
          const hx = ex * t, hy = ey * t
          return <Line key={i} points={[hx - dx, hy - dy, hx + dx, hy + dy]} stroke={stroke} strokeWidth={1.5 / scale} listening={false} />
        })}
      </Group>
      {caption && (
        <ShapeLabel
          text={caption}
          x={te.x * BASE_PX + ex / 2}
          y={te.y * BASE_PX + ey / 2 - 16 / scale}
          scale={scale}
        />
      )}
    </>)
  }

  if (el.type === 'cable') {
    const ce = el as CableElement
    const color = CABLE_COLORS[ce.cableType] ?? '#9ca3af'
    const rel = [
      { x: 0, y: 0 },
      ...(ce.waypoints ?? []).map((p) => ({ x: p.x - ce.x, y: p.y - ce.y })),
      { x: ce.x2 - ce.x, y: ce.y2 - ce.y },
    ]
    const pts = rel.flatMap((p) => [p.x * BASE_PX, p.y * BASE_PX])
    const length = freeform ? ce.manualLength : cableLength(ce)
    const mid = rel[Math.floor(rel.length / 2)]
    const caption = [
      vo.cableLabels && ce.autoLabel,
      vo.cableLabels && ce.annotation,
      vo.cableLengths && length != null && `${length.toFixed(1)}m`,
    ].filter(Boolean).join(' · ')
    return (<>
      <Group
        {...common}
        x={ce.x * BASE_PX} y={ce.y * BASE_PX}
        onTransformEnd={(e) => {
          const node = e.target
          const rad = (node.rotation() * Math.PI) / 180
          const cos = Math.cos(rad), sin = Math.sin(rad)
          const originX = node.x() / BASE_PX
          const originY = node.y() / BASE_PX
          const move = (p: { x: number; y: number }) => ({
            x: originX + (p.x * cos - p.y * sin),
            y: originY + (p.x * sin + p.y * cos),
          })
          const end = move(rel[rel.length - 1])
          update({
            x: originX, y: originY, x2: end.x, y2: end.y,
            waypoints: rel.slice(1, -1).map(move),
          } as Partial<CableElement>)
          node.rotation(0); node.scaleX(1); node.scaleY(1)
        }}
      >
        <Line points={pts} stroke={selected ? '#f97316' : color} strokeWidth={(selected ? 2.5 : 2) / scale}
          dash={[8 / scale, 4 / scale]} lineCap='round' lineJoin='round' hitStrokeWidth={12 / scale} />
        {rel.map((p, i) => (
          <Circle key={i} x={p.x * BASE_PX} y={p.y * BASE_PX}
            radius={i === 0 || i === rel.length - 1 ? 3 / scale : 2 / scale}
            fill={i > 0 && i < rel.length - 1 ? 'white' : color} stroke={color} strokeWidth={1 / scale} listening={false} />
        ))}
      </Group>
      {caption && (
        <Text
          x={(ce.x + mid.x) * BASE_PX + 3 / scale} y={(ce.y + mid.y) * BASE_PX - 12 / scale}
          text={caption} fontSize={8 / scale} fontFamily='monospace' fill={color} listening={false}
        />
      )}
    </>)
  }

  if (el.type === 'text') {
    const txe = el as TextElement
    // Font size is centimetres of real space, so text scales with the drawing.
    const px = (txe.fontSize / 100) * BASE_PX
    return (
      <Text
        {...common}
        x={txe.x * BASE_PX} y={txe.y * BASE_PX} rotation={txe.rotation}
        text={txe.text} fontSize={px} fontFamily='sans-serif' fill={txe.fill || '#1f2937'}
        stroke={selected ? '#f97316' : undefined} strokeWidth={selected ? 0.6 / scale : 0}
        onTransformEnd={(e) => {
          const node = e.target
          const factor = (Math.abs(node.scaleX()) + Math.abs(node.scaleY())) / 2
          update({
            x: node.x() / BASE_PX, y: node.y() / BASE_PX,
            fontSize: Math.max(2, Math.round(txe.fontSize * factor)),
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
  }, [img])
  if (!img || !konvaImg || img.visible === false) return null
  return (
    <Layer listening={false}>
      <KonvaImage image={konvaImg} x={img.x * BASE_PX} y={img.y * BASE_PX} width={img.width * BASE_PX} height={img.height * BASE_PX} rotation={img.rotation} opacity={img.opacity} />
    </Layer>
  )
}

// ── Distro node ───────────────────────────────────────────────

function DistroNode({ distro, scale, activeTool, selected, vo, onCableClick, onSelectClick }: {
  distro: Distro; scale: number; activeTool: string; selected: boolean; vo: ViewOptions
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
      }}
    >
      <Rect x={-W / 2} y={-H / 2} width={W} height={H} fill='#dc2626' stroke={selected ? '#f97316' : '#991b1b'} strokeWidth={(selected ? 3 : 2) / scale} cornerRadius={3 / scale} />
      <Text x={-W / 2 + 4 / scale} y={-H / 2 + 5 / scale} text={distro.ref ? `${distro.ref} · ${distro.name}` : distro.name} width={W - 20 / scale} wrap='none' ellipsis fontSize={8 / scale} fontFamily='monospace' fontStyle='bold' fill='white' listening={false} />
      {vo.deviceLabels && <>
        <Text x={-W / 2 + 4 / scale} y={-H / 2 + 17 / scale} text={`${distro.incomingRating}A · ${distro.phases}Ø`} fontSize={7 / scale} fontFamily='monospace' fill='#fecaca' listening={false} />
        <Text x={-W / 2 + 4 / scale} y={-H / 2 + 28 / scale} text={`${distro.circuits.length} way${distro.circuits.length !== 1 ? 's' : ''}`} fontSize={7 / scale} fontFamily='monospace' fill='#fecaca' listening={false} />
      </>}
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

function DeviceNode({ device, scale, activeTool, selected, vo, onSelectClick, onCableClick }: {
  device: import('../../types').Device; scale: number; activeTool: string; selected: boolean; vo: ViewOptions
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
      }}
    >
      <Rect x={-W/2} y={-H/2} width={W} height={H} fill={bgColor} stroke={selected ? '#f97316' : '#00000030'} strokeWidth={(selected ? 2.5 : 1.5) / scale} cornerRadius={3/scale} />
      <Text x={-W/2+4/scale} y={-H/2+4/scale} text={device.name} width={W-20/scale} wrap='none' ellipsis fontSize={8/scale} fontFamily='monospace' fontStyle='bold' fill='white' listening={false} />
      {vo.deviceLabels && device.manufacturer && <Text x={-W/2+4/scale} y={-H/2+16/scale} text={device.manufacturer} width={W-8/scale} wrap='none' ellipsis fontSize={7/scale} fontFamily='monospace' fill='rgba(255,255,255,0.65)' listening={false} />}
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
    project, activeTool, selectedIds, view, viewOptions: vo,
    activeLayerId, activeCableType, autoAddress,
    setView, setSelectedIds, addElement, updateElement, updateFixture, addFixture, selectedFixtureType,
    setLabelDraftId,
  } = useProjectStore()
  const { gridSize } = vo
  const freeform = isFreeform(project)

  // Alt held at pointer-down means "drag off a copy" rather than "move this".
  const altDragRef = useRef(false)

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

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const apply = () => {
      const next = { width: container.offsetWidth, height: container.offsetHeight }
      setSize(next)
      useProjectStore.getState().setCanvasSize(next)
    }
    const ro = new ResizeObserver(apply)
    ro.observe(container)
    apply()
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

    // Handles that suit what the selected thing actually is.
    const ALL_ANCHORS = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top-center', 'bottom-center', 'middle-left', 'middle-right']
    const singleEl = selectedIds.length === 1
      ? project?.elements.find((e) => e.id === selectedIds[0])
      : null
    if (singleEl?.type === 'rect' || singleEl?.type === 'ellipse' || singleEl?.type === 'polygon') {
      tr.enabledAnchors(ALL_ANCHORS)
      tr.keepRatio(false)
    } else if (singleEl?.type === 'text') {
      tr.enabledAnchors(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
      tr.keepRatio(true)
    } else if (singleEl?.type === 'truss') {
      tr.enabledAnchors(['middle-left', 'middle-right'])
      tr.keepRatio(false)
    } else {
      tr.enabledAnchors([])
      tr.keepRatio(false)
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
      const target = e.target as HTMLElement
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return
      // Space on a focused button should press it, not switch tools.
      if ((e.key === ' ' || e.code === 'Space') && tag === 'BUTTON') return
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
      // Space drops back to the select tool — the fastest way out of a tool
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
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
        const add = (x: number, y: number) => { allX.push(x); allY.push(y) }
        for (const f of proj.fixtures) add(f.x, f.y)
        for (const d of proj.distros) if (d.x !== undefined && d.y !== undefined) add(d.x, d.y)
        for (const d of proj.devices) if (d.x !== undefined && d.y !== undefined) add(d.x, d.y)
        for (const el of proj.elements) {
          add(el.x, el.y)
          if (el.type === 'rect') add(el.x + el.width, el.y + el.height)
          if (el.type === 'ellipse') { add(el.x - el.radiusX, el.y - el.radiusY); add(el.x + el.radiusX, el.y + el.radiusY) }
          if (el.type === 'truss' || el.type === 'cable') add(el.x2, el.y2)
          if (el.type === 'polygon') for (let i = 0; i < el.points.length; i += 2) add(el.x + el.points[i], el.y + el.points[i + 1])
        }
        const bg = proj.backgroundImage
        if (bg && bg.visible !== false) { add(bg.x, bg.y); add(bg.x + bg.width, bg.y + bg.height) }
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
    x: snapValue(v.x, gridSize, vo.snap),
    y: snapValue(v.y, gridSize, vo.snap),
  }), [gridSize, vo.snap])

  /**
   * Alt-drag duplicates: the copy is dropped at the original position and the
   * node under the cursor keeps moving, so you end up with one of each.
   */
  const handleDragStart = useCallback((id: string) => {
    if (!altDragRef.current) return
    altDragRef.current = false
    const state = useProjectStore.getState()
    const proj = state.project
    if (!proj) return
    const el = proj.elements.find((e) => e.id === id)
    if (el) { state.addElement({ ...el, id: generateId() }); return }
    const fixture = proj.fixtures.find((f) => f.id === id)
    if (fixture) {
      const nextCh = Math.max(0, ...proj.fixtures.map((f) => f.channel)) + 1
      state.addFixture({ ...fixture, id: generateId(), channel: nextCh })
    }
  }, [])

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

  /** Select a freshly drawn element and put the cursor in its label field. */
  const selectAndName = (id: string) => {
    setSelectedIds([id])
    useProjectStore.getState().setActiveTool('select')
    // Focus after the pointer is released: focusing during mousedown only gets
    // undone by the click that follows it.
    let done = false
    const focusLabel = () => {
      if (done) return
      done = true
      window.removeEventListener('pointerup', focusLabel)
      setLabelDraftId(id)
    }
    window.addEventListener('pointerup', focusLabel, { once: true })
    window.setTimeout(focusLabel, 300)
  }

  const handleStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    const isBackground = e.target === e.target.getStage() || e.target.name() === 'bg'
    // Alt over an object means duplicate-drag, so only pan with Alt over empty
    // space — otherwise Alt-dragging a shape just panned the view instead.
    altDragRef.current = e.evt.altKey && !isBackground
    if (activeTool === 'pan' || e.evt.button === 1 || (e.evt.altKey && isBackground)) {
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
      addElement({ id, type: 'rect', x: wp.x, y: wp.y, width: 4, height: 2, rotation: 0, locked: false, label: '', fill: '#d1d5db', stroke: '#374151', strokeWidth: 1, layerId: activeLayerId } as RectElement)
      selectAndName(id)
    }
    if (activeTool === 'ellipse') {
      const id = generateId()
      addElement({ id, type: 'ellipse', x: wp.x, y: wp.y, radiusX: 2, radiusY: 2, rotation: 0, locked: false, label: '', fill: '#d1d5db', stroke: '#374151', strokeWidth: 1, layerId: activeLayerId } as EllipseElement)
      selectAndName(id)
    }
    if (activeTool === 'polygon') {
      setPolyPoints((prev) => [...prev, wp])
    }
    if (activeTool === 'truss') {
      const id = generateId()
      addElement({ id, type: 'truss', x: wp.x, y: wp.y, x2: wp.x + 6, y2: wp.y, rotation: 0, locked: false, label: '', fill: '#374151', stroke: '#374151', strokeWidth: 2, layerId: activeLayerId } as TrussElement)
      selectAndName(id)
    }
    if (activeTool === 'text') {
      const text = window.prompt('Enter text:')
      if (!text) return
      const id = generateId()
      addElement({ id, type: 'text', x: wp.x, y: wp.y, text, fontSize: DEFAULT_TEXT_CM, rotation: 0, locked: false, label: '', fill: '#1f2937', stroke: '', strokeWidth: 0, layerId: activeLayerId } as TextElement)
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
      for (const f of selectableFixtures) {
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
      const selEl = selectableElements.filter((el) => inBox(el.x, el.y)).map((el) => el.id)
      const selFx = selectableFixtures.filter((f) => inBox(f.x, f.y)).map((f) => f.id)
      if (selEl.length + selFx.length > 0) setSelectedIds([...selEl, ...selFx])
      setSelectBox(null)
    }
    rubberStart.current = null
  }

  const handleStageDblClick = () => {
    if (activeTool === 'polygon' && polyPoints.length >= 3) {
      const id = generateId()
      const fp = polyPoints[0]
      const relPts = polyPoints.flatMap((p) => [p.x - fp.x, p.y - fp.y])
      addElement({ id, type: 'polygon', x: fp.x, y: fp.y, points: relPts, rotation: 0, locked: false, label: '', fill: '#d1d5db', stroke: '#374151', strokeWidth: 1, layerId: activeLayerId } as PolygonElement)
      setPolyPoints([])
      selectAndName(id)
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

  // Visible items still render when their layer is locked — locking only stops
  // them being selected or dragged, it does not hide them.
  const layerRank = (layerId?: string) => layerMap[layerId ?? '']?.order ?? -1
  const byLayerOrder = <T extends { layerId?: string }>(items: T[]): T[] =>
    items
      .map((item, i) => ({ item, i }))
      .sort((a, b) => layerRank(a.item.layerId) - layerRank(b.item.layerId) || a.i - b.i)
      .map(({ item }) => item)

  const visibleElements = byLayerOrder((project?.elements ?? []).filter((el) => isVisible(el.layerId)))
  const visibleFixtures = byLayerOrder((project?.fixtures ?? []).filter((f) => isVisible(f.layerId)))
  const selectableElements = visibleElements.filter((el) => !isLocked(el.layerId))
  const selectableFixtures = visibleFixtures.filter((f) => !isLocked(f.layerId))

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

        {vo.grid && <GridLayer width={size.width} height={size.height} view={view} gridSize={gridSize} />}

        {project?.backgroundImage && <BackgroundImageLayer img={project.backgroundImage} />}

        <Layer>
          {visibleElements.map((el) => (
            <StageElementNode
              key={el.id} el={el}
              selected={selectedIds.includes(el.id)}
              scale={view.scale}
              locked={isLocked(el.layerId)}
              vo={vo}
              freeform={freeform}
              onDragStart={handleDragStart}
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
              vo={vo}
              circuitRef={formatCircuitRef(project?.distros ?? [], f.circuitId)}
              draggable={activeTool === 'select' && !isLocked(f.layerId)}
              onDragStart={handleDragStart}
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
                selected={selectedIds.includes(d.id)}
                vo={vo}
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
                  vo={vo}
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

      {/* Scale bar overlay */}
      {vo.scaleBar && !freeform && (() => {
        const pxPerMetre = BASE_PX * view.scale
        const targets = [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100]
        const chosenM = targets.find((m) => m * pxPerMetre >= 60) ?? targets[targets.length - 1]
        const barPx = chosenM * pxPerMetre
        return (
          <div className='absolute bottom-8 left-3 pointer-events-none select-none flex flex-col items-start gap-0.5'>
            <div className='text-xs font-mono text-gray-600 bg-white/80 px-1 leading-none rounded-sm'>{chosenM >= 1 ? `${chosenM}m` : `${chosenM * 100}cm`}</div>
            <div className='flex items-center'>
              <div className='h-2.5 border-l-2 border-b-2 border-r-2 border-gray-600 rounded-b-sm' style={{ width: barPx }} />
            </div>
          </div>
        )
      })()}

      {/* Cursor position — only meaningful on a measured drawing */}
      {cursorPos && !freeform && (
        <div className='absolute bottom-2 left-2 bg-black/40 text-white text-xs font-mono px-2 py-0.5 rounded pointer-events-none select-none'>
          {cursorPos.x.toFixed(2)}m, {cursorPos.y.toFixed(2)}m
        </div>
      )}
      {freeform && (
        <div className='absolute bottom-2 left-2 text-xs font-medium text-gray-400 tracking-wide pointer-events-none select-none'>
          FREEFORM · NOT TO SCALE
        </div>
      )}
    </div>
  )
}
