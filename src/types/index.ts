export type ToolType =
  | 'select'
  | 'pan'
  | 'rect'
  | 'ellipse'
  | 'polygon'
  | 'truss'
  | 'text'
  | 'fixture'
  | 'cable'
  | 'calibrate'

export type FixtureSymbolType =
  | 'wash'
  | 'spot'
  | 'beam'
  | 'par'
  | 'strobe'
  | 'flood'
  | 'pixel'
  | 'other'

export type CableType =
  // DMX / data
  | 'dmx-5pin'
  | 'dmx-3pin'
  | 'ethernet'
  | 'cat6'
  | 'fibre'
  // Video
  | 'hdmi'
  | 'hdmi-fibre'
  | 'sdi'
  | 'displayport'
  // Power — single phase
  | 'power-13a'
  | 'power-16a'
  | 'power-32a'
  | 'power-63a'
  | 'power-125a'
  | 'iec'
  | 'true1-in'
  | 'true1-out'
  | 'powercon-blue'
  | 'powercon-grey'
  // Power — 3-phase
  | 'cee17-32a'
  | 'cee17-63a'
  | 'cee17-125a'
  // Multicore / distro
  | 'soca'
  | 'socapex'
  // Audio
  | 'nl2'
  | 'nl4'
  | 'nl8'
  | 'xlr'
  | 'jack-ts'
  | 'jack-trs'
  | 'audio-multicore'
  // Other
  | 'other'

export interface GDTFMode {
  name: string
  channelCount: number
}

export interface GDTFFixtureType {
  id: string
  manufacturer: string
  name: string
  shortName: string
  modes: GDTFMode[]
  weight?: number
  powerConsumption?: number
  beamAngle?: number
  colorTemperature?: number
  symbol: FixtureSymbolType
}

export interface BackgroundImage {
  src: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  visible: boolean
  locked: boolean
}

// ── Layers ────────────────────────────────────────────────────

export interface Layer {
  id: string
  name: string
  color: string
  visible: boolean
  locked: boolean
  order: number
}

// ── Canvas elements ───────────────────────────────────────────

interface BaseElement {
  id: string
  type: string
  x: number
  y: number
  rotation: number
  locked: boolean
  label: string
  fill: string
  stroke: string
  strokeWidth: number
  layerId?: string
}

export interface RectElement extends BaseElement {
  type: 'rect'
  width: number
  height: number
}

export interface EllipseElement extends BaseElement {
  type: 'ellipse'
  radiusX: number
  radiusY: number
}

export interface PolygonElement extends BaseElement {
  type: 'polygon'
  points: number[] // relative to (x,y) in meters: [x0,y0, x1,y1, ...]
}

export interface TrussElement extends BaseElement {
  type: 'truss'
  x2: number
  y2: number
}

export interface TextElement extends BaseElement {
  type: 'text'
  text: string
  fontSize: number
}

export interface CableElement extends BaseElement {
  type: 'cable'
  x2: number
  y2: number
  waypoints: { x: number; y: number }[] // intermediate vertices
  cableType: CableType
  startConnectedTo?: string // fixture.id | distro.id | device.id
  endConnectedTo?: string
  annotation?: string       // free-text printed alongside length on plot
  autoLabel?: string        // auto-assigned "C1", "C2" etc.
}

export type AnyElement = RectElement | EllipseElement | PolygonElement | TrussElement | TextElement | CableElement

// ── Fixtures ─────────────────────────────────────────────────

export interface PlacedFixture {
  id: string
  manufacturer: string
  model: string
  shortName: string
  symbol: FixtureSymbolType
  x: number
  y: number
  rotation: number
  // Identification
  channel: number      // CH — fixture identifier shown on plot and in reports
  // DMX
  universe: number
  address: number
  mode: string
  channelCount: number
  availableModes: GDTFMode[] // cached from GDTF at placement time
  // Circuit
  circuitId?: string
  // Physical
  weight: number
  powerRating: number
  // Meta
  label: string        // custom annotation shown below symbol
  notes: string
  color: string        // gel / colour
  dimmerNumber: string
  layerId?: string
}

// ── Fixture groups ────────────────────────────────────────────

export interface FixtureGroup {
  id: string
  name: string
  color: string          // swatch shown in UI
  fixtureIds: string[]
}

// ── Generic technical devices ──────────────────────────────────
// Consoles, media servers, splitters, switchers, amps, etc.
// Placed on canvas, can be cable-connected, appear in equipment report.

export type DeviceCategory =
  | 'console'
  | 'dimmer-rack'
  | 'media-server'
  | 'network-switch'
  | 'dmx-splitter'
  | 'power-splitter'
  | 'amplifier'
  | 'other'

export interface Device {
  id: string
  category: DeviceCategory
  name: string
  manufacturer?: string
  model?: string
  notes?: string
  // Canvas placement
  x?: number
  y?: number
  layerId?: string
  // Specs
  universeCount?: number   // for consoles/splitters
  powerRating?: number     // watts
  weight?: number
}

// ── Power / Circuits ──────────────────────────────────────────

export interface Circuit {
  id: string
  name: string
  rating: number
  voltage: number
  phase: 1 | 2 | 3
}

export interface Distro {
  id: string
  name: string
  ref?: string       // Short identifier shown in power notation: "A", "B", "DSR"
  incomingRating: number
  phases: 1 | 3
  circuits: Circuit[]
  // Canvas placement (optional)
  x?: number
  y?: number
  layerId?: string
}

// ── Project ───────────────────────────────────────────────────

export interface ProjectInfo {
  name: string
  venue: string
  venueAddress: string
  projectDate: string
  lightingDesigner: string
  technicalDirector: string
  drawingAuthor: string
  companyName: string
  companyLogo?: string
  clientName?: string
  clientLogo?: string
}

export interface Project {
  id: string
  info: ProjectInfo
  version: number
  backgroundImage?: BackgroundImage
  layers: Layer[]
  elements: AnyElement[]
  fixtures: PlacedFixture[]
  distros: Distro[]
  devices: Device[]
  groups: FixtureGroup[]
  createdAt: string
  updatedAt: string
}

// ── UI state ──────────────────────────────────────────────────

export interface CanvasViewState {
  scale: number
  x: number
  y: number
}

// ── Cable metadata ────────────────────────────────────────────

export const CABLE_COLORS: Record<CableType, string> = {
  'dmx-5pin':       '#a855f7',
  'dmx-3pin':       '#c084fc',
  ethernet:         '#3b82f6',
  cat6:             '#60a5fa',
  fibre:            '#93c5fd',
  hdmi:             '#06b6d4',
  'hdmi-fibre':     '#22d3ee',
  sdi:              '#0891b2',
  displayport:      '#0e7490',
  'power-13a':      '#f97316',
  'power-16a':      '#ef4444',
  'power-32a':      '#dc2626',
  'power-63a':      '#b91c1c',
  'power-125a':     '#991b1b',
  iec:              '#fbbf24',
  'true1-in':       '#fb923c',
  'true1-out':      '#c2410c',
  'powercon-blue':  '#2563eb',
  'powercon-grey':  '#6b7280',
  'cee17-32a':      '#f59e0b',
  'cee17-63a':      '#d97706',
  'cee17-125a':     '#b45309',
  soca:             '#ec4899',
  socapex:          '#db2777',
  nl2:              '#22c55e',
  nl4:              '#16a34a',
  nl8:              '#15803d',
  xlr:              '#84cc16',
  'jack-ts':        '#65a30d',
  'jack-trs':       '#4d7c0f',
  'audio-multicore':'#a3e635',
  other:            '#9ca3af',
}

export const CABLE_LABELS: Record<CableType, string> = {
  'dmx-5pin':       'DMX 5-pin',
  'dmx-3pin':       'DMX 3-pin',
  ethernet:         'Ethernet',
  cat6:             'CAT6',
  fibre:            'Fibre',
  hdmi:             'HDMI',
  'hdmi-fibre':     'HDMI Fibre',
  sdi:              'SDI',
  displayport:      'DisplayPort',
  'power-13a':      '13A Power',
  'power-16a':      '16A Power',
  'power-32a':      '32A Power',
  'power-63a':      '63A Power',
  'power-125a':     '125A Power',
  iec:              'IEC Kettle',
  'true1-in':       'True1 (In)',
  'true1-out':      'True1 (Out)',
  'powercon-blue':  'PowerCon Blue (In)',
  'powercon-grey':  'PowerCon Grey (Out)',
  'cee17-32a':      'CEE17 32A',
  'cee17-63a':      'CEE17 63A',
  'cee17-125a':     'CEE17 125A',
  soca:             'SOCA',
  socapex:          'Socapex',
  nl2:              'Speakon NL2',
  nl4:              'Speakon NL4',
  nl8:              'Speakon NL8',
  xlr:              'XLR Audio',
  'jack-ts':        'Jack TS',
  'jack-trs':       'Jack TRS',
  'audio-multicore':'Audio Multicore',
  other:            'Other',
}

// Cable groups for display in picker
export const CABLE_GROUPS: { label: string; types: CableType[] }[] = [
  { label: 'DMX / Data', types: ['dmx-5pin', 'dmx-3pin', 'ethernet', 'cat6', 'fibre'] },
  { label: 'Video', types: ['hdmi', 'hdmi-fibre', 'sdi', 'displayport'] },
  { label: 'Power', types: ['power-13a', 'power-16a', 'power-32a', 'power-63a', 'power-125a', 'iec', 'true1-in', 'true1-out', 'powercon-blue', 'powercon-grey', 'cee17-32a', 'cee17-63a', 'cee17-125a'] },
  { label: 'Multicore / Distro', types: ['soca', 'socapex'] },
  { label: 'Audio', types: ['nl2', 'nl4', 'nl8', 'xlr', 'jack-ts', 'jack-trs', 'audio-multicore'] },
  { label: 'Other', types: ['other'] },
]

export const DEFAULT_LAYERS: Layer[] = [
  { id: 'stage',    name: 'Stage',    color: '#6b7280', visible: true, locked: false, order: 0 },
  { id: 'lighting', name: 'Lighting', color: '#3b82f6', visible: true, locked: false, order: 1 },
  { id: 'cables',   name: 'Cables',   color: '#f97316', visible: true, locked: false, order: 2 },
  { id: 'power',    name: 'Power',    color: '#ef4444', visible: true, locked: false, order: 3 },
]

// ── Distro presets ────────────────────────────────────────────

export interface DistroPreset {
  label: string
  name: string
  incomingRating: number
  phases: 1 | 3
  circuits: { name: string; rating: number; voltage: number; phase: 1 | 2 | 3 }[]
}

function ways3ph(count: number, rating: number, prefix = 'W'): DistroPreset['circuits'] {
  return Array.from({ length: count }, (_, i) => ({
    name: `${prefix}${i + 1}`,
    rating,
    voltage: 230,
    phase: ((i % 3) + 1) as 1 | 2 | 3,
  }))
}
function ways1ph(count: number, rating: number, prefix = 'W'): DistroPreset['circuits'] {
  return Array.from({ length: count }, (_, i) => ({
    name: `${prefix}${i + 1}`,
    rating,
    voltage: 230,
    phase: 1 as 1,
  }))
}

export const DISTRO_PRESETS: DistroPreset[] = [
  {
    label: 'Socapex 6-way (63A 3Ø)',
    name: 'Socapex',
    incomingRating: 63,
    phases: 3,
    circuits: [
      { name: 'W1', rating: 16, voltage: 230, phase: 1 },
      { name: 'W2', rating: 16, voltage: 230, phase: 2 },
      { name: 'W3', rating: 16, voltage: 230, phase: 3 },
      { name: 'W4', rating: 16, voltage: 230, phase: 1 },
      { name: 'W5', rating: 16, voltage: 230, phase: 2 },
      { name: 'W6', rating: 16, voltage: 230, phase: 3 },
    ],
  },
  { label: '12-way 16A (63A 3Ø)',  name: 'Distro 12×16A', incomingRating: 63,  phases: 3, circuits: ways3ph(12, 16) },
  { label: '12-way 32A (125A 3Ø)', name: 'Distro 12×32A', incomingRating: 125, phases: 3, circuits: ways3ph(12, 32) },
  { label: '6-way 32A (63A 3Ø)',   name: 'Distro 6×32A',  incomingRating: 63,  phases: 3, circuits: ways3ph(6,  32) },
  { label: '6-way 16A (32A 3Ø)',   name: 'Distro 6×16A',  incomingRating: 32,  phases: 3, circuits: ways3ph(6,  16) },
  { label: 'Dimmer Rack 12-way (63A 3Ø)', name: 'Dimmer Rack', incomingRating: 63, phases: 3, circuits: ways3ph(12, 16, 'Dim ') },
  { label: '6-way 16A (32A 1Ø)',   name: 'Distro 6×16A',  incomingRating: 32,  phases: 1, circuits: ways1ph(6,  16) },
  { label: '4-way 32A (63A 1Ø)',   name: 'Distro 4×32A',  incomingRating: 63,  phases: 1, circuits: ways1ph(4,  32) },
  { label: '4-way 16A (32A 1Ø)',   name: 'Distro 4×16A',  incomingRating: 32,  phases: 1, circuits: ways1ph(4,  16) },
  { label: '6-way 13A (13A 1Ø)',   name: '13A Multi-way', incomingRating: 13,  phases: 1, circuits: ways1ph(6,  13) },
  { label: 'Custom',               name: 'Custom Distro', incomingRating: 32,  phases: 1, circuits: [] },
]
