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
import { symbolShapes, symbolLineWidth, symbolExtent } from './symbolGeometry'
import type { FillRole } from './symbolGeometry'
import { symbolColors, SYMBOL_RADIUS_M } from './symbols'
import { cableLength } from './utils'

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
  /** 'fit' picks the largest standard scale that fits the paper. */
  scale: 'fit' | number
  showGrid: boolean
  showBackground: boolean
  showChannels: boolean
  showAddresses: boolean
  showFixtureLabels: boolean
  showCableLabels: boolean
  showLegend: boolean
  colorByLayer: boolean
}

export const DEFAULT_PLOT_OPTIONS: PlotOptions = {
  paper: 'a3',
  orientation: 'landscape',
  scale: 'fit',
  showGrid: false,
  showBackground: true,
  showChannels: true,
  showAddresses: true,
  showFixtureLabels: true,
  showCableLabels: true,
  showLegend: true,
  colorByLayer: false,
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
  const padX = Math.max(0.5, (maxX - minX) * 0.03)
  const padY = Math.max(0.5, (maxY - minY) * 0.03)
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
}

export function chooseScale(bounds: Bounds, frameW: number, frameH: number, requested: PlotOptions['scale']): ScaleChoice {
  const worldW = Math.max(0.5, bounds.maxX - bounds.minX)
  const worldH = Math.max(0.5, bounds.maxY - bounds.minY)
  const maxMmPerM = Math.min(frameW / worldW, frameH / worldH)

  if (typeof requested === 'number' && requested > 0) {
    const mmPerM = 1000 / requested
    return { mmPerM, denominator: requested, standard: true, overflow: mmPerM > maxMmPerM * 1.001 }
  }

  const standard = STANDARD_SCALES.find((d) => 1000 / d <= maxMmPerM)
  if (standard) return { mmPerM: 1000 / standard, denominator: standard, standard: true, overflow: false }

  // Bigger than 1:500 — fall back to a rounded non-standard ratio that fits.
  const denominator = Math.ceil(1000 / maxMmPerM / 50) * 50
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

/** Blends a colour towards black. */
function darken(rgb: RGB, amount: number): RGB {
  return rgb.map((c) => Math.round(c * (1 - amount))) as RGB
}

const INK: RGB = [17, 24, 39]
const MUTED: RGB = [107, 114, 128]

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

function setDraw(pdf: jsPDF, c: RGB, lw: number) {
  pdf.setDrawColor(c[0], c[1], c[2])
  pdf.setLineWidth(lw)
}
function setFill(pdf: jsPDF, c: RGB) { pdf.setFillColor(c[0], c[1], c[2]) }
function setText(pdf: jsPDF, c: RGB) { pdf.setTextColor(c[0], c[1], c[2]) }

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
export function fitText(pdf: jsPDF, text: string, maxW: number): string {
  if (!text) return ''
  if (pdf.getTextWidth(text) <= maxW) return text
  let lo = 0, hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (pdf.getTextWidth(text.slice(0, mid) + '…') <= maxW) lo = mid
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
      case 'body': return [255, 255, 255]
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

export interface PlotRenderResult {
  scale: ScaleChoice
  bounds: Bounds | null
  /** Fixture types present, for the legend and for reporting back to the UI. */
  legendItems: LegendItem[]
}

export interface LegendItem {
  key: string
  label: string
  symbol: FixtureSymbolType
  count: number
}

function legendItemsFor(content: PlotContent): LegendItem[] {
  const map = new Map<string, LegendItem>()
  for (const f of content.fixtures) {
    const key = `${f.manufacturer} ${f.model}`.trim() || 'Fixture'
    const item = map.get(key)
    if (item) item.count += 1
    else map.set(key, { key, label: key, symbol: f.symbol, count: 1 })
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

function cableTypesIn(content: PlotContent): CableType[] {
  const set = new Set<CableType>()
  for (const el of content.elements) if (el.type === 'cable') set.add((el as CableElement).cableType)
  return [...set]
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

  if (!bounds) {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9)
    setText(pdf, MUTED)
    pdf.text('Nothing to draw on the selected layers.', frame.x + frame.w / 2, frame.y + frame.h / 2, { align: 'center' })
    return { scale: { mmPerM: 20, denominator: 50, standard: true, overflow: false }, bounds: null, legendItems }
  }

  const scale = chooseScale(bounds, frame.w, frame.h, opts.scale)
  const t = makeTransform(bounds, frame, scale.mmPerM)

  clipped(pdf, frame, () => {
    if (opts.showBackground && content.background) drawBackground(pdf, content.background, t)
    if (opts.showGrid) drawGrid(pdf, bounds, t, gridSize)
    drawElements(pdf, content, project, t, opts)
    drawDistrosAndDevices(pdf, content, t)
    drawFixtures(pdf, content.fixtures, project, t, opts)
  })

  return { scale, bounds, legendItems }
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
    setDraw(pdf, major ? [203, 213, 225] : [233, 238, 244], major ? 0.12 : 0.07)
    pdf.line(t.x(wx), y0, t.x(wx), y1)
  }
  for (let wy = first(bounds.minY); wy <= bounds.maxY; wy += step) {
    const major = Math.abs(wy / (step * 5) - Math.round(wy / (step * 5))) < 1e-6
    setDraw(pdf, major ? [203, 213, 225] : [233, 238, 244], major ? 0.12 : 0.07)
    pdf.line(x0, t.y(wy), x1, t.y(wy))
  }

  // Origin marker
  if (bounds.minX <= 0 && bounds.maxX >= 0 && bounds.minY <= 0 && bounds.maxY >= 0) {
    setDraw(pdf, [100, 116, 139], 0.25)
    const len = Math.min(8, 1 * t.mmPerM)
    pdf.line(t.x(0), t.y(0), t.x(0) + len, t.y(0))
    pdf.line(t.x(0), t.y(0), t.x(0), t.y(0) + len)
  }
}

function elementStroke(el: AnyElement, project: Project, colorByLayer: boolean): RGB {
  if (colorByLayer) {
    const layer = project.layers.find((l) => l.id === el.layerId)
    if (layer) return hexToRgb(layer.color)
  }
  return hexToRgb(el.stroke || '#374151')
}

function drawElements(pdf: jsPDF, content: PlotContent, project: Project, t: Transform, opts: PlotOptions) {
  for (const el of content.elements) {
    const stroke = elementStroke(el, project, opts.colorByLayer)
    const transparent = el.fill === '' || el.fill === 'transparent'
    const fill = transparent ? null : hexToRgb(el.fill || '#d1d5db')
    const lw = Math.max(0.15, (el.strokeWidth || 1) * 0.18)

    if (el.type === 'rect') {
      const r = el as RectElement
      const rad = (r.rotation * Math.PI) / 180
      const cos = Math.cos(rad), sin = Math.sin(rad)
      const pts = ([[0, 0], [r.width, 0], [r.width, r.height], [0, r.height]] as const)
        .flatMap(([dx, dy]) => [
          t.x(r.x + dx * cos - dy * sin),
          t.y(r.y + dx * sin + dy * cos),
        ])
      if (fill) setFill(pdf, fill)
      setDraw(pdf, stroke, lw)
      polyline(pdf, pts, fill ? 'FD' : 'S', true)
      if (r.label) centreLabel(pdf, r.label, t.x(r.x + r.width / 2), t.y(r.y + r.height / 2))
    } else if (el.type === 'ellipse') {
      const e = el as EllipseElement
      if (fill) setFill(pdf, fill)
      setDraw(pdf, stroke, lw)
      pdf.ellipse(t.x(e.x), t.y(e.y), e.radiusX * t.mmPerM, e.radiusY * t.mmPerM, fill ? 'FD' : 'S')
      if (e.label) centreLabel(pdf, e.label, t.x(e.x), t.y(e.y))
    } else if (el.type === 'polygon') {
      const p = el as PolygonElement
      const pts: number[] = []
      for (let i = 0; i < p.points.length; i += 2) pts.push(t.x(p.x + p.points[i]), t.y(p.y + p.points[i + 1]))
      if (fill) setFill(pdf, fill)
      setDraw(pdf, stroke, lw)
      polyline(pdf, pts, fill ? 'FD' : 'S', true)
      if (p.label && pts.length >= 4) {
        const xs = pts.filter((_, i) => i % 2 === 0)
        const ys = pts.filter((_, i) => i % 2 === 1)
        centreLabel(pdf, p.label, (Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2)
      }
    } else if (el.type === 'truss') {
      drawTruss(pdf, el as TrussElement, stroke, t)
    } else if (el.type === 'cable') {
      drawCable(pdf, el as CableElement, t, opts)
    } else if (el.type === 'text') {
      const tx = el as TextElement
      setText(pdf, hexToRgb(tx.fill || '#1f2937'))
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(Math.max(4, Math.min(12, (tx.fontSize || 14) * 0.5)))
      pdf.text(tx.text, t.x(tx.x), t.y(tx.y), tx.rotation ? { angle: -tx.rotation } : undefined)
    }
  }
}

function centreLabel(pdf: jsPDF, label: string, x: number, y: number) {
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.5)
  setText(pdf, [55, 65, 81])
  pdf.text(label, x, y, { align: 'center', baseline: 'middle' })
}

function drawTruss(pdf: jsPDF, te: TrussElement, stroke: RGB, t: Transform) {
  const x1 = t.x(te.x), y1 = t.y(te.y), x2 = t.x(te.x2), y2 = t.y(te.y2)
  const lengthM = Math.hypot(te.x2 - te.x, te.y2 - te.y)

  // Chord
  setDraw(pdf, stroke, 0.7)
  pdf.setLineCap('round')
  pdf.line(x1, y1, x2, y2)
  pdf.setLineCap('butt')

  // Ladder rungs every 0.5 m, as long as they stay readable
  const rungSpacing = lengthM > 0 && 0.5 * t.mmPerM >= 1.2 ? 0.5 : 0
  if (rungSpacing && lengthM > 0) {
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const dx = Math.sin(angle) * 0.9
    const dy = -Math.cos(angle) * 0.9
    setDraw(pdf, stroke, 0.2)
    for (let d = 0; d <= lengthM; d += rungSpacing) {
      const f = d / lengthM
      const hx = x1 + (x2 - x1) * f
      const hy = y1 + (y2 - y1) * f
      pdf.line(hx - dx, hy - dy, hx + dx, hy + dy)
    }
  }

  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(4.5)
  setText(pdf, [55, 65, 81])
  const label = [te.label, `${lengthM.toFixed(2)} m`].filter(Boolean).join('  ')
  pdf.text(label, (x1 + x2) / 2, (y1 + y2) / 2 - 2.4, { align: 'center' })
}

function drawCable(pdf: jsPDF, ce: CableElement, t: Transform, opts: PlotOptions) {
  const pts = [{ x: ce.x, y: ce.y }, ...(ce.waypoints ?? []), { x: ce.x2, y: ce.y2 }]
  const color = hexToRgb(CABLE_COLORS[ce.cableType] ?? '#9ca3af')
  const paper = pts.flatMap((p) => [t.x(p.x), t.y(p.y)])

  setDraw(pdf, color, 0.35)
  pdf.setLineDashPattern([1.4, 0.9], 0)
  pdf.setLineJoin('round')
  polyline(pdf, paper, 'S')
  pdf.setLineDashPattern([], 0)

  // End dots
  setFill(pdf, color)
  pdf.circle(paper[0], paper[1], 0.5, 'F')
  pdf.circle(paper[paper.length - 2], paper[paper.length - 1], 0.5, 'F')

  if (!opts.showCableLabels) return
  const label = [ce.autoLabel, ce.annotation, `${cableLength(ce).toFixed(1)} m`].filter(Boolean).join(' · ')
  if (!label) return
  const mid = Math.floor(pts.length / 2)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(4)
  setText(pdf, color)
  pdf.text(label, t.x(pts[mid].x) + 0.8, t.y(pts[mid].y) - 0.8)
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

function drawNodeBox(
  pdf: jsPDF, cx: number, cy: number, w: number, h: number, bg: RGB, lines: [string, number, boolean][],
) {
  setFill(pdf, bg)
  setDraw(pdf, darken(bg, 0.25), 0.2)
  pdf.roundedRect(cx - w / 2, cy - h / 2, w, h, 0.5, 0.5, 'F')
  let ty = cy - h / 2 + 2
  for (const [text, size, bold] of lines) {
    if (!text) continue
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(size)
    setText(pdf, [255, 255, 255])
    pdf.text(fitText(pdf, text, w - 2), cx - w / 2 + 1, ty)
    ty += size * 0.42 + 0.5
  }
}

function drawDistrosAndDevices(pdf: jsPDF, content: PlotContent, t: Transform) {
  for (const d of content.distros) {
    const w = Math.max(14, Math.min(26, 1.6 * t.mmPerM))
    const h = w * 0.55
    drawNodeBox(pdf, t.x(d.x ?? 0), t.y(d.y ?? 0), w, h, [220, 38, 38], [
      [d.ref ? `[${d.ref}] ${d.name}` : d.name, 4.5, true],
      [`${d.incomingRating}A · ${d.phases}Ø`, 3.6, false],
      [`${d.circuits.length} way${d.circuits.length !== 1 ? 's' : ''}`, 3.6, false],
    ])
  }
  for (const d of content.devices) {
    const w = Math.max(13, Math.min(24, 1.4 * t.mmPerM))
    const h = w * 0.5
    drawNodeBox(pdf, t.x(d.x ?? 0), t.y(d.y ?? 0), w, h, hexToRgb(DEVICE_COLORS[d.category] ?? '#6b7280'), [
      [d.name, 4.2, true],
      [d.manufacturer ?? '', 3.4, false],
    ])
  }
}

function drawFixtures(pdf: jsPDF, fixtures: PlacedFixture[], project: Project, t: Transform, opts: PlotOptions) {
  // Symbols are drawn near true size but never so small they stop reading.
  const rMm = Math.max(1.6, Math.min(4.5, SYMBOL_RADIUS_M * t.mmPerM))

  for (const f of fixtures) {
    const accent = opts.colorByLayer
      ? hexToRgb(project.layers.find((l) => l.id === f.layerId)?.color ?? symbolColors(f.symbol).stroke)
      : undefined
    drawFixtureSymbol(pdf, f.symbol, t.x(f.x), t.y(f.y), rMm, f.rotation, accent)
  }

  // Annotations are drawn after every symbol so nothing overpaints them.
  for (const f of fixtures) {
    const cx = t.x(f.x), cy = t.y(f.y)
    if (opts.showChannels && f.channel > 0) {
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(5)
      setText(pdf, INK)
      pdf.text(String(f.channel), cx, cy - rMm - 1.1, { align: 'center' })
    }
    let below = cy + rMm + 2
    if (opts.showAddresses) {
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(4)
      setText(pdf, MUTED)
      pdf.text(`${f.universe}.${String(f.address).padStart(3, '0')}`, cx, below, { align: 'center' })
      below += 1.8
    }
    if (opts.showFixtureLabels && f.label) {
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(4)
      setText(pdf, [55, 65, 81])
      pdf.text(f.label, cx, below, { align: 'center' })
    }
  }
}

// ── Legend column ─────────────────────────────────────────────────────────────

/**
 * Draws the key column: symbol key, cable key, scale bar. Returns nothing —
 * the column is laid out top-down and clipped to `frame`.
 */
export function drawLegend(
  pdf: jsPDF,
  frame: Rect,
  content: PlotContent,
  result: PlotRenderResult,
  paper: PaperSize,
) {
  const heading = (text: string, y: number) => {
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(5.5)
    setText(pdf, [148, 163, 184])
    pdf.text(text.toUpperCase(), frame.x, y)
    setDraw(pdf, [226, 232, 240], 0.15)
    pdf.line(frame.x, y + 1.2, frame.x + frame.w, y + 1.2)
    return y + 4.5
  }

  let y = frame.y + 4
  const bottomReserve = 18 // scale bar
  const limit = frame.y + frame.h - bottomReserve

  if (result.legendItems.length > 0) {
    y = heading('Symbol key', y)
    let shown = 0
    for (const item of result.legendItems) {
      if (y > limit - 6) break
      drawFixtureSymbol(pdf, item.symbol, frame.x + 3, y + 0.6, 2.4, 0)
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.2)
      setText(pdf, INK)
      pdf.text(fitText(pdf, item.label, frame.w - 13), frame.x + 7, y + 1)
      pdf.setFont('helvetica', 'bold')
      setText(pdf, MUTED)
      pdf.text(`×${item.count}`, frame.x + frame.w, y + 1, { align: 'right' })
      y += 6.5
      shown++
    }
    const hidden = result.legendItems.length - shown
    if (hidden > 0) {
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(4.5)
      setText(pdf, MUTED)
      pdf.text(`+ ${hidden} more type${hidden !== 1 ? 's' : ''}`, frame.x, y)
      y += 4
    }
    y += 2
  }

  const cables = cableTypesIn(content)
  if (cables.length > 0 && y < limit - 10) {
    y = heading('Cable key', y)
    for (const type of cables) {
      if (y > limit - 4) break
      setDraw(pdf, hexToRgb(CABLE_COLORS[type] ?? '#9ca3af'), 0.5)
      pdf.setLineDashPattern([1.2, 0.8], 0)
      pdf.line(frame.x, y, frame.x + 6, y)
      pdf.setLineDashPattern([], 0)
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5)
      setText(pdf, INK)
      pdf.text(fitText(pdf, CABLE_LABELS[type] ?? type, frame.w - 8), frame.x + 7.5, y + 0.8)
      y += 4.6
    }
  }

  drawScaleBar(pdf, frame.x, frame.y + frame.h - 12, frame.w, result, paper)
}

/** Graphic scale bar — the thing that keeps a drawing readable after printing. */
export function drawScaleBar(pdf: jsPDF, x: number, y: number, maxW: number, result: PlotRenderResult, paper: PaperSize) {
  const { mmPerM, denominator, standard } = result.scale

  // Pick a round number of metres that fills most of the available width.
  const candidates = [1, 2, 5, 10, 20, 25, 50, 100, 200]
  let metres = candidates[0]
  for (const c of candidates) if (c * mmPerM <= maxW) metres = c
  const barW = metres * mmPerM
  const barH = 1.6

  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(5.5)
  setText(pdf, INK)
  pdf.text(`SCALE  1:${denominator}${standard ? '' : ' (fitted)'}  @ ${PAPER_LABELS[paper]}`, x, y)

  // Alternating black/white segments, four of them.
  const segs = 4
  const segW = barW / segs
  const barY = y + 2
  for (let i = 0; i < segs; i++) {
    setFill(pdf, i % 2 === 0 ? INK : [255, 255, 255])
    setDraw(pdf, INK, 0.12)
    pdf.rect(x + i * segW, barY, segW, barH, 'FD')
  }
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(4.5)
  setText(pdf, MUTED)
  pdf.text('0', x, barY + barH + 3)
  pdf.text(`${metres} m`, x + barW, barY + barH + 3, { align: 'right' })
}
