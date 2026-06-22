import { useMemo, useRef, useState } from 'react'
import { useProjectStore } from '../../store/projectStore'
import type { CableElement, CableType, Device, Distro, PlacedFixture } from '../../types'

// ── Constants ─────────────────────────────────────────────────────────────────

const DATA_CABLE_TYPES = new Set<CableType>(['dmx-5pin', 'dmx-3pin', 'ethernet', 'cat6', 'fibre'])

const CABLE_STROKE: Partial<Record<CableType, string>> = {
  'dmx-5pin': '#8b5cf6',
  'dmx-3pin': '#a78bfa',
  'ethernet': '#0ea5e9',
  'cat6':     '#38bdf8',
  'fibre':    '#f59e0b',
}

const CATEGORY_LAYER: Record<string, number> = {
  console:       0,
  'media-server': 0,
  'network-switch': 1,
  'dmx-splitter':   1,
  amplifier:        2,
  'dimmer-rack':    3,
  'power-splitter': 3,
  other:            2,
}

const CATEGORY_COLOR: Record<string, string> = {
  console:          '#1e40af',
  'media-server':   '#4338ca',
  'network-switch': '#0369a1',
  'dmx-splitter':   '#7c3aed',
  amplifier:        '#065f46',
  'dimmer-rack':    '#92400e',
  'power-splitter': '#9f1239',
  other:            '#374151',
}

const CATEGORY_LABEL: Record<string, string> = {
  console:          'Console',
  'media-server':   'Media Server',
  'network-switch': 'Network Switch',
  'dmx-splitter':   'DMX Splitter',
  amplifier:        'Amplifier',
  'dimmer-rack':    'Dimmer Rack',
  'power-splitter': 'Power Splitter',
  other:            'Device',
}

// ── Layout ────────────────────────────────────────────────────────────────────

const NODE_W = 140
const NODE_H = 44
const NODE_GAP_X = 24
const NODE_GAP_Y = 70
const PAD_X = 28
const PAD_Y = 28

type NodeId = string
interface LayoutNode {
  id: NodeId
  label: string
  sublabel: string
  layer: number
  col: number
  x: number
  y: number
  color: string
  kind: 'device' | 'distro' | 'fixture'
}
interface LayoutEdge {
  from: NodeId
  to: NodeId
  cableType: CableType
  label: string
}

function buildLayout(
  devices: Device[],
  distros: Distro[],
  fixtures: PlacedFixture[],
  cables: CableElement[],
): { nodes: LayoutNode[]; edges: LayoutEdge[]; svgW: number; svgH: number } {
  const dataCables = cables.filter((c) => DATA_CABLE_TYPES.has(c.cableType))

  // Build adjacency to find which fixture/distro IDs are actually connected
  const connectedIds = new Set<string>()
  for (const c of dataCables) {
    if (c.startConnectedTo) connectedIds.add(c.startConnectedTo)
    if (c.endConnectedTo) connectedIds.add(c.endConnectedTo)
  }

  // Assign layers: devices get category-based layer, distros go layer 3, fixtures layer 4
  const rawNodes: Array<{ id: string; label: string; sublabel: string; layer: number; color: string; kind: LayoutNode['kind'] }> = []

  for (const d of devices) {
    rawNodes.push({
      id: d.id,
      label: d.name,
      sublabel: CATEGORY_LABEL[d.category] ?? 'Device',
      layer: CATEGORY_LAYER[d.category] ?? 2,
      color: CATEGORY_COLOR[d.category] ?? '#374151',
      kind: 'device',
    })
  }
  for (const d of distros) {
    if (!connectedIds.has(d.id) && devices.length > 0) continue // only show if connected (or no devices)
    rawNodes.push({
      id: d.id,
      label: d.name,
      sublabel: `${d.incomingRating}A · ${d.phases}Ø · ${d.circuits.length} circ`,
      layer: 3,
      color: '#991b1b',
      kind: 'distro',
    })
  }
  for (const f of fixtures) {
    if (!connectedIds.has(f.id)) continue
    rawNodes.push({
      id: f.id,
      label: `CH${f.channel}`,
      sublabel: f.shortName || f.model,
      layer: 4,
      color: '#1f2937',
      kind: 'fixture',
    })
  }

  // Group by layer, assign columns
  const byLayer: Map<number, typeof rawNodes> = new Map()
  for (const n of rawNodes) {
    if (!byLayer.has(n.layer)) byLayer.set(n.layer, [])
    byLayer.get(n.layer)!.push(n)
  }

  const layers = [...byLayer.keys()].sort()
  const colCounts: Map<number, number> = new Map()
  for (const [l, ns] of byLayer) colCounts.set(l, ns.length)
  const maxCols = Math.max(...[...colCounts.values()], 1)

  const nodes: LayoutNode[] = []
  for (const l of layers) {
    const ns = byLayer.get(l)!
    ns.forEach((n, col) => {
      const totalW = ns.length * NODE_W + (ns.length - 1) * NODE_GAP_X
      const startX = PAD_X + (maxCols * (NODE_W + NODE_GAP_X) - totalW) / 2
      nodes.push({
        ...n,
        col,
        x: startX + col * (NODE_W + NODE_GAP_X),
        y: PAD_Y + l * (NODE_H + NODE_GAP_Y),
      })
    })
  }

  const edges: LayoutEdge[] = dataCables
    .filter((c) => c.startConnectedTo && c.endConnectedTo)
    .map((c) => ({
      from: c.startConnectedTo!,
      to:   c.endConnectedTo!,
      cableType: c.cableType,
      label: c.autoLabel ?? '',
    }))

  const svgW = PAD_X * 2 + maxCols * (NODE_W + NODE_GAP_X) - NODE_GAP_X
  const svgH = PAD_Y * 2 + layers.length * (NODE_H + NODE_GAP_Y) - NODE_GAP_Y

  return { nodes, edges, svgW: Math.max(svgW, 400), svgH: Math.max(svgH, 200) }
}

// ── SVG rendering ──────────────────────────────────────────────────────────────

function NodeRect({ node, hovered, onClick }: { node: LayoutNode; hovered: boolean; onClick: () => void }) {
  return (
    <g transform={`translate(${node.x},${node.y})`} onClick={onClick} style={{ cursor: 'pointer' }}>
      <rect width={NODE_W} height={NODE_H} rx={6} ry={6}
        fill={node.color} opacity={hovered ? 1 : 0.88}
        stroke={hovered ? '#fff' : 'transparent'} strokeWidth={2}
      />
      <text x={NODE_W / 2} y={16} textAnchor='middle' fill='white' fontSize={11} fontWeight='bold' fontFamily='monospace'>
        {node.label.length > 18 ? node.label.slice(0, 17) + '…' : node.label}
      </text>
      <text x={NODE_W / 2} y={29} textAnchor='middle' fill='rgba(255,255,255,0.65)' fontSize={9} fontFamily='sans-serif'>
        {node.sublabel.length > 22 ? node.sublabel.slice(0, 21) + '…' : node.sublabel}
      </text>
    </g>
  )
}

function EdgeLine({ from, to, cableType, label }: { from: LayoutNode; to: LayoutNode; cableType: CableType; label: string }) {
  const x1 = from.x + NODE_W / 2
  const y1 = from.y + NODE_H
  const x2 = to.x + NODE_W / 2
  const y2 = to.y
  const cy = (y1 + y2) / 2
  const stroke = CABLE_STROKE[cableType] ?? '#94a3b8'
  return (
    <g>
      <path d={`M ${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2}`}
        fill='none' stroke={stroke} strokeWidth={1.5} strokeOpacity={0.7} />
      {label && (
        <text x={(x1 + x2) / 2} y={cy} textAnchor='middle' fill={stroke} fontSize={8} fontFamily='monospace'
          dy={-3}>{label}</text>
      )}
    </g>
  )
}

// ── Legend ─────────────────────────────────────────────────────────────────────

function Legend() {
  const items = [
    { label: 'DMX 5-pin', color: '#8b5cf6' },
    { label: 'DMX 3-pin', color: '#a78bfa' },
    { label: 'Ethernet',  color: '#0ea5e9' },
    { label: 'Cat6',      color: '#38bdf8' },
    { label: 'Fibre',     color: '#f59e0b' },
  ]
  return (
    <div className='flex flex-wrap gap-4 text-xs text-gray-500 mb-4'>
      {items.map((i) => (
        <span key={i.label} className='flex items-center gap-1.5'>
          <span className='inline-block w-6 h-0.5 rounded' style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function NetworkTopology() {
  const { project } = useProjectStore()
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const { nodes, edges, svgW, svgH } = useMemo(() => {
    if (!project) return { nodes: [], edges: [], svgW: 400, svgH: 200 }
    const cables = project.elements.filter((e) => e.type === 'cable') as CableElement[]
    return buildLayout(project.devices ?? [], project.distros, project.fixtures, cables)
  }, [project])

  if (!project) return null

  const hasDataCables = (project.elements.filter((e) => e.type === 'cable') as CableElement[])
    .some((c) => DATA_CABLE_TYPES.has(c.cableType))

  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const selectedNode = selectedId ? nodeMap.get(selectedId) : null
  const selectedFixture = selectedNode?.kind === 'fixture'
    ? project.fixtures.find((f) => f.id === selectedId)
    : null
  const selectedDistro = selectedNode?.kind === 'distro'
    ? project.distros.find((d) => d.id === selectedId)
    : null
  const selectedDevice = selectedNode?.kind === 'device'
    ? (project.devices ?? []).find((d) => d.id === selectedId)
    : null

  if (nodes.length === 0) {
    return (
      <div className='text-center py-16 text-gray-400 text-sm'>
        <div className='text-3xl mb-3'>🔌</div>
        <div className='font-medium text-gray-500 mb-1'>No network topology to display</div>
        <div className='text-xs'>Add devices (consoles, splitters, switches) and connect them<br />with DMX or Ethernet cables to see the topology here.</div>
      </div>
    )
  }

  if (!hasDataCables && nodes.length > 0) {
    return (
      <div className='text-center py-16 text-gray-400 text-sm'>
        <div className='text-3xl mb-3'>🔌</div>
        <div className='font-medium text-gray-500 mb-1'>Devices exist but no data cables drawn</div>
        <div className='text-xs'>Draw DMX or Ethernet cables between devices and fixtures<br />to see connections in this view.</div>
      </div>
    )
  }

  return (
    <div>
      <div className='text-sm font-semibold text-gray-700 mb-3'>Network / Data Topology</div>
      <Legend />
      <div className='flex gap-4'>
        <div className='flex-1 overflow-auto border border-gray-200 rounded-xl bg-gray-950'>
          <svg
            ref={svgRef}
            width={svgW}
            height={svgH}
            viewBox={`0 0 ${svgW} ${svgH}`}
            style={{ minWidth: svgW, display: 'block' }}
          >
            {/* Edges first so they appear behind nodes */}
            {edges.map((e, i) => {
              const from = nodeMap.get(e.from)
              const to   = nodeMap.get(e.to)
              if (!from || !to) return null
              return <EdgeLine key={i} from={from} to={to} cableType={e.cableType} label={e.label} />
            })}
            {nodes.map((n) => (
              <NodeRect
                key={n.id}
                node={n}
                hovered={hoveredId === n.id || selectedId === n.id}
                onClick={() => setSelectedId(selectedId === n.id ? null : n.id)}
              />
            ))}
            {/* Invisible hover targets */}
            {nodes.map((n) => (
              <rect key={`hit-${n.id}`}
                x={n.x} y={n.y} width={NODE_W} height={NODE_H}
                fill='transparent'
                onMouseEnter={() => setHoveredId(n.id)}
                onMouseLeave={() => setHoveredId(null)}
              />
            ))}
          </svg>
        </div>

        {/* Detail panel */}
        {selectedId && (selectedFixture || selectedDistro || selectedDevice) && (
          <div className='w-52 shrink-0 border border-gray-200 rounded-xl p-4 text-xs space-y-2'>
            {selectedFixture && <>
              <div className='font-semibold text-gray-700'>CH{selectedFixture.channel} · {selectedFixture.model}</div>
              <div className='text-gray-500'>{selectedFixture.manufacturer}</div>
              <div className='text-gray-400'>Universe {selectedFixture.universe} · Addr {selectedFixture.address}</div>
              {selectedFixture.powerRating > 0 && <div className='text-gray-400'>{selectedFixture.powerRating} W</div>}
            </>}
            {selectedDistro && <>
              <div className='font-semibold text-gray-700'>{selectedDistro.name}</div>
              {selectedDistro.ref && <div className='font-mono text-gray-500'>Ref: {selectedDistro.ref}</div>}
              <div className='text-gray-400'>{selectedDistro.incomingRating}A · {selectedDistro.phases}Ø</div>
              <div className='text-gray-400'>{selectedDistro.circuits.length} circuits</div>
            </>}
            {selectedDevice && <>
              <div className='font-semibold text-gray-700'>{selectedDevice.name}</div>
              <div className='text-gray-500'>{CATEGORY_LABEL[selectedDevice.category]}</div>
              {selectedDevice.manufacturer && <div className='text-gray-400'>{selectedDevice.manufacturer}</div>}
              {selectedDevice.model && <div className='text-gray-400'>{selectedDevice.model}</div>}
              {selectedDevice.universeCount && <div className='text-gray-400'>{selectedDevice.universeCount} universes</div>}
              {selectedDevice.notes && <div className='text-gray-400 italic'>{selectedDevice.notes}</div>}
            </>}
            <button className='mt-2 text-gray-400 hover:text-gray-600 text-xs' onClick={() => setSelectedId(null)}>✕ Close</button>
          </div>
        )}
      </div>
    </div>
  )
}
