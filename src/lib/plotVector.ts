// Vector renderer for the lighting plot.
//
// The plot is drawn straight into the PDF with vector primitives rather than
// being screenshotted off the Konva canvas. That means the export is:
//   • drawn at a real architectural scale (1:50, 1:100 …), not "whatever the
//     viewport happened to show",
//   • independent of pan/zoom, window size and the canvas even being mounted,
//   • free of selection handles, rubber bands and other on-screen furniture,
//   • crisp at any print size and zoom level,
//   • able to honour a layer selection.

import type jsPDF from 'jspdf'
import type {
  Project, AnyElement, PlacedFixture, Distro, Device, BackgroundImage,
  RectElement, EllipseElement, PolygonElement, TrussElement, TextElement, CableElement,
  CableType, FixtureSymbolType,
} from '../types'
import { CABLE_COLORS, CABLE_LABELS } from '../types'
import { symbolShapes, symbolLineWidth, symbolExtent, symbolBox } from './symbolGeometry'
import type { FillRole } from './symbolGeometry'
import { symbolColors, SYMBOL_RADIUS_M } from './symbols'
import { cableLength } from './utils'
import { resolvePositions } from './positions'
import type { ResolvedPositions } from './positions'

// ── Paper ─────────────────────────────────────────────────────────────────────

export type PaperSize = 'a4' | 'a3' | 'a2' | 'a1'
export type Orientation = 'landscape' | 'portrait'

/** Paper dimensions in mm, portrait (width × height). */
export const PAPER_MM: Record<PaperSize, [number, number]> = {
  a4: [210, 297],
  a3: [297, 420],
  a2: [420, 594],
  a1: [594, 841],
}

export const PAPER_LABELS: Record<PaperSize, string> = {
  a4: 'A4', a3: 'A3', a2: 'A2', a1: 'A1',
}

/** Drawing scales offered in the UI, as the denominator of 1:N. */
export const STANDARD_SCALES = [10, 20, 25, 50, 75, 100, 150, 200, 250, 500] as const

export function paperDimensions(size: PaperSize, orientation: Orientation): { w: number; h: number } {
  const [pw, ph] = PAPER_MM[size]
  return orientation === 'landscape' ? { w: ph, h: pw } : { w: pw, h: ph }
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface PlotOptions {
  paper: PaperSize
  orientation: Orientation
  /**
   * 'fit' fills the sheet exactly; 'standard' snaps down to the largest
   * standard architectural scale that still fits; a number is that scale.
   */
  scale: 'fit' | 'standard' | number
  showGrid: boolean
  showBackground: boolean
  showChannels: boolean
  showAddresses: boolean
  showUnitNumbers: boolean
  showColours: boolean
  showPurposes: boolean
  showFixtureLabels: boolean
  showCableLabels: boolean
  showLegend: boolean
  colorByLayer: boolean
  /**
   * Schematic sheet: fills the frame, prints "not to scale", and drops every
   * measurement derived from the geometry. Set from the project, not the UI.
   */
  freeform: boolean
}

export const DEFAULT_PLOT_OPTIONS: PlotOptions = {
  paper: 'a3',
  orientation: 'landscape',
  scale: 'fit',
  showGrid: false,
  showBackground: true,
  showChannels: true,
  showAddresses: true,
  showUnitNumbers: true,
  showColours: true,
  showPurposes: true,
  showFixtureLabels: true,
  showCableLabels: true,
  showLegend: true,
  colorByLayer: false,
  freeform: false,
}

// ── Content selection ─────────────────────────────────────────────────────────

export interface PlotContent {
  elements: AnyElement[]
  fixtures: PlacedFixture[]
  distros: Distro[]
  devices: Device[]
  background?: BackgroundImage
}

export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

/**
 * Picks the parts of a project that belong on the drawing.
 * `layerIds === undefined` means "every layer". Items with no layer assignment
 * are always included — they would otherwise be invisible in every export.
 */
export function selectPlotContent(project: Project, layerIds?: string[], includeBackground = true): PlotContent {
  const ids = layerIds ? new Set(layerIds) : null
  const onLayer = (layerId: string | undefined, fallback?: string) => {
    if (!ids) return true
    const id = layerId ?? fallback
    if (!id) return true
    return ids.has(id)
  }

  // Draw order follows the layer stack, then the order items were created.
  const layerOrder = new Map(project.layers.map((l) => [l.id, l.order]))
  const rank = (layerId?: string) => layerOrder.get(layerId ?? '') ?? -1

  const elements = project.elements
    .filter((el) => onLayer(el.layerId))
    .map((el, i) => ({ el, i }))
    .sort((a, b) => rank(a.el.layerId) - rank(b.el.layerId) || a.i - b.i)
    .map(({ el }) => el)

  return {
    elements,
    fixtures: project.fixtures.filter((f) => onLayer(f.layerId)),
    distros: project.distros.filter((d) => d.x !== undefined && d.y !== undefined && onLayer(d.layerId, 'power')),
    devices: project.devices.filter((d) => d.x !== undefined && d.y !== undefined && onLayer(d.layerId)),
    background: includeBackground && project.backgroundImage?.visible !== false ? project.backgroundImage : undefined,
  }
}

/** Extent of everything on the drawing, in metres. Null when there is nothing. */
export function contentBounds(content: PlotContent): Bounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let any = false
  const add = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    any = true
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minY = Math.min(minY, y); maxY = Math.max(maxY, y)
  }
  const addBox = (x: number, y: number, w: number, h: number, rotationDeg = 0) => {
    if (!rotationDeg) { add(x, y); add(x + w, y + h); return }
    const rad = (rotationDeg * Math.PI) / 180
    const cos = Math.cos(rad), sin = Math.sin(rad)
    for (const [dx, dy] of [[0, 0], [w, 0], [w, h], [0, h]]) {
      add(x + dx * cos - dy * sin, y + dx * sin + dy * cos)
    }
  }

  for (const f of content.fixtures) {
    const ext = symbolExtent(f.symbol)
    const reach = Math.max(ext.x, ext.y) * SYMBOL_RADIUS_M
    add(f.x - reach, f.y - reach)
    add(f.x + reach, f.y + reach)
  }
  for (const el of content.elements) {
    switch (el.type) {
      case 'rect': { const r = el as RectElement; addBox(r.x, r.y, r.width, r.height, r.rotation); break }
      case 'ellipse': { const e = el as EllipseElement; const m = Math.max(e.radiusX, e.radiusY); add(e.x - m, e.y - m); add(e.x + m, e.y + m); break }
      case 'polygon': { const p = el as PolygonElement; for (let i = 0; i < p.points.length; i += 2) add(p.x + p.points[i], p.y + p.points[i + 1]); break }
      case 'truss': { const t = el as TrussElement; add(t.x, t.y); add(t.x2, t.y2); break }
      case 'cable': { const c = el as CableElement; add(c.x, c.y); add(c.x2, c.y2); for (const w of c.waypoints ?? []) add(w.x, w.y); break }
      case 'text': { const t = el as TextElement; add(t.x, t.y); add(t.x + Math.max(1, t.text.length * 0.12), t.y + 0.4); break }
    }
  }
  for (const d of content.distros) { add((d.x ?? 0) - 0.9, (d.y ?? 0) - 0.6); add((d.x ?? 0) + 0.9, (d.y ?? 0) + 0.6) }
  for (const d of content.devices) { add((d.x ?? 0) - 0.8, (d.y ?? 0) - 0.5); add((d.x ?? 0) + 0.8, (d.y ?? 0) + 0.5) }
  if (content.background) {
    const b = content.background
    addBox(b.x, b.y, b.width, b.height, b.rotation)
  }

  if (!any) return null
  // A little breathing room so annotations near the edge are not clipped.
  const padX = Math.max(0.25, (maxX - minX) * 0.015)
  const padY = Math.max(0.25, (maxY - minY) * 0.015)
  return { minX: minX - padX, minY: minY - padY, maxX: maxX + padX, maxY: maxY + padY }
}

export interface ScaleChoice {
  /** mm of paper per metre of world. */
  mmPerM: number
  /** Denominator of the 1:N ratio. */
  denominator: number
  /** True when the denominator is one of the standard architectural scales. */
  standard: boolean
  /** True when the drawing does not fit the frame at this scale. */
  overflow: boolean
  /** Schematic sheet — the ratio is an artefact of fitting, not a statement. */
  notToScale?: boolean
}

export function chooseScale(bounds: Bounds, frameW: number, frameH: number, requested: PlotOptions['scale']): ScaleChoice {
  const worldW = Math.max(0.5, bounds.maxX - bounds.minX)
  const worldH = Math.max(0.5, bounds.maxY - bounds.minY)
  const maxMmPerM = Math.min(frameW / worldW, frameH / worldH)

  if (typeof requested === 'number' && requested > 0) {
    const mmPerM = 1000 / requested
    return { mmPerM, denominator: requested, standard: true, overflow: mmPerM > maxMmPerM * 1.001 }
  }

  if (requested === 'standard') {
    const standard = STANDARD_SCALES.find((d) => 1000 / d <= maxMmPerM)
    if (standard) return { mmPerM: 1000 / standard, denominator: standard, standard: true, overflow: false }
  }

  // Fill the sheet: use the exact ratio that fits and report it honestly. The
  // denominator is rounded up by a whole number so the printed ratio is true
  // rather than flattering.
  const denominator = Math.ceil(1000 / maxMmPerM)
  return { mmPerM: 1000 / denominator, denominator, standard: false, overflow: false }
}

// ── Colour helpers ────────────────────────────────────────────────────────────

type RGB = [number, number, number]

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full.slice(0, 6), 16)
  if (Number.isNaN(n)) return [107, 114, 128]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Blends a colour towards white — stands in for alpha in vector output. */
function lighten(rgb: RGB, amount: number): RGB {
  return rgb.map((c) => Math.round(c + (255 - c) * amount)) as RGB
}

const INK: RGB = [17, 24, 39]
const MUTED: RGB = [113, 122, 138]
const HAIRLINE: RGB = [188, 195, 206]
const PAPER_WHITE: RGB = [255, 255, 255]

/**
 * Pen table. A drawing reads properly only when line weights are ranked, the
 * way a CAD pen set ranks them: sheet border heaviest, then built structure,
 * then equipment, then annotation, then the grid underneath everything.
 */
export const PEN = {
  border: 0.7,
  frame: 0.25,
  hair: 0.08,
  archHeavy: 0.4,
  archMed: 0.22,
  archLight: 0.12,
  anno: 0.1,
  grid: 0.04,
} as const

// ── Low level drawing ─────────────────────────────────────────────────────────

/** World metres → paper mm. */
export interface Transform {
  x: (wx: number) => number
  y: (wy: number) => number
  mmPerM: number
}

function makeTransform(bounds: Bounds, frame: Rect, mmPerM: number): Transform {
  const drawnW = (bounds.maxX - bounds.minX) * mmPerM
  const drawnH = (bounds.maxY - bounds.minY) * mmPerM
  const offX = frame.x + (frame.w - drawnW) / 2
  const offY = frame.y + (frame.h - drawnH) / 2
  return {
    x: (wx) => offX + (wx - bounds.minX) * mmPerM,
    y: (wy) => offY + (wy - bounds.minY) * mmPerM,
    mmPerM,
  }
}

export interface Rect { x: number; y: number; w: number; h: number }

export function setDraw(pdf: jsPDF, c: RGB, lw: number) {
  pdf.setDrawColor(c[0], c[1], c[2])
  pdf.setLineWidth(lw)
}
export function setFill(pdf: jsPDF, c: RGB) { pdf.setFillColor(c[0], c[1], c[2]) }
export function setText(pdf: jsPDF, c: RGB) { pdf.setTextColor(c[0], c[1], c[2]) }

export interface TextStyle {
  size?: number
  color?: RGB
  bold?: boolean
  italic?: boolean
  /** Letter spacing in mm — drawing captions are traditionally tracked out. */
  spacing?: number
  align?: 'left' | 'center' | 'right'
  /** Paints white behind the text so it stays readable over line work. */
  backdrop?: boolean
  maxW?: number
}

/** pt → mm */
const PT = 0.3527

export function drawText(pdf: jsPDF, text: string, x: number, y: number, style: TextStyle = {}) {
  if (!text) return
  const size = style.size ?? 5
  pdf.setFont('helvetica', style.bold ? 'bold' : style.italic ? 'italic' : 'normal')
  pdf.setFontSize(size)
  if (style.spacing) pdf.setCharSpace(style.spacing)

  let out = text
  if (style.maxW) out = fitText(pdf, text, style.maxW, style.spacing ?? 0)

  if (style.backdrop) {
    const w = pdf.getTextWidth(out) + (style.spacing ?? 0) * out.length
    const h = size * PT
    const x0 = style.align === 'center' ? x - w / 2 : style.align === 'right' ? x - w : x
    setFill(pdf, PAPER_WHITE)
    pdf.rect(x0 - 0.35, y - h * 0.82, w + 0.7, h * 1.08, 'F')
  }

  setText(pdf, style.color ?? INK)
  pdf.text(out, x, y, { align: style.align ?? 'left' })
  if (style.spacing) pdf.setCharSpace(0)
}

/** Small tracked-out uppercase caption, as used on every cell of a title block. */
export function drawCaption(pdf: jsPDF, text: string, x: number, y: number, style: TextStyle = {}) {
  drawText(pdf, text.toUpperCase(), x, y, {
    size: 4.6, color: MUTED, spacing: 0.28, ...style,
  })
}

/** Draws a polyline/polygon from flat [x0,y0,x1,y1,…] paper coordinates. */
function polyline(pdf: jsPDF, pts: number[], style: 'S' | 'F' | 'FD' | null, closed = false) {
  if (pts.length < 4) return
  pdf.moveTo(pts[0], pts[1])
  for (let i = 2; i < pts.length; i += 2) pdf.lineTo(pts[i], pts[i + 1])
  if (closed) pdf.lineTo(pts[0], pts[1])
  if (style === 'S') pdf.stroke()
  else if (style === 'F') pdf.fill()
  else if (style === 'FD') pdf.fillStroke()
  else pdf.discardPath()
}

function clipped(pdf: jsPDF, frame: Rect, body: () => void) {
  pdf.saveGraphicsState()
  try {
    pdf.rect(frame.x, frame.y, frame.w, frame.h, null)
    pdf.clip()
    pdf.discardPath()
  } catch { /* clipping unsupported — draw unclipped rather than not at all */ }
  try { body() } finally { pdf.restoreGraphicsState() }
}

function withOpacity(pdf: jsPDF, opacity: number, body: () => void) {
  if (opacity >= 0.999) { body(); return }
  pdf.saveGraphicsState()
  try {
    const withGState = pdf as jsPDF & { GState?: (o: { opacity: number }) => unknown }
    if (withGState.GState) pdf.setGState(withGState.GState({ opacity }))
  } catch { /* opacity unsupported — draw solid */ }
  try { body() } finally { pdf.restoreGraphicsState() }
}

/** Truncates text with an ellipsis so it fits `maxW` mm at the current font. */
export function fitText(pdf: jsPDF, text: string, maxW: number, spacing = 0): string {
  if (!text || maxW <= 0) return ''
  const width = (s: string) => pdf.getTextWidth(s) + spacing * s.length
  if (width(text) <= maxW) return text
  let lo = 0, hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (width(text.slice(0, mid) + '…') <= maxW) lo = mid
    else hi = mid - 1
  }
  return lo > 0 ? text.slice(0, lo) + '…' : ''
}

// ── Fixture symbols ───────────────────────────────────────────────────────────

/** Line weight base (mm) for symbol geometry — 1 unit ≈ 0.11 mm. */
const SYMBOL_LW_MM = 0.11

export function drawFixtureSymbol(
  pdf: jsPDF,
  type: FixtureSymbolType,
  cx: number,
  cy: number,
  rMm: number,
  rotationDeg: number,
  accentOverride?: RGB,
) {
  const colors = symbolColors(type)
  const accent = accentOverride ?? hexToRgb(colors.stroke)
  const typeFill = hexToRgb(colors.fill)
  const rad = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  const tx = (x: number, y: number): [number, number] => [
    cx + (x * cos - y * sin) * rMm,
    cy + (x * sin + y * cos) * rMm,
  ]

  const paint = (role?: FillRole): RGB | null => {
    switch (role) {
      case 'body': return PAPER_WHITE
      case 'accent': return accent
      case 'tint': return lighten(typeFill, 0.66)
      case 'type': return typeFill
      default: return null
    }
  }

  for (const p of symbolShapes(type)) {
    const lw = symbolLineWidth(p.lw ?? 1, SYMBOL_LW_MM)
    const fill = paint(p.fill)
    const style = fill && lw > 0 ? 'FD' : fill ? 'F' : lw > 0 ? 'S' : null
    if (!style) continue
    if (fill) setFill(pdf, fill)
    if (lw > 0) setDraw(pdf, accent, lw)

    if (p.k === 'circle') {
      const [x, y] = tx(p.cx ?? 0, p.cy ?? 0)
      pdf.circle(x, y, p.r * rMm, style)
    } else if (p.k === 'rect') {
      const corners = [
        [p.x, p.y], [p.x + p.w, p.y], [p.x + p.w, p.y + p.h], [p.x, p.y + p.h],
      ].flatMap(([x, y]) => tx(x, y))
      polyline(pdf, corners, style, true)
    } else {
      const pts: number[] = []
      for (let i = 0; i < p.pts.length; i += 2) pts.push(...tx(p.pts[i], p.pts[i + 1]))
      polyline(pdf, pts, style, p.closed)
    }
  }
}

// ── The drawing ───────────────────────────────────────────────────────────────

export interface LegendItem {
  key: string
  label: string
  symbol: FixtureSymbolType
  count: number
  watts: number
  weight: number
}

export interface PlotRenderResult {
  scale: ScaleChoice
  bounds: Bounds | null
  legendItems: LegendItem[]
  cableTypes: CableType[]
  /** Totals for the instrument summary. */
  totals: { count: number; watts: number; weight: number }
  positions: ResolvedPositions
}

/** 630 W / 6.3 kW — schedules read better when the unit follows the magnitude. */
function formatWatts(w: number): string {
  return w >= 1000 ? `${(w / 1000).toFixed(1)} kW` : `${Math.round(w)} W`
}

function legendItemsFor(content: PlotContent): LegendItem[] {
  const map = new Map<string, LegendItem>()
  for (const f of content.fixtures) {
    const key = `${f.manufacturer} ${f.model}`.trim() || 'Fixture'
    const item = map.get(key)
    if (item) {
      item.count += 1
      item.watts += f.powerRating
      item.weight += f.weight
    } else {
      map.set(key, { key, label: key, symbol: f.symbol, count: 1, watts: f.powerRating, weight: f.weight })
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

function cableTypesIn(content: PlotContent): CableType[] {
  const set = new Set<CableType>()
  for (const el of content.elements) if (el.type === 'cable') set.add((el as CableElement).cableType)
  return [...set]
}

/** Annotation grows with the sheet: a bigger drawing is read from further away. */
const ANNOTATION_SCALE: Record<PaperSize, number> = { a4: 0.92, a3: 1, a2: 1.2, a1: 1.45 }

// ── Label placement ───────────────────────────────────────────────────────────
// Labels are placed after the line work, trying a few sensible spots and taking
// the first one that does not sit on a fixture, a truss or another label.

interface Box { l: number; t: number; r: number; b: number }

const overlaps = (a: Box, b: Box) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t
const inside = (a: Box, f: Rect) => a.l >= f.x && a.r <= f.x + f.w && a.t >= f.y && a.b <= f.y + f.h

function pickSpot<T extends { box: Box }>(candidates: T[], obstacles: Box[], frame: Rect): T {
  const visible = candidates.filter((c) => inside(c.box, frame))
  return visible.find((c) => !obstacles.some((o) => overlaps(c.box, o))) ?? visible[0] ?? candidates[0]
}

/** Where a fixture's symbol and annotation fall on paper. */
interface FixtureLayout {
  cx: number
  cy: number
  rMm: number
  /** Symbol bounding box on paper, after rotation. */
  sym: Box
}

function fixtureLayout(f: PlacedFixture, t: Transform, rMm: number): FixtureLayout {
  const cx = t.x(f.x), cy = t.y(f.y)
  const b = symbolBox(f.symbol, f.rotation)
  return { cx, cy, rMm, sym: { l: cx + b.minX * rMm, t: cy + b.minY * rMm, r: cx + b.maxX * rMm, b: cy + b.maxY * rMm } }
}

/**
 * Draws the plot into `frame` (mm). Returns the scale actually used so the
 * caller can print it in the title block.
 */
export function drawPlot(
  pdf: jsPDF,
  project: Project,
  content: PlotContent,
  frame: Rect,
  opts: PlotOptions,
  gridSize = 1,
  /** Shared extent for a multi-page set, so every page lines up at one scale. */
  sharedBounds?: Bounds | null,
): PlotRenderResult {
  const bounds = sharedBounds ?? contentBounds(content)
  const legendItems = legendItemsFor(content)
  const totals = legendItems.reduce(
    (acc, i) => ({ count: acc.count + i.count, watts: acc.watts + i.watts, weight: acc.weight + i.weight }),
    { count: 0, watts: 0, weight: 0 },
  )
  // Unit numbers come from the whole rig, so a sheet showing only some layers
  // still numbers a fixture the way every other sheet does.
  const positions = resolvePositions(project)
  const base = { legendItems, cableTypes: cableTypesIn(content), totals, positions }

  if (!bounds) {
    drawText(pdf, 'Nothing to draw on the selected layers.', frame.x + frame.w / 2, frame.y + frame.h / 2, {
      size: 8, color: MUTED, align: 'center',
    })
    return { ...base, scale: { mmPerM: 20, denominator: 50, standard: true, overflow: false }, bounds: null }
  }

  // The drawing is fitted inside a small margin so the annotation around the
  // outermost fixtures has somewhere to go; the clip stays at the full frame.
  const fit = { x: frame.x + 6, y: frame.y + 7, w: frame.w - 12, h: frame.h - 16 }
  const scale = chooseScale(bounds, fit.w, fit.h, opts.freeform ? 'fit' : opts.scale)
  if (opts.freeform) scale.notToScale = true
  const t = makeTransform(bounds, fit, scale.mmPerM)
  const k = ANNOTATION_SCALE[opts.paper]

  // Symbols are drawn near true size but never so small they stop reading.
  const rMm = Math.max(1.6, Math.min(4.5 * k, SYMBOL_RADIUS_M * t.mmPerM))
  const layouts = new Map(content.fixtures.map((f) => [f.id, fixtureLayout(f, t, rMm)]))

  clipped(pdf, frame, () => {
    if (opts.showBackground && content.background) drawBackground(pdf, content.background, t)
    if (opts.showGrid) drawGrid(pdf, bounds, t, gridSize)
    drawElements(pdf, content, project, t, opts)
    drawDistrosAndDevices(pdf, content, t)
    drawFixtureSymbols(pdf, content.fixtures, project, layouts, opts)
    drawElementLabels(pdf, content, project, t, opts, layouts, frame, k)
    for (const f of content.fixtures) {
      const pos = positions.byFixture.get(f.id)
      drawFixtureAnnotation(pdf, layouts.get(f.id)!, {
        channel: f.channel > 0 ? String(f.channel) : '',
        unit: pos && pos.unit > 0 ? String(pos.unit) : '',
        address: `${f.universe}.${String(f.address).padStart(3, '0')}`,
        colour: f.color ?? '',
        purpose: f.purpose ?? '',
        label: f.label ?? '',
      }, opts, k)
    }
  })

  return { ...base, scale, bounds }
}

function drawBackground(pdf: jsPDF, bg: BackgroundImage, t: Transform) {
  const w = bg.width * t.mmPerM
  const h = bg.height * t.mmPerM
  if (w <= 0 || h <= 0) return
  withOpacity(pdf, bg.opacity ?? 1, () => {
    try {
      pdf.addImage(bg.src, 'PNG', t.x(bg.x), t.y(bg.y), w, h, undefined, 'MEDIUM', bg.rotation || 0)
    } catch {
      // Unsupported image data — the rest of the drawing still renders.
    }
  })
}

function drawGrid(pdf: jsPDF, bounds: Bounds, t: Transform, gridSize: number) {
  // Keep the grid legible: coarsen until lines are at least 2 mm apart.
  let step = Math.max(0.25, gridSize)
  while (step * t.mmPerM < 2) step *= 2
  const first = (v: number) => Math.ceil(v / step) * step

  const x0 = t.x(bounds.minX), x1 = t.x(bounds.maxX)
  const y0 = t.y(bounds.minY), y1 = t.y(bounds.maxY)

  for (let wx = first(bounds.minX); wx <= bounds.maxX; wx += step) {
    const major = Math.abs(wx / (step * 5) - Math.round(wx / (step * 5))) < 1e-6
    setDraw(pdf, major ? [206, 213, 224] : [234, 238, 244], major ? PEN.grid * 2.5 : PEN.grid)
    pdf.line(t.x(wx), y0, t.x(wx), y1)
  }
  for (let wy = first(bounds.minY); wy <= bounds.maxY; wy += step) {
    const major = Math.abs(wy / (step * 5) - Math.round(wy / (step * 5))) < 1e-6
    setDraw(pdf, major ? [206, 213, 224] : [234, 238, 244], major ? PEN.grid * 2.5 : PEN.grid)
    pdf.line(x0, t.y(wy), x1, t.y(wy))
  }

  // Survey origin marker
  if (bounds.minX <= 0 && bounds.maxX >= 0 && bounds.minY <= 0 && bounds.maxY >= 0) {
    const ox = t.x(0), oy = t.y(0)
    setDraw(pdf, [120, 132, 150], PEN.archLight)
    const len = Math.min(9, 1 * t.mmPerM)
    pdf.line(ox - len * 0.35, oy, ox + len, oy)
    pdf.line(ox, oy - len * 0.35, ox, oy + len)
    pdf.circle(ox, oy, 0.9, 'S')
    drawCaption(pdf, '0,0', ox + 1.4, oy - 1.4, { size: 4, color: [140, 150, 164] })
  }
}

function elementStroke(el: AnyElement, project: Project, colorByLayer: boolean): RGB {
  if (colorByLayer) {
    const layer = project.layers.find((l) => l.id === el.layerId)
    if (layer) return hexToRgb(layer.color)
  }
  return hexToRgb(el.stroke || '#374151')
}

/** Paper-space corners of a rectangle element, allowing for its rotation. */
function rectCorners(r: RectElement, t: Transform): number[] {
  const rad = (r.rotation * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  return ([[0, 0], [r.width, 0], [r.width, r.height], [0, r.height]] as const)
    .flatMap(([dx, dy]) => [t.x(r.x + dx * cos - dy * sin), t.y(r.y + dx * sin + dy * cos)])
}

function polygonPoints(p: PolygonElement, t: Transform): number[] {
  const pts: number[] = []
  for (let i = 0; i < p.points.length; i += 2) pts.push(t.x(p.x + p.points[i]), t.y(p.y + p.points[i + 1]))
  return pts
}

/** Line work only. Names go on afterwards — see drawElementLabels. */
function drawElements(pdf: jsPDF, content: PlotContent, project: Project, t: Transform, opts: PlotOptions) {
  for (const el of content.elements) {
    const stroke = elementStroke(el, project, opts.colorByLayer)
    const transparent = el.fill === '' || el.fill === 'transparent'
    // Built structure prints as pale tone with a heavy outline, the way a plan
    // shows the stage rather than a filled block that fights the fixtures.
    const fill = transparent ? null : lighten(hexToRgb(el.fill || '#d1d5db'), 0.55)
    const lw = el.strokeWidth >= 2 ? PEN.archHeavy : PEN.archMed

    if (el.type === 'rect') {
      if (fill) setFill(pdf, fill)
      setDraw(pdf, stroke, lw)
      polyline(pdf, rectCorners(el as RectElement, t), fill ? 'FD' : 'S', true)
    } else if (el.type === 'ellipse') {
      const e = el as EllipseElement
      if (fill) setFill(pdf, fill)
      setDraw(pdf, stroke, lw)
      pdf.ellipse(t.x(e.x), t.y(e.y), e.radiusX * t.mmPerM, e.radiusY * t.mmPerM, fill ? 'FD' : 'S')
    } else if (el.type === 'polygon') {
      if (fill) setFill(pdf, fill)
      setDraw(pdf, stroke, lw)
      polyline(pdf, polygonPoints(el as PolygonElement, t), fill ? 'FD' : 'S', true)
    } else if (el.type === 'truss') {
      drawTruss(pdf, el as TrussElement, stroke, t)
    } else if (el.type === 'cable') {
      drawCable(pdf, el as CableElement, t, opts)
    } else if (el.type === 'text') {
      const tx = el as TextElement
      // fontSize is centimetres of real space, so it scales with the drawing.
      const mm = ((tx.fontSize || 30) / 100) * t.mmPerM
      drawText(pdf, tx.text, t.x(tx.x), t.y(tx.y) + mm * 0.8, {
        size: Math.max(2, mm / PT),
        color: hexToRgb(tx.fill || '#1f2937'),
        spacing: 0.15,
      })
    }
  }
}

/** Half-width on paper of a truss drawn at this scale. */
function trussHalf(t: Transform): number {
  // A 0.3 m truss, but never thinner than a readable pair of lines.
  return Math.max(0.55, Math.min(3, 0.15 * t.mmPerM))
}

/**
 * Hanging positions print as real truss: two chords with diagonal bracing and
 * end plates. A single fat line reads as a wall, not a bar.
 */
function drawTruss(pdf: jsPDF, te: TrussElement, stroke: RGB, t: Transform) {
  const x1 = t.x(te.x), y1 = t.y(te.y), x2 = t.x(te.x2), y2 = t.y(te.y2)
  const lengthMm = Math.hypot(x2 - x1, y2 - y1)
  if (lengthMm < 0.5) return

  const ux = (x2 - x1) / lengthMm, uy = (y2 - y1) / lengthMm
  const nx = -uy, ny = ux
  const half = trussHalf(t)

  setDraw(pdf, stroke, PEN.archHeavy)
  pdf.line(x1 + nx * half, y1 + ny * half, x2 + nx * half, y2 + ny * half)
  pdf.line(x1 - nx * half, y1 - ny * half, x2 - nx * half, y2 - ny * half)
  // End plates
  pdf.line(x1 + nx * half, y1 + ny * half, x1 - nx * half, y1 - ny * half)
  pdf.line(x2 + nx * half, y2 + ny * half, x2 - nx * half, y2 - ny * half)

  // Diagonal bracing — skipped once the bays would be smaller than the pen
  const bay = Math.max(half * 2, 0.5 * t.mmPerM)
  if (bay >= 1.2) {
    setDraw(pdf, stroke, PEN.archLight)
    let d = 0
    let up = true
    while (d + bay <= lengthMm) {
      const ax = x1 + ux * d + nx * half * (up ? 1 : -1)
      const ay = y1 + uy * d + ny * half * (up ? 1 : -1)
      const bx = x1 + ux * (d + bay) + nx * half * (up ? -1 : 1)
      const by = y1 + uy * (d + bay) + ny * half * (up ? -1 : 1)
      pdf.line(ax, ay, bx, by)
      d += bay
      up = !up
    }
  }
}

/** Everything a label has to keep clear of. */
function annotationObstacles(layouts: Map<string, FixtureLayout>, content: PlotContent, t: Transform, k: number): Box[] {
  const out: Box[] = []
  for (const l of layouts.values()) {
    out.push({ l: Math.min(l.sym.l, l.cx - 3 * k) - 3 * k, r: Math.max(l.sym.r, l.cx + 3 * k), t: l.sym.t - 5.4 * k, b: l.sym.b + 7 * k })
  }
  const half = trussHalf(t) + 0.4
  for (const el of content.elements) {
    if (el.type !== 'truss') continue
    const x1 = t.x(el.x), y1 = t.y(el.y), x2 = t.x(el.x2), y2 = t.y(el.y2)
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (half * 2)))
    for (let i = 0; i <= steps; i++) {
      const x = x1 + ((x2 - x1) * i) / steps, y = y1 + ((y2 - y1) * i) / steps
      out.push({ l: x - half, r: x + half, t: y - half, b: y + half })
    }
  }
  for (const d of content.distros) out.push({ l: t.x(d.x ?? 0) - 14, r: t.x(d.x ?? 0) + 14, t: t.y(d.y ?? 0) - 7, b: t.y(d.y ?? 0) + 7 })
  for (const d of content.devices) out.push({ l: t.x(d.x ?? 0) - 13, r: t.x(d.x ?? 0) + 13, t: t.y(d.y ?? 0) - 6, b: t.y(d.y ?? 0) + 6 })
  return out
}

/** Names of shapes and positions, each put where it will not sit on a light. */
function drawElementLabels(
  pdf: jsPDF, content: PlotContent, project: Project, t: Transform, opts: PlotOptions,
  layouts: Map<string, FixtureLayout>, frame: Rect, k: number,
) {
  const obstacles = annotationObstacles(layouts, content, t, k)
  const size = 5 * k
  const h = size * PT

  const textWidth = (text: string, spacing: number, bold = false) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(size)
    return pdf.getTextWidth(text) + spacing * text.length
  }

  // ── Position tags first: they are the labels people look for ──────────────
  let positionIndex = 0
  for (const el of content.elements) {
    if (el.type !== 'truss') continue
    const te = el as TrussElement
    const index = positionIndex++
    const x1 = t.x(te.x), y1 = t.y(te.y), x2 = t.x(te.x2), y2 = t.y(te.y2)
    const lengthMm = Math.hypot(x2 - x1, y2 - y1)
    if (lengthMm < 0.5) continue
    const ux = (x2 - x1) / lengthMm, uy = (y2 - y1) / lengthMm
    const nx = -uy, ny = ux
    const half = trussHalf(t)
    const stroke = elementStroke(te, project, opts.colorByLayer)

    const name = (te.label?.trim() || `Position ${index + 1}`).toUpperCase()
    const facts = [
      !opts.freeform && `${Math.hypot(te.x2 - te.x, te.y2 - te.y).toFixed(2)} m`,
      te.trim != null && `TRIM ${te.trim.toFixed(2)} m`,
    ].filter(Boolean).join('  ·  ')
    const tagW = textWidth(name, 0.35 * k, true) + 4 * k
    const tagH = 4.4 * k
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(4.2 * k)
    const factsW = facts ? pdf.getTextWidth(facts) + 0.1 * facts.length : 0
    const w = Math.max(tagW, factsW)
    const totalH = tagH + (facts ? 3.2 * k : 0)

    // Past either end of the bar reads best; failing that, alongside it.
    const endOffset = Math.abs(ux) * (w / 2) + Math.abs(uy) * (totalH / 2) + half + 1.6
    const sideOffset = half + Math.abs(nx) * (w / 2) + Math.abs(ny) * (totalH / 2) + 1.6
    const spots: [number, number][] = [
      [x1 - ux * endOffset, y1 - uy * endOffset],
      [x2 + ux * endOffset, y2 + uy * endOffset],
      ...[0.5, 0.25, 0.75, 0.12, 0.88].flatMap((f): [number, number][] => {
        const mx = x1 + (x2 - x1) * f, my = y1 + (y2 - y1) * f
        return [[mx - nx * sideOffset, my - ny * sideOffset], [mx + nx * sideOffset, my + ny * sideOffset]]
      }),
    ]
    const spot = pickSpot(spots.map(([cx, cy]) => ({
      cx, cy, box: { l: cx - w / 2 - 0.5, r: cx + w / 2 + 0.5, t: cy - totalH / 2 - 0.5, b: cy + totalH / 2 + 0.5 },
    })), obstacles, frame)
    obstacles.push(spot.box)

    const tagY = spot.cy - totalH / 2 + (facts ? 3.2 * k : 0)
    setFill(pdf, PAPER_WHITE)
    setDraw(pdf, stroke, PEN.archLight)
    pdf.rect(spot.cx - tagW / 2, tagY, tagW, tagH, 'FD')
    drawText(pdf, name, spot.cx, tagY + tagH / 2 + h * 0.36, { size, bold: true, spacing: 0.35 * k, align: 'center', color: stroke })
    if (facts) {
      drawText(pdf, facts, spot.cx, tagY - 1.1 * k, { size: 4.2 * k, color: MUTED, align: 'center', spacing: 0.1, backdrop: true })
    }
  }

  // ── Shape names ───────────────────────────────────────────────────────────
  for (const el of content.elements) {
    if (!el.label || (el.type !== 'rect' && el.type !== 'ellipse' && el.type !== 'polygon')) continue
    const text = el.label.toUpperCase()
    const w = textWidth(text, 0.4 * k)

    let pts: number[]
    if (el.type === 'rect') pts = rectCorners(el as RectElement, t)
    else if (el.type === 'polygon') pts = polygonPoints(el as PolygonElement, t)
    else {
      const e = el as EllipseElement
      const rx = e.radiusX * t.mmPerM * 0.7, ry = e.radiusY * t.mmPerM * 0.7
      pts = [t.x(e.x) - rx, t.y(e.y) - ry, t.x(e.x) + rx, t.y(e.y) + ry]
    }
    if (pts.length < 4) continue
    const xs = pts.filter((_, i) => i % 2 === 0), ys = pts.filter((_, i) => i % 2 === 1)
    const l = Math.min(...xs), r = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys)
    const mx = (l + r) / 2, my = (top + bottom) / 2
    const padX = w / 2 + 2, padY = h / 2 + 1.8

    // Centre if it is clear, otherwise tucked into a corner of the shape.
    const spots: [number, number][] = [
      [mx, my], [l + padX, top + padY], [r - padX, top + padY], [l + padX, bottom - padY],
      [r - padX, bottom - padY], [mx, top + padY], [mx, bottom - padY],
    ]
    const spot = pickSpot(spots.map(([cx, cy]) => ({
      cx, cy, box: { l: cx - w / 2 - 0.6, r: cx + w / 2 + 0.6, t: cy - h / 2 - 0.6, b: cy + h / 2 + 0.6 },
    })), obstacles, frame)
    obstacles.push(spot.box)
    drawText(pdf, text, spot.cx, spot.cy + h * 0.36, {
      size, color: [90, 99, 112], spacing: 0.4 * k, align: 'center', backdrop: true,
    })
  }
}

function drawCable(pdf: jsPDF, ce: CableElement, t: Transform, opts: PlotOptions) {
  const pts = [{ x: ce.x, y: ce.y }, ...(ce.waypoints ?? []), { x: ce.x2, y: ce.y2 }]
  const color = hexToRgb(CABLE_COLORS[ce.cableType] ?? '#9ca3af')
  const paper = pts.flatMap((p) => [t.x(p.x), t.y(p.y)])

  setDraw(pdf, color, 0.3)
  pdf.setLineDashPattern([1.6, 1], 0)
  pdf.setLineJoin('round')
  polyline(pdf, paper, 'S')
  pdf.setLineDashPattern([], 0)

  // Termination dots
  setFill(pdf, color)
  pdf.circle(paper[0], paper[1], 0.55, 'F')
  pdf.circle(paper[paper.length - 2], paper[paper.length - 1], 0.55, 'F')

  if (!opts.showCableLabels) return
  const runLength = opts.freeform ? ce.manualLength : cableLength(ce)
  const label = [ce.autoLabel, ce.annotation, runLength != null ? `${runLength.toFixed(1)}m` : '']
    .filter(Boolean).join(' · ')
  if (!label) return

  // The label rides the middle of the longest leg, where there is room for it.
  let best = 0, bestLen = -1
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y)
    if (len > bestLen) { bestLen = len; best = i }
  }
  const mx = t.x((pts[best].x + pts[best + 1].x) / 2), my = t.y((pts[best].y + pts[best + 1].y) / 2)
  const vertical = Math.abs(pts[best + 1].x - pts[best].x) < Math.abs(pts[best + 1].y - pts[best].y)
  drawText(pdf, label, vertical ? mx + 1.2 : mx, vertical ? my + 0.5 : my - 1.1, {
    size: 4.2, color, backdrop: true, spacing: 0.06, align: vertical ? 'left' : 'center',
  })
}

const DEVICE_COLORS: Record<string, string> = {
  'console': '#1d4ed8',
  'dimmer-rack': '#374151',
  'media-server': '#0f766e',
  'network-switch': '#0369a1',
  'dmx-splitter': '#7c3aed',
  'power-splitter': '#b45309',
  'amplifier': '#0f766e',
  'other': '#6b7280',
}

/**
 * Equipment racks print as line work with a colour spine, not as solid blocks —
 * a black-and-white print of the plot has to stay readable.
 */
function drawNodeBox(
  pdf: jsPDF, cx: number, cy: number, w: number, h: number, accent: RGB,
  title: string, lines: string[],
) {
  const x = cx - w / 2, y = cy - h / 2
  setFill(pdf, PAPER_WHITE)
  setDraw(pdf, INK, PEN.archMed)
  pdf.rect(x, y, w, h, 'FD')
  // Colour spine down the left edge
  setFill(pdf, accent)
  pdf.rect(x, y, 1.4, h, 'F')
  // Title bar rule
  setDraw(pdf, HAIRLINE, PEN.hair)
  pdf.line(x + 1.4, y + 4.2, x + w, y + 4.2)

  drawText(pdf, title, x + 2.6, y + 3, { size: 4.8, bold: true, spacing: 0.15, maxW: w - 3.6 })
  let ty = y + 7.2
  for (const text of lines) {
    if (!text || ty > y + h - 0.6) continue
    drawText(pdf, text, x + 2.6, ty, { size: 4, color: MUTED, maxW: w - 3.6 })
    ty += 3.2
  }
}

function drawDistrosAndDevices(pdf: jsPDF, content: PlotContent, t: Transform) {
  for (const d of content.distros) {
    const w = Math.max(16, Math.min(28, 1.8 * t.mmPerM))
    const h = Math.max(11, w * 0.5)
    drawNodeBox(pdf, t.x(d.x ?? 0), t.y(d.y ?? 0), w, h, [220, 38, 38],
      d.ref ? `${d.ref} · ${d.name}` : d.name,
      [`${d.incomingRating}A · ${d.phases}Ø`, `${d.circuits.length} way${d.circuits.length !== 1 ? 's' : ''}`])
  }
  for (const d of content.devices) {
    const w = Math.max(15, Math.min(26, 1.6 * t.mmPerM))
    const h = Math.max(9, w * 0.42)
    drawNodeBox(pdf, t.x(d.x ?? 0), t.y(d.y ?? 0), w, h, hexToRgb(DEVICE_COLORS[d.category] ?? '#6b7280'),
      d.name, [[d.manufacturer, d.model].filter(Boolean).join(' ')])
  }
}

function drawFixtureSymbols(
  pdf: jsPDF, fixtures: PlacedFixture[], project: Project, layouts: Map<string, FixtureLayout>, opts: PlotOptions,
) {
  for (const f of fixtures) {
    const l = layouts.get(f.id)!
    const accent = opts.colorByLayer
      ? hexToRgb(project.layers.find((layer) => layer.id === f.layerId)?.color ?? symbolColors(f.symbol).stroke)
      : undefined
    drawFixtureSymbol(pdf, f.symbol, l.cx, l.cy, l.rMm, f.rotation, accent)
  }
}

export interface FixtureNotes {
  channel: string
  unit: string
  address: string
  colour: string
  purpose: string
  label: string
}

/**
 * The label legend — where each fact about a light sits around its symbol:
 *
 *        (12)        channel, ringed, above
 *     3   ◎          unit number, to the left
 *       1.101        universe.address
 *        L201        colour
 *       FRONT        purpose
 *
 * Returns where each note landed so the notation key can point at them.
 */
function drawFixtureAnnotation(
  pdf: jsPDF, l: FixtureLayout, notes: FixtureNotes, opts: PlotOptions, k: number,
): Partial<Record<keyof FixtureNotes, { x: number; y: number }>> {
  const at: Partial<Record<keyof FixtureNotes, { x: number; y: number }>> = {}

  if (opts.showChannels && notes.channel) {
    const size = 5.4 * k
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(size)
    const h = 3.9 * k
    const w = Math.max(h, pdf.getTextWidth(notes.channel) + 1.7 * k)
    const cy = l.sym.t - 0.9 * k - h / 2
    setFill(pdf, PAPER_WHITE)
    setDraw(pdf, INK, PEN.archLight)
    pdf.roundedRect(l.cx - w / 2, cy - h / 2, w, h, h / 2, h / 2, 'FD')
    drawText(pdf, notes.channel, l.cx, cy + size * PT * 0.36, { size, bold: true, align: 'center' })
    at.channel = { x: l.cx + w / 2, y: cy }
  }

  if (opts.showUnitNumbers && notes.unit) {
    const size = 4.6 * k
    const x = l.sym.l - 0.9 * k
    drawText(pdf, notes.unit, x, l.cy + size * PT * 0.36, { size, bold: true, align: 'right', color: [70, 78, 92], backdrop: true })
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(size)
    at.unit = { x: x - pdf.getTextWidth(notes.unit), y: l.cy }
  }

  const pitch = 2.15 * k
  let y = l.sym.b + 2.3 * k
  const row = (key: keyof FixtureNotes, text: string, style: TextStyle) => {
    if (!text) return
    const size = style.size ?? 4.4 * k
    drawText(pdf, text, l.cx, y, { align: 'center', backdrop: true, ...style, size })
    pdf.setFont('helvetica', style.bold ? 'bold' : 'normal'); pdf.setFontSize(size)
    at[key] = { x: l.cx + pdf.getTextWidth(text) / 2, y: y - size * PT * 0.36 }
    y += pitch
  }
  if (opts.showAddresses) row('address', notes.address, { color: INK })
  if (opts.showColours) row('colour', notes.colour, { bold: true, color: INK })
  if (opts.showPurposes) row('purpose', notes.purpose.toUpperCase(), { color: MUTED, size: 4.1 * k, spacing: 0.08 })
  if (opts.showFixtureLabels) row('label', notes.label, { color: [70, 78, 92], italic: true, size: 4.1 * k })
  return at
}

// ── Key column ────────────────────────────────────────────────────────────────

/** Table heading: tracked caps over a heavy rule. */
function tableHeading(pdf: jsPDF, text: string, x: number, y: number, w: number): number {
  drawCaption(pdf, text, x, y, { size: 4.8, color: INK })
  setDraw(pdf, INK, PEN.frame)
  pdf.line(x, y + 1.4, x + w, y + 1.4)
  return y + 5
}

/**
 * Draws the key: symbol key, notation key, cable key, position summary, rig
 * totals and general notes — the block a crew reads before touching the
 * drawing. Sections that will not fit are left off whole rather than cut short.
 */
export function drawKey(
  pdf: jsPDF,
  frame: Rect,
  project: Project,
  content: PlotContent,
  result: PlotRenderResult,
  opts: PlotOptions,
) {
  const { x, w } = frame
  const limit = frame.y + frame.h
  let y = frame.y + 4
  const fits = (need: number) => y + need <= limit

  // ── Symbol key ──────────────────────────────────────────────────────────
  if (result.legendItems.length > 0 && fits(16)) {
    y = tableHeading(pdf, 'Symbol key', x, y, w)
    const rowH = 7
    let shown = 0
    for (const item of result.legendItems) {
      if (!fits(rowH + 9)) break
      // Fit the whole symbol, beam and all, into its cell.
      const b = symbolBox(item.symbol, 0)
      const r = Math.min(2.3, 8 / (b.maxX - b.minX), 5.4 / (b.maxY - b.minY))
      drawFixtureSymbol(pdf, item.symbol, x + 4.5 - ((b.minX + b.maxX) / 2) * r, y + 1.2 - ((b.minY + b.maxY) / 2) * r, r, 0)
      drawText(pdf, item.label, x + 11, y, { size: 5, bold: true, maxW: w - 21 })
      drawText(pdf, `${formatWatts(item.watts / item.count)}  ·  ${(item.weight / item.count).toFixed(1)} kg`, x + 11, y + 2.7, {
        size: 4, color: MUTED,
      })
      drawText(pdf, String(item.count), x + w, y + 1.2, { size: 6.4, bold: true, align: 'right' })
      y += rowH - 2.6
      setDraw(pdf, [226, 231, 238], PEN.hair)
      pdf.line(x, y, x + w, y)
      y += 3.6
      shown++
    }
    const hidden = result.legendItems.length - shown
    if (hidden > 0) {
      drawText(pdf, `+ ${hidden} more type${hidden !== 1 ? 's' : ''} — see the equipment list`, x, y, { size: 4.2, color: MUTED })
      y += 4
    }
    y += 3
  }

  // ── Notation key ────────────────────────────────────────────────────────
  const notes: FixtureNotes = { channel: '12', unit: '3', address: '1.101', colour: 'L201', purpose: 'Front', label: 'Label' }
  const noteRows = [opts.showAddresses, opts.showColours, opts.showPurposes, opts.showFixtureLabels].filter(Boolean).length
  const anyNotation = opts.showChannels || opts.showUnitNumbers || noteRows > 0
  const notationH = 5 + 6 + 7 + noteRows * 2.2 + 4
  if (anyNotation && result.legendItems.length > 0 && fits(notationH)) {
    y = tableHeading(pdf, 'Notation', x, y, w)
    const rMm = 2.6
    const cx = x + 19, cy = y + 6.5
    const b = symbolBox('wash', 0)
    const layout: FixtureLayout = { cx, cy, rMm, sym: { l: cx + b.minX * rMm, t: cy + b.minY * rMm, r: cx + b.maxX * rMm, b: cy + b.maxY * rMm } }
    drawFixtureSymbol(pdf, 'wash', cx, cy, rMm, 0)
    const at = drawFixtureAnnotation(pdf, layout, notes, opts, 1)

    const captions: [keyof FixtureNotes, string][] = [
      ['channel', 'Channel'], ['address', 'Universe . address'], ['colour', 'Colour'],
      ['purpose', 'Purpose'], ['label', 'Label'],
    ]
    const capX = x + 31
    setDraw(pdf, HAIRLINE, PEN.hair)
    for (const [key, caption] of captions) {
      const p = at[key]
      if (!p) continue
      pdf.line(p.x + 0.8, p.y, capX - 1, p.y)
      drawCaption(pdf, caption, capX, p.y + 0.6, { size: 3.9 })
    }
    if (at.unit) {
      pdf.line(x + 9.5, at.unit.y, at.unit.x - 0.8, at.unit.y)
      drawCaption(pdf, 'Unit', x + 9, at.unit.y + 0.6, { size: 3.9, align: 'right' })
    }
    y += notationH - 5
  }

  // ── Cable key ───────────────────────────────────────────────────────────
  if (result.cableTypes.length > 0 && fits(11)) {
    y = tableHeading(pdf, 'Cable key', x, y, w)
    for (const type of result.cableTypes) {
      if (!fits(4.4)) break
      setDraw(pdf, hexToRgb(CABLE_COLORS[type] ?? '#9ca3af'), 0.45)
      pdf.setLineDashPattern([1.4, 0.9], 0)
      pdf.line(x, y - 1, x + 7, y - 1)
      pdf.setLineDashPattern([], 0)
      drawText(pdf, CABLE_LABELS[type] ?? type, x + 8.5, y, { size: 4.6, maxW: w - 9 })
      y += 4.4
    }
    y += 3
  }

  // ── Positions ───────────────────────────────────────────────────────────
  const shownIds = new Set(content.fixtures.map((f) => f.id))
  const rows = result.positions.positions
    .map((p) => ({ ...p, fixtures: p.fixtures.filter((f) => shownIds.has(f.id)) }))
    .filter((p) => p.fixtures.length > 0)
  const loose = result.positions.loose.filter((f) => shownIds.has(f.id))
  if (rows.length > 0 && fits(13 + Math.min(rows.length, 3) * 4.2)) {
    y = tableHeading(pdf, 'Positions', x, y, w)
    const cTrim = x + w - 30, cUnits = x + w - 15, cKg = x + w
    drawCaption(pdf, 'Position', x, y, { size: 3.9 })
    drawCaption(pdf, 'Trim', cTrim, y, { size: 3.9, align: 'right' })
    drawCaption(pdf, 'Units', cUnits, y, { size: 3.9, align: 'right' })
    drawCaption(pdf, 'Load', cKg, y, { size: 3.9, align: 'right' })
    y += 4
    const line = (name: string, trim: string, units: number, kg: number, muted = false) => {
      drawText(pdf, name, x, y, { size: 4.8, bold: !muted, color: muted ? MUTED : INK, maxW: w - 46 })
      drawText(pdf, trim, cTrim, y, { size: 4.6, align: 'right', color: MUTED })
      drawText(pdf, String(units), cUnits, y, { size: 4.6, align: 'right' })
      drawText(pdf, `${kg.toFixed(0)} kg`, cKg, y, { size: 4.6, align: 'right' })
      y += 4.2
    }
    let cut = 0
    for (const p of rows) {
      if (!fits(4.2 + (loose.length ? 4.2 : 0))) { cut++; continue }
      line(p.name, p.trim != null ? `${p.trim.toFixed(2)} m` : '—', p.fixtures.length, p.fixtures.reduce((s, f) => s + f.weight, 0))
    }
    if (loose.length > 0 && fits(4.2)) line('Not on a position', '', loose.length, loose.reduce((s, f) => s + f.weight, 0), true)
    if (cut > 0 && fits(4)) { drawText(pdf, `+ ${cut} more`, x, y, { size: 4.2, color: MUTED }); y += 4 }
    y += 3
  }

  // ── Rig totals ──────────────────────────────────────────────────────────
  if (result.totals.count > 0 && fits(19)) {
    y = tableHeading(pdf, 'Rig totals', x, y, w)
    const universes = [...new Set(content.fixtures.map((f) => f.universe))].sort((a, b) => a - b)
    const facts: [string, string][] = [
      ['Fixtures', String(result.totals.count)],
      ['Connected load', formatWatts(result.totals.watts)],
      ['Total weight', `${result.totals.weight.toFixed(0)} kg`],
      ['Universes', universes.length ? universes.join(', ') : '—'],
    ]
    const half = w / 2
    facts.forEach(([caption, value], i) => {
      const fx = x + (i % 2) * half
      const fy = y + Math.floor(i / 2) * 7.4
      drawCaption(pdf, caption, fx, fy, { size: 3.9 })
      drawText(pdf, value, fx, fy + 3.5, { size: 6.2, bold: true, maxW: half - 2 })
    })
    y += 7.4 * 2 + 2.5
  }

  // ── General notes ───────────────────────────────────────────────────────
  const general = [
    ...(project.info.notes ?? '').split('\n').map((s) => s.trim()).filter(Boolean),
    ...(result.scale.notToScale
      ? ['Schematic — not to scale. Do not measure from this drawing.']
      : ['Do not scale from this drawing. Verify all dimensions on site.']),
  ]
  if (fits(12)) {
    y = tableHeading(pdf, 'Notes', x, y, w)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(4.4)
    let n = 0
    for (const note of general) {
      const lines = pdf.splitTextToSize(note, w - 5) as string[]
      if (!fits(lines.length * 2.3 + 1)) break
      n++
      drawText(pdf, `${n}.`, x, y, { size: 4.4, bold: true })
      for (const text of lines) {
        drawText(pdf, text, x + 4.5, y, { size: 4.4, color: [70, 78, 92] })
        y += 2.3
      }
      y += 1.1
    }
  }
}

/** North arrow with a scale bar beside it, or the not-to-scale stamp. */
export function drawScaleBlock(pdf: jsPDF, frame: Rect, result: PlotRenderResult, paper: PaperSize) {
  const { x, y, w } = frame
  if (result.scale.notToScale) {
    setDraw(pdf, INK, PEN.archLight)
    setFill(pdf, PAPER_WHITE)
    pdf.rect(x, y + 3, Math.min(w, 44), 8, 'FD')
    drawText(pdf, 'NOT TO SCALE', x + Math.min(w, 44) / 2, y + 8.2, { size: 6, bold: true, spacing: 0.5, align: 'center' })
    drawText(pdf, 'Schematic — do not measure', x, y + 15, { size: 4, color: MUTED })
    return
  }
  drawNorthArrow(pdf, x + 4.5, y + 7)
  drawScaleBar(pdf, x + 14, y + 3, w - 14, result, paper)
}

/** Plan north indicator. */
export function drawNorthArrow(pdf: jsPDF, cx: number, cy: number, r = 4.2) {
  setDraw(pdf, INK, PEN.hair)
  setFill(pdf, PAPER_WHITE)
  pdf.circle(cx, cy, r, 'FD')
  setFill(pdf, INK)
  polyline(pdf, [cx, cy - r * 0.82, cx + r * 0.42, cy + r * 0.5, cx, cy + r * 0.18], 'F', true)
  setFill(pdf, [255, 255, 255])
  setDraw(pdf, INK, PEN.hair)
  polyline(pdf, [cx, cy - r * 0.82, cx - r * 0.42, cy + r * 0.5, cx, cy + r * 0.18], 'FD', true)
  drawText(pdf, 'N', cx, cy + r + 2.6, { size: 4.4, bold: true, align: 'center', spacing: 0.2 })
}

/** Graphic scale bar — the thing that keeps a drawing readable after printing. */
export function drawScaleBar(pdf: jsPDF, x: number, y: number, maxW: number, result: PlotRenderResult, paper: PaperSize) {
  const { mmPerM, denominator, standard } = result.scale

  const candidates = [1, 2, 5, 10, 20, 25, 50, 100, 200]
  let metres = candidates[0]
  for (const c of candidates) if (c * mmPerM <= maxW) metres = c
  const barW = metres * mmPerM
  const barH = 1.5
  const barY = y + 5

  drawCaption(pdf, `Scale 1:${denominator}${standard ? '' : ' (fitted)'} at ${PAPER_LABELS[paper]}`, x, y + 2, {
    size: 4.6, color: INK,
  })

  const segs = 4
  const segW = barW / segs
  for (let i = 0; i < segs; i++) {
    setFill(pdf, i % 2 === 0 ? INK : PAPER_WHITE)
    setDraw(pdf, INK, PEN.hair)
    pdf.rect(x + i * segW, barY, segW, barH, 'FD')
  }
  // End ticks
  setDraw(pdf, INK, PEN.hair)
  pdf.line(x, barY - 0.8, x, barY + barH + 0.8)
  pdf.line(x + barW, barY - 0.8, x + barW, barY + barH + 0.8)

  drawText(pdf, '0', x, barY + barH + 3.4, { size: 4, color: MUTED })
  drawText(pdf, `${metres / 2}`, x + barW / 2, barY + barH + 3.4, { size: 4, color: MUTED, align: 'center' })
  drawText(pdf, `${metres} m`, x + barW, barY + barH + 3.4, { size: 4, color: MUTED, align: 'right' })
}
