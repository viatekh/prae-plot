import jsPDF from 'jspdf'
import type { Project, CableElement, CableType } from '../types'
import { CABLE_COLORS, CABLE_LABELS } from '../types'
import { formatVersion } from './utils'
import { defaultSymbolColors } from './symbols'
import { formatCircuitRef, computeDistroLoad, computeCircuitLoad, circuitCapacityW } from '../store/projectStore'

// ── Constants ─────────────────────────────────────────────────────────────────

const MM = 1              // unit: mm
const MARGIN = 12 * MM
const TITLE_BLOCK_H = 52 * MM   // height of title block
const ROW_H = 6 * MM

// Helvetica font shortcuts
const BOLD   = 'bold'   as const
const NORMAL = 'normal' as const

// Colour palette — architectural drawing look
const C = {
  ink:        [15,  23,  42]  as [number,number,number],   // near black
  mid:        [71,  85, 105]  as [number,number,number],   // slate-600
  light:      [148,163,184]   as [number,number,number],   // slate-400
  faint:      [226,232,240]   as [number,number,number],   // slate-200
  white:      [255,255,255]   as [number,number,number],
  blue:       [37,  99,235]   as [number,number,number],   // blue-600
  bluePale:   [239,246,255]   as [number,number,number],   // blue-50
  greenPale:  [240,253,244]   as [number,number,number],
  red:        [220, 38, 38]   as [number,number,number],
  amber:      [217,119,  6]   as [number,number,number],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rgb(pdf: jsPDF, col: [number,number,number], mode: 'fill'|'text'|'draw') {
  if (mode === 'fill')  pdf.setFillColor(col[0], col[1], col[2])
  if (mode === 'text')  pdf.setTextColor(col[0], col[1], col[2])
  if (mode === 'draw')  pdf.setDrawColor(col[0], col[1], col[2])
}

function line(pdf: jsPDF, x1: number, y1: number, x2: number, y2: number, lw = 0.2) {
  pdf.setLineWidth(lw)
  pdf.line(x1, y1, x2, y2)
}

function formatDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function cableLength(c: CableElement): number {
  const pts = [{ x: c.x, y: c.y }, ...(c.waypoints ?? []), { x: c.x2, y: c.y2 }]
  let len = 0
  for (let i = 1; i < pts.length; i++) len += Math.sqrt((pts[i].x - pts[i-1].x)**2 + (pts[i].y - pts[i-1].y)**2)
  return len
}

// ── Title block (architectural drawing frame) ─────────────────────────────────
// Draws the bottom title block and border on the current page

function drawTitleBlock(pdf: jsPDF, project: Project, W: number, H: number, subtitle = '') {
  const tbY = H - TITLE_BLOCK_H
  const m = MARGIN

  // Outer page border
  rgb(pdf, C.ink, 'draw')
  line(pdf, m, m, W - m, m, 0.6)
  line(pdf, m, m, m, H - m, 0.6)
  line(pdf, W - m, m, W - m, H - m, 0.6)
  line(pdf, m, H - m, W - m, H - m, 0.6)

  // Title block top rule
  line(pdf, m, tbY, W - m, tbY, 0.4)

  // ── Left: company + project ──────────────────────────────────────────────
  const col1W = (W - m * 2) * 0.38
  const col2W = (W - m * 2) * 0.28
  const col3X = m + col1W + col2W

  // Vertical dividers
  line(pdf, m + col1W, tbY, m + col1W, H - m, 0.3)
  line(pdf, m + col1W + col2W, tbY, m + col1W + col2W, H - m, 0.3)

  // Company name
  let ty = tbY + 7
  pdf.setFont('helvetica', BOLD); pdf.setFontSize(10)
  rgb(pdf, C.ink, 'text')
  pdf.text(project.info.companyName || 'Prae Plot', m + 3, ty)

  // Client
  if (project.info.clientName) {
    ty += 5
    pdf.setFont('helvetica', NORMAL); pdf.setFontSize(7.5)
    rgb(pdf, C.light, 'text')
    pdf.text('CLIENT', m + 3, ty)
    ty += 3.5
    rgb(pdf, C.mid, 'text'); pdf.setFontSize(8)
    pdf.text(project.info.clientName, m + 3, ty)
  }

  ty += 6
  line(pdf, m, ty, m + col1W, ty, 0.15)
  ty += 4

  // Project name
  pdf.setFont('helvetica', BOLD); pdf.setFontSize(11)
  rgb(pdf, C.ink, 'text')
  pdf.text(project.info.name, m + 3, ty, { maxWidth: col1W - 6 })
  ty += 4.5

  // Subtitle / drawing title
  if (subtitle) {
    pdf.setFont('helvetica', NORMAL); pdf.setFontSize(8.5)
    rgb(pdf, C.blue, 'text')
    pdf.text(subtitle, m + 3, ty + 3)
    ty += 6
  }

  ty += 3
  line(pdf, m, ty, m + col1W, ty, 0.15)
  ty += 4

  // Venue
  pdf.setFont('helvetica', NORMAL); pdf.setFontSize(7.5)
  rgb(pdf, C.light, 'text'); pdf.text('VENUE', m + 3, ty)
  ty += 3.5
  rgb(pdf, C.mid, 'text'); pdf.setFontSize(8)
  pdf.text(`${project.info.venue}${project.info.venueAddress ? ' — ' + project.info.venueAddress : ''}`, m + 3, ty, { maxWidth: col1W - 6 })

  // ── Middle: drawing metadata ──────────────────────────────────────────────
  const mx = m + col1W + 3
  const fields2 = [
    ['LIGHTING DESIGNER', project.info.lightingDesigner],
    ['TECHNICAL DIRECTOR', project.info.technicalDirector],
    ['DRAWING AUTHOR',     project.info.drawingAuthor],
    ['PROJECT DATE',       project.info.projectDate],
  ]
  let my = tbY + 7
  for (const [label, value] of fields2) {
    pdf.setFont('helvetica', NORMAL); pdf.setFontSize(6.5)
    rgb(pdf, C.light, 'text')
    pdf.text(label, mx, my)
    my += 3.2
    pdf.setFont('helvetica', BOLD); pdf.setFontSize(8)
    rgb(pdf, C.ink, 'text')
    pdf.text(value || '—', mx, my, { maxWidth: col2W - 6 })
    my += 5
    line(pdf, m + col1W, my - 1, m + col1W + col2W, my - 1, 0.1)
  }

  // ── Right: version + logo ─────────────────────────────────────────────────
  let rx = col3X + 3
  let ry = tbY + 7

  pdf.setFont('helvetica', NORMAL); pdf.setFontSize(6.5)
  rgb(pdf, C.light, 'text')
  pdf.text('VERSION', rx, ry)
  ry += 3.5
  pdf.setFont('helvetica', BOLD); pdf.setFontSize(16)
  rgb(pdf, C.ink, 'text')
  pdf.text(formatVersion(project.version), rx, ry)
  ry += 3

  line(pdf, col3X, ry + 3, W - m, ry + 3, 0.15)
  ry += 7

  pdf.setFont('helvetica', NORMAL); pdf.setFontSize(6.5)
  rgb(pdf, C.light, 'text')
  pdf.text('GENERATED', rx, ry)
  ry += 3.5
  pdf.setFont('helvetica', NORMAL); pdf.setFontSize(7.5)
  rgb(pdf, C.mid, 'text')
  pdf.text(new Date().toLocaleString(), rx, ry, { maxWidth: W - m - col3X - 6 })

  // Company logo
  if (project.info.companyLogo) {
    try {
      const logoW = 28; const logoH = 12
      pdf.addImage(project.info.companyLogo, 'PNG', W - m - logoW - 3, H - m - logoH - 3, logoW, logoH, undefined, 'FAST')
    } catch { /* ignore */ }
  }

  // "Generated by" watermark bottom-right
  pdf.setFont('helvetica', NORMAL); pdf.setFontSize(6)
  rgb(pdf, C.light, 'text')
  pdf.text('Generated by Prae Plot', W - m - 3, H - m - 2, { align: 'right' })
}

// ── Symbol key ─────────────────────────────────────────────────────────────────

function drawSymbolKey(pdf: jsPDF, project: Project, W: number, keyY: number) {
  // Group by manufacturer+model (not just symbol type)
  const fixtureTypes = new Map<string, { label: string; symbol: string }>()
  for (const f of project.fixtures) {
    const key = `${f.manufacturer} ${f.model}`
    if (!fixtureTypes.has(key)) fixtureTypes.set(key, { label: key, symbol: f.symbol })
  }
  if (fixtureTypes.size === 0) return

  pdf.setFont('helvetica', BOLD); pdf.setFontSize(6.5)
  rgb(pdf, C.light, 'text')
  pdf.text('SYMBOL KEY', MARGIN, keyY)

  let x = MARGIN
  let y = keyY + 5
  const itemW = 58
  const itemsPerRow = Math.floor((W - MARGIN * 2) / itemW)
  let col = 0

  fixtureTypes.forEach(({ label, symbol }) => {
    if (col >= itemsPerRow) { col = 0; x = MARGIN; y += 8 }
    const colors = defaultSymbolColors[symbol as keyof typeof defaultSymbolColors] ?? { fill: '#9ca3af', stroke: '#6b7280' }
    const hex = colors.fill
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    pdf.setFillColor(r, g, b)
    rgb(pdf, C.ink, 'draw')
    pdf.setLineWidth(0.4)
    pdf.circle(x + 3, y + 2, 3, 'FD')
    rgb(pdf, C.ink, 'text')
    pdf.setFont('helvetica', NORMAL); pdf.setFontSize(6.5)
    const clipped = label.length > 22 ? label.slice(0, 21) + '…' : label
    pdf.text(clipped, x + 8, y + 3.5)
    x += itemW; col++
  })
}

// ── Table utilities ────────────────────────────────────────────────────────────

function tableHeader(pdf: jsPDF, x: number, y: number, cols: { label: string; w: number }[], totalW: number) {
  rgb(pdf, C.ink, 'fill')
  pdf.rect(x, y, totalW, 5.5, 'F')
  rgb(pdf, C.white, 'text')
  pdf.setFont('helvetica', BOLD); pdf.setFontSize(6.5)
  let cx = x + 1.5
  for (const col of cols) {
    pdf.text(col.label, cx, y + 3.8)
    cx += col.w
  }
  return y + 5.5
}

function tableRow(pdf: jsPDF, x: number, y: number, cells: string[], cols: { w: number }[], even: boolean, totalW: number, maxW?: number) {
  if (even) {
    rgb(pdf, C.faint, 'fill')
    pdf.rect(x, y, totalW, ROW_H - 0.5, 'F')
  }
  rgb(pdf, C.ink, 'text')
  pdf.setFont('helvetica', NORMAL); pdf.setFontSize(7)
  let cx = x + 1.5
  for (let i = 0; i < cells.length; i++) {
    const mw = maxW ? Math.min(cols[i].w - 2, maxW) : cols[i].w - 2
    const clipped = cells[i].length > 30 ? cells[i].slice(0, 29) + '…' : cells[i]
    pdf.text(clipped, cx, y + 4, { maxWidth: mw })
    cx += cols[i].w
  }
  return y + ROW_H - 0.5
}

// ── Plot PDF ──────────────────────────────────────────────────────────────────

export async function exportPlotPDF(project: Project, stageDataURL: string, _layerIds?: string[], layerLabel?: string) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()

  const contentTop = MARGIN + 2
  const contentBot = H - TITLE_BLOCK_H - 8
  const contentLeft = MARGIN + 2
  const contentRight = W - MARGIN - 2

  // Plot image
  const plotW = contentRight - contentLeft
  const plotH = contentBot - contentTop - 10  // leave room for symbol key

  pdf.addImage(stageDataURL, 'PNG', contentLeft, contentTop, plotW, plotH, undefined, 'FAST')

  // Symbol key above title block
  const keyY = contentTop + plotH + 3
  drawSymbolKey(pdf, project, W, keyY)

  // Layer label badge (if exporting single layer)
  if (layerLabel) {
    rgb(pdf, C.blue, 'fill')
    pdf.roundedRect(contentLeft, contentTop + 2, 28, 6, 1, 1, 'F')
    rgb(pdf, C.white, 'text')
    pdf.setFont('helvetica', BOLD); pdf.setFontSize(7)
    pdf.text(`Layer: ${layerLabel}`, contentLeft + 2, contentTop + 6)
  }

  const subtitle = layerLabel ? `Lighting Plot — ${layerLabel}` : 'Lighting Plot'
  drawTitleBlock(pdf, project, W, H, subtitle)

  const filename = layerLabel
    ? `${project.info.name}_Plot_${layerLabel}_${formatVersion(project.version)}_${formatDate()}.pdf`
    : `${project.info.name}_Plot_${formatVersion(project.version)}_${formatDate()}.pdf`
  pdf.save(filename)
}

// ── Patch PDF ─────────────────────────────────────────────────────────────────

export async function exportPatchPDF(project: Project) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const distros = project.distros

  const fixtures = [...project.fixtures].sort((a, b) => a.channel - b.channel)

  const contentTop = MARGIN + 4
  const cols = [
    { label: 'ID',      w: 10 },
    { label: 'CIRCUIT', w: 32 },
    { label: 'FIXTURE', w: 52 },
    { label: 'PATCH',   w: 20 },
    { label: 'MODE',    w: 24 },
    { label: 'CH CNT',  w: 13 },
    { label: 'COLOUR',  w: 18 },
    { label: 'NOTES',   w: 0  },
  ]
  const totalW = W - MARGIN * 2
  cols[cols.length - 1].w = totalW - cols.slice(0, -1).reduce((s, c) => s + c.w, 0)

  // Page title
  rgb(pdf, C.ink, 'text')
  pdf.setFont('helvetica', BOLD); pdf.setFontSize(14)
  pdf.text('PATCH SHEET', MARGIN, contentTop + 8)
  pdf.setFont('helvetica', NORMAL); pdf.setFontSize(8)
  rgb(pdf, C.mid, 'text')
  pdf.text(`${project.info.name}  ·  ${project.info.venue}  ·  v${formatVersion(project.version)}`, MARGIN, contentTop + 14)

  // Separator
  rgb(pdf, C.blue, 'draw')
  pdf.setLineWidth(0.8)
  pdf.line(MARGIN, contentTop + 17, W - MARGIN, contentTop + 17)

  let y = contentTop + 22
  y = tableHeader(pdf, MARGIN, y, cols, totalW)

  pdf.setFont('helvetica', NORMAL); pdf.setFontSize(7)
  fixtures.forEach((f, idx) => {
    if (y > H - TITLE_BLOCK_H - 10) {
      pdf.addPage()
      y = MARGIN + 4
      y = tableHeader(pdf, MARGIN, y, cols, totalW)
    }
    const circ = formatCircuitRef(distros, f.circuitId)
    const row = [
      String(f.channel || '—'),
      circ,
      `${f.manufacturer} ${f.model}`,
      `${f.universe}.${String(f.address).padStart(3, '0')}`,
      f.mode,
      String(f.channelCount || '—'),
      f.color || '—',
      f.notes || '',
    ]
    y = tableRow(pdf, MARGIN, y, row, cols, idx % 2 === 0, totalW)
  })

  if (fixtures.length === 0) {
    rgb(pdf, C.light, 'text'); pdf.setFontSize(9)
    pdf.text('No fixtures placed yet.', W / 2, y + 12, { align: 'center' })
  } else {
    // Summary footer
    y += 2
    rgb(pdf, C.faint, 'fill')
    pdf.rect(MARGIN, y, totalW, 6, 'F')
    rgb(pdf, C.mid, 'text'); pdf.setFont('helvetica', BOLD); pdf.setFontSize(7)
    pdf.text(`${fixtures.length} fixture${fixtures.length !== 1 ? 's' : ''} · ${(project.fixtures.reduce((s, f) => s + f.powerRating, 0) / 1000).toFixed(1)} kW · ${project.fixtures.reduce((s, f) => s + f.weight, 0).toFixed(1)} kg`, MARGIN + 2, y + 4)
  }

  drawTitleBlock(pdf, project, W, H, 'Patch Sheet')
  pdf.save(`${project.info.name}_Patch_${formatVersion(project.version)}_${formatDate()}.pdf`)
}

// ── Equipment PDF ─────────────────────────────────────────────────────────────

export async function exportEquipmentPDF(project: Project) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()

  const contentTop = MARGIN + 4
  const totalW = W - MARGIN * 2
  const cols = [
    { label: 'QTY',  w: 12 },
    { label: 'FIXTURE', w: 0 },
    { label: 'WEIGHT', w: 20 },
    { label: 'POWER',  w: 20 },
  ]
  cols[1].w = totalW - cols.filter((_, i) => i !== 1).reduce((s, c) => s + c.w, 0)

  pdf.setFont('helvetica', BOLD); pdf.setFontSize(14)
  rgb(pdf, C.ink, 'text')
  pdf.text('EQUIPMENT LIST', MARGIN, contentTop + 8)
  pdf.setFont('helvetica', NORMAL); pdf.setFontSize(8)
  rgb(pdf, C.mid, 'text')
  pdf.text(`${project.info.name}  ·  ${project.info.venue}  ·  v${formatVersion(project.version)}`, MARGIN, contentTop + 14)
  rgb(pdf, C.blue, 'draw'); pdf.setLineWidth(0.8)
  pdf.line(MARGIN, contentTop + 17, W - MARGIN, contentTop + 17)

  const byModel: Record<string, { name: string; manufacturer: string; qty: number; weight: number; power: number }> = {}
  for (const f of project.fixtures) {
    const key = `${f.manufacturer}__${f.model}`
    if (!byModel[key]) byModel[key] = { name: f.model, manufacturer: f.manufacturer, qty: 0, weight: 0, power: 0 }
    byModel[key].qty += 1
    byModel[key].weight += f.weight
    byModel[key].power += f.powerRating
  }

  let y = contentTop + 22
  y = tableHeader(pdf, MARGIN, y, cols, totalW)

  const items = Object.values(byModel).sort((a, b) => b.qty - a.qty)
  items.forEach((item, idx) => {
    if (y > H - TITLE_BLOCK_H - 10) {
      pdf.addPage(); y = MARGIN + 4
      y = tableHeader(pdf, MARGIN, y, cols, totalW)
    }
    y = tableRow(pdf, MARGIN, y, [
      String(item.qty),
      `${item.manufacturer}  ${item.name}`,
      `${item.weight.toFixed(1)} kg`,
      `${item.power.toFixed(0)} W`,
    ], cols, idx % 2 === 0, totalW)
  })

  if (items.length > 0) {
    y += 1
    rgb(pdf, C.ink, 'fill')
    pdf.rect(MARGIN, y, totalW, 6, 'F')
    rgb(pdf, C.white, 'text'); pdf.setFont('helvetica', BOLD); pdf.setFontSize(7)
    const tw = project.fixtures.reduce((s, f) => s + f.weight, 0)
    const tp = project.fixtures.reduce((s, f) => s + f.powerRating, 0)
    pdf.text('TOTAL', MARGIN + 2, y + 4)
    const wCol = MARGIN + cols[0].w + cols[1].w
    pdf.text(`${tw.toFixed(1)} kg`, wCol + 2, y + 4)
    pdf.text(`${tp.toFixed(0)} W`, wCol + cols[2].w + 2, y + 4)
  }

  drawTitleBlock(pdf, project, W, H, 'Equipment List')
  pdf.save(`${project.info.name}_Equipment_${formatVersion(project.version)}_${formatDate()}.pdf`)
}

// ── Cable PDF ─────────────────────────────────────────────────────────────────

const RENTAL_LENGTHS: Record<string, number[]> = {
  power:   [1, 2, 5, 10, 20],
  data:    [1, 2, 5, 10, 20],
  network: [1, 2, 5, 10, 20, 50],
  audio:   [1, 2, 5, 10, 20],
}

function getRentalLengths(type: CableType): number[] {
  if (type.startsWith('power') || type.startsWith('cee') || type === 'iec') return RENTAL_LENGTHS.power
  if (type === 'ethernet' || type === 'cat6' || type === 'fibre') return RENTAL_LENGTHS.network
  if (type.startsWith('dmx')) return RENTAL_LENGTHS.data
  return RENTAL_LENGTHS.audio
}

function breakIntoLengths(totalM: number, available: number[]): Record<number, number> {
  const sorted = [...available].sort((a, b) => b - a)
  const result: Record<number, number> = {}
  let rem = totalM
  for (const len of sorted) {
    const count = Math.floor(rem / len)
    if (count > 0) { result[len] = count; rem -= count * len }
  }
  if (rem > 0.05) {
    const min = sorted[sorted.length - 1]
    result[min] = (result[min] ?? 0) + 1
  }
  return result
}

function resolveName(id: string | undefined, project: Project): string {
  if (!id) return '—'
  const fx = project.fixtures.find((f) => f.id === id)
  if (fx) return `CH${fx.channel} ${fx.shortName || fx.model}`
  const dx = project.distros.find((d) => d.id === id)
  if (dx) return dx.ref ? `[${dx.ref}] ${dx.name}` : dx.name
  return '—'
}

export async function exportCablePDF(project: Project) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const contentTop = MARGIN + 4
  const totalW = W - MARGIN * 2
  const OVERHEAD = 0.20  // 20%

  pdf.setFont('helvetica', BOLD); pdf.setFontSize(14)
  rgb(pdf, C.ink, 'text')
  pdf.text('CABLE SCHEDULE', MARGIN, contentTop + 8)
  pdf.setFont('helvetica', NORMAL); pdf.setFontSize(8)
  rgb(pdf, C.mid, 'text')
  pdf.text(`${project.info.name}  ·  ${project.info.venue}  ·  v${formatVersion(project.version)}`, MARGIN, contentTop + 14)
  rgb(pdf, C.blue, 'draw'); pdf.setLineWidth(0.8)
  pdf.line(MARGIN, contentTop + 17, W - MARGIN, contentTop + 17)

  const cables = project.elements.filter((e) => e.type === 'cable') as CableElement[]
  if (cables.length === 0) {
    rgb(pdf, C.light, 'text'); pdf.setFontSize(9)
    pdf.text('No cable runs drawn.', W / 2, contentTop + 30, { align: 'center' })
    drawTitleBlock(pdf, project, W, H, 'Cable Schedule')
    pdf.save(`${project.info.name}_Cables_${formatVersion(project.version)}_${formatDate()}.pdf`)
    return
  }

  // Group by type
  const byType: Record<string, CableElement[]> = {}
  for (const c of cables) {
    if (!byType[c.cableType]) byType[c.cableType] = []
    byType[c.cableType].push(c)
  }

  const runCols = [
    { label: '#',     w: 8 },
    { label: 'FROM',  w: 42 },
    { label: 'TO',    w: 42 },
    { label: 'PLOT',  w: 18 },
    { label: '+20%',  w: 18 },
  ]
  runCols[runCols.length - 1].w = totalW - runCols.slice(0, -1).reduce((s, c) => s + c.w, 0)

  let y = contentTop + 22
  let runIdx = 1

  for (const [type, runs] of Object.entries(byType)) {
    if (y > H - TITLE_BLOCK_H - 20) {
      pdf.addPage(); y = MARGIN + 4
    }

    // Type heading bar with colour swatch
    const hexColor = CABLE_COLORS[type as CableType] ?? '#9ca3af'
    const r = parseInt(hexColor.slice(1, 3), 16)
    const g = parseInt(hexColor.slice(3, 5), 16)
    const b = parseInt(hexColor.slice(5, 7), 16)
    pdf.setFillColor(r, g, b)
    pdf.rect(MARGIN, y, 3, 5.5, 'F')
    rgb(pdf, C.faint, 'fill')
    pdf.rect(MARGIN + 3, y, totalW - 3, 5.5, 'F')
    rgb(pdf, C.ink, 'text'); pdf.setFont('helvetica', BOLD); pdf.setFontSize(7.5)
    pdf.text(CABLE_LABELS[type as CableType] ?? type, MARGIN + 6, y + 3.8)
    const typeTotal = runs.reduce((s, c) => s + cableLength(c) * (1 + OVERHEAD), 0)
    rgb(pdf, C.mid, 'text'); pdf.setFont('helvetica', NORMAL); pdf.setFontSize(7)
    pdf.text(`${runs.length} run${runs.length !== 1 ? 's' : ''}  ·  ${typeTotal.toFixed(1)} m total`, W - MARGIN - 2, y + 3.8, { align: 'right' })
    y += 5.5

    y = tableHeader(pdf, MARGIN, y, runCols, totalW)

    runs.forEach((c, i) => {
      if (y > H - TITLE_BLOCK_H - 10) {
        pdf.addPage(); y = MARGIN + 4
        y = tableHeader(pdf, MARGIN, y, runCols, totalW)
      }
      const plotM = cableLength(c)
      const withOH = plotM * (1 + OVERHEAD)
      y = tableRow(pdf, MARGIN, y, [
        String(runIdx++),
        resolveName(c.startConnectedTo, project),
        resolveName(c.endConnectedTo, project),
        `${plotM.toFixed(1)} m`,
        `${withOH.toFixed(1)} m`,
      ], runCols, i % 2 === 0, totalW)
    })

    // Optimal length breakdown
    y += 3
    if (y > H - TITLE_BLOCK_H - 30) {
      pdf.addPage(); y = MARGIN + 4
    }
    const available = getRentalLengths(type as CableType)
    const breakdown = breakIntoLengths(typeTotal, available)
    const sorted = available.filter((l) => breakdown[l])

    rgb(pdf, C.light, 'text'); pdf.setFont('helvetica', BOLD); pdf.setFontSize(6.5)
    pdf.text('OPTIMAL LENGTHS', MARGIN, y + 3)
    y += 4.5

    sorted.forEach((len, i) => {
      const qty = breakdown[len] ?? 0
      if (qty === 0) return
      const bx = MARGIN + i * 30
      rgb(pdf, C.bluePale, 'fill')
      pdf.roundedRect(bx, y, 26, 9, 1, 1, 'F')
      rgb(pdf, C.blue, 'text'); pdf.setFont('helvetica', BOLD); pdf.setFontSize(9)
      pdf.text(`${qty}×`, bx + 2, y + 6.5)
      rgb(pdf, C.ink, 'text'); pdf.setFont('helvetica', NORMAL); pdf.setFontSize(8)
      pdf.text(`${len} m`, bx + 11, y + 6.5)
    })
    y += 13
  }

  drawTitleBlock(pdf, project, W, H, 'Cable Schedule')
  pdf.save(`${project.info.name}_Cables_${formatVersion(project.version)}_${formatDate()}.pdf`)
}

// ── Power PDF ─────────────────────────────────────────────────────────────────

export async function exportPowerPDF(project: Project) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const contentTop = MARGIN + 4
  const totalW = W - MARGIN * 2
  const kw = (w: number) => `${(w / 1000).toFixed(2)} kW`

  pdf.setFont('helvetica', BOLD); pdf.setFontSize(14)
  rgb(pdf, C.ink, 'text')
  pdf.text('POWER REPORT', MARGIN, contentTop + 8)
  pdf.setFont('helvetica', NORMAL); pdf.setFontSize(8)
  rgb(pdf, C.mid, 'text')
  pdf.text(`${project.info.name}  ·  ${project.info.venue}  ·  v${formatVersion(project.version)}`, MARGIN, contentTop + 14)
  rgb(pdf, C.blue, 'draw'); pdf.setLineWidth(0.8)
  pdf.line(MARGIN, contentTop + 17, W - MARGIN, contentTop + 17)

  const { distros, fixtures, elements } = project
  const totalFixturePower = fixtures.reduce((s, f) => s + f.powerRating, 0)
  const totalCapacity = distros.reduce((s, d) => s + d.incomingRating * d.phases * 230, 0)
  const totalAssigned = distros.reduce((s, d) => s + computeDistroLoad(d, distros, fixtures, elements, new Set()), 0)
  const unassigned = fixtures.filter((f) => !f.circuitId).length

  // KPI summary boxes
  let y = contentTop + 22
  const kpiBoxW = (totalW - 6) / 4
  const kpis = [
    { label: 'FIXTURE LOAD',     value: kw(totalFixturePower), sub: `${fixtures.length} fixtures` },
    { label: 'DISTRO CAPACITY',  value: kw(totalCapacity),     sub: `${distros.length} distros` },
    { label: 'ASSIGNED LOAD',    value: kw(totalAssigned),     sub: totalCapacity > 0 ? `${Math.round(totalAssigned / totalCapacity * 100)}% of capacity` : '—' },
    { label: 'UNASSIGNED',       value: String(unassigned),    sub: unassigned > 0 ? 'fixtures need circuit' : 'all assigned' },
  ]
  kpis.forEach((k, i) => {
    const bx = MARGIN + i * (kpiBoxW + 2)
    rgb(pdf, C.faint, 'fill')
    pdf.roundedRect(bx, y, kpiBoxW, 17, 1, 1, 'F')
    pdf.setFont('helvetica', NORMAL); pdf.setFontSize(5.5)
    rgb(pdf, C.light, 'text')
    pdf.text(k.label, bx + 2.5, y + 4.5)
    pdf.setFont('helvetica', BOLD); pdf.setFontSize(9.5)
    rgb(pdf, C.ink, 'text')
    pdf.text(k.value, bx + 2.5, y + 10.5)
    pdf.setFont('helvetica', NORMAL); pdf.setFontSize(6)
    rgb(pdf, C.mid, 'text')
    pdf.text(k.sub, bx + 2.5, y + 14.5)
  })
  y += 22

  if (distros.length === 0) {
    rgb(pdf, C.light, 'text'); pdf.setFontSize(9)
    pdf.text('No power distribution added.', W / 2, y + 12, { align: 'center' })
    drawTitleBlock(pdf, project, W, H, 'Power Report')
    pdf.save(`${project.info.name}_Power_${formatVersion(project.version)}_${formatDate()}.pdf`)
    return
  }

  for (const distro of distros) {
    if (y > H - TITLE_BLOCK_H - 60) { pdf.addPage(); y = MARGIN + 4 }

    const totalLoad = computeDistroLoad(distro, distros, fixtures, elements, new Set())
    const directLoad = distro.circuits.reduce((s, c) => s + computeCircuitLoad(fixtures, c.id), 0)
    const downstreamLoad = totalLoad - directLoad
    const capacity = distro.incomingRating * distro.phases * 230
    const p = capacity > 0 ? Math.round(totalLoad / capacity * 100) : 0

    // Header
    rgb(pdf, C.ink, 'fill')
    pdf.rect(MARGIN, y, totalW, 11, 'F')
    rgb(pdf, C.white, 'text')
    pdf.setFont('helvetica', BOLD); pdf.setFontSize(9)
    const title = distro.ref ? `[${distro.ref}]  ${distro.name}` : distro.name
    pdf.text(title, MARGIN + 3, y + 5)
    const pTextCol: [number,number,number] = p > 90 ? [252,165,165] : p > 70 ? [253,230,138] : [134,239,172]
    rgb(pdf, pTextCol, 'text')
    pdf.text(`${kw(totalLoad)}  ·  ${p}%`, W - MARGIN - 3, y + 5, { align: 'right' })
    rgb(pdf, [156,163,175] as [number,number,number], 'text')
    pdf.setFont('helvetica', NORMAL); pdf.setFontSize(6.5)
    pdf.text(`${distro.incomingRating}A · ${distro.phases}Ø · ${distro.circuits.length} circuits`, MARGIN + 3, y + 9)
    const downStr = downstreamLoad > 0
      ? `${kw(directLoad)} direct + ${kw(downstreamLoad)} downstream  ·  capacity ${kw(capacity)}`
      : `${kw(directLoad)} direct  ·  capacity ${kw(capacity)}`
    pdf.text(downStr, W - MARGIN - 3, y + 9, { align: 'right' })
    y += 11

    // Load bar
    rgb(pdf, C.faint, 'fill')
    pdf.rect(MARGIN, y, totalW, 4, 'F')
    const barCol: [number,number,number] = p > 90 ? C.red : p > 70 ? C.amber : [34,197,94]
    rgb(pdf, barCol, 'fill')
    pdf.rect(MARGIN, y, totalW * Math.min(p, 100) / 100, 4, 'F')
    y += 6

    // Phase balance for 3Ø
    if (distro.phases === 3) {
      const byPhase = [1, 2, 3].map((ph) => {
        const pCircs = distro.circuits.filter((c) => c.phase === ph)
        const load = pCircs.reduce((s, c) => s + computeCircuitLoad(fixtures, c.id), 0)
        const cap = pCircs.reduce((s, c) => s + circuitCapacityW(c), 0)
        return { ph, load, cap }
      })
      const maxLoad = Math.max(...byPhase.map((b) => b.load), 1)
      const imbalance = (maxLoad - Math.min(...byPhase.map((b) => b.load))) / maxLoad * 100

      const phW = (totalW - 4) / 3
      const phColors: [number,number,number][] = [[180,140,40],[50,130,200],[140,60,200]]
      byPhase.forEach(({ ph, load, cap }, i) => {
        const bx = MARGIN + i * (phW + 2)
        rgb(pdf, C.faint, 'fill')
        pdf.roundedRect(bx, y, phW, 12, 1, 1, 'F')
        rgb(pdf, phColors[i], 'text')
        pdf.setFont('helvetica', BOLD); pdf.setFontSize(7)
        pdf.text(`L${ph}`, bx + 2.5, y + 5)
        rgb(pdf, C.ink, 'text')
        pdf.setFont('helvetica', NORMAL); pdf.setFontSize(6.5)
        pdf.text(kw(load), bx + 10, y + 5)
        const pp = cap > 0 ? Math.round(load / cap * 100) : 0
        rgb(pdf, C.light, 'text'); pdf.setFontSize(5.5)
        pdf.text(`${kw(cap)} cap · ${pp}%`, bx + 2.5, y + 9.5)
      })
      y += 14
      if (imbalance > 15) {
        rgb(pdf, C.amber, 'text'); pdf.setFont('helvetica', NORMAL); pdf.setFontSize(6.5)
        pdf.text(`⚠ Phase imbalance: ${imbalance.toFixed(0)}% — consider re-balancing circuits`, MARGIN + 2, y + 4)
        y += 7
      }
    }

    // Circuit cols
    const hasPhase = distro.phases === 3
    const cCols = hasPhase
      ? [{ label: 'CIRCUIT', w: 18 }, { label: 'PH', w: 11 }, { label: 'FIXTURES', w: 0 }, { label: 'LOAD', w: 22 }, { label: 'RATING', w: 16 }, { label: 'FREE', w: 18 }]
      : [{ label: 'CIRCUIT', w: 18 },                          { label: 'FIXTURES', w: 0 }, { label: 'LOAD', w: 22 }, { label: 'RATING', w: 16 }, { label: 'FREE', w: 18 }]
    const fxColIdx = hasPhase ? 2 : 1
    cCols[fxColIdx].w = totalW - cCols.filter((_, i) => i !== fxColIdx).reduce((s, c) => s + c.w, 0)

    y = tableHeader(pdf, MARGIN, y, cCols, totalW)

    distro.circuits.forEach((c, i) => {
      if (y > H - TITLE_BLOCK_H - 10) { pdf.addPage(); y = MARGIN + 4; y = tableHeader(pdf, MARGIN, y, cCols, totalW) }
      const load = computeCircuitLoad(fixtures, c.id)
      const cap = circuitCapacityW(c)
      const fxStr = fixtures.filter((f) => f.circuitId === c.id).map((f) => `CH${f.channel}`).join(' ') || '—'
      const ref = distro.ref ? `${distro.ref}·${i + 1}` : c.name
      const cells = hasPhase
        ? [ref, `L${c.phase}`, fxStr, load > 0 ? `${load.toFixed(0)} W` : '—', `${c.rating}A`, `${(cap - load).toFixed(0)} W`]
        : [ref,                fxStr, load > 0 ? `${load.toFixed(0)} W` : '—', `${c.rating}A`, `${(cap - load).toFixed(0)} W`]
      y = tableRow(pdf, MARGIN, y, cells, cCols, i % 2 === 0, totalW)
    })

    // Distro total footer
    rgb(pdf, C.faint, 'fill')
    pdf.rect(MARGIN, y, totalW, 6, 'F')
    rgb(pdf, C.mid, 'text'); pdf.setFont('helvetica', BOLD); pdf.setFontSize(6.5)
    pdf.text(`TOTAL  ${kw(directLoad)}  ·  capacity ${kw(capacity)}  ·  headroom ${kw(capacity - directLoad)}`, MARGIN + 3, y + 4)
    y += 9
  }

  drawTitleBlock(pdf, project, W, H, 'Power Report')
  pdf.save(`${project.info.name}_Power_${formatVersion(project.version)}_${formatDate()}.pdf`)
}

// ── Groups PDF ────────────────────────────────────────────────────────────────

export async function exportGroupsPDF(project: Project) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const contentTop = MARGIN + 4
  const totalW = W - MARGIN * 2

  pdf.setFont('helvetica', BOLD); pdf.setFontSize(14)
  rgb(pdf, C.ink, 'text')
  pdf.text('GROUPS', MARGIN, contentTop + 8)
  pdf.setFont('helvetica', NORMAL); pdf.setFontSize(8)
  rgb(pdf, C.mid, 'text')
  pdf.text(`${project.info.name}  ·  ${project.info.venue}  ·  v${formatVersion(project.version)}`, MARGIN, contentTop + 14)
  rgb(pdf, C.blue, 'draw'); pdf.setLineWidth(0.8)
  pdf.line(MARGIN, contentTop + 17, W - MARGIN, contentTop + 17)

  const { groups, fixtures } = project
  let y = contentTop + 22

  if (groups.length === 0) {
    rgb(pdf, C.light, 'text'); pdf.setFontSize(9)
    pdf.text('No groups defined.', W / 2, y + 12, { align: 'center' })
    drawTitleBlock(pdf, project, W, H, 'Groups')
    pdf.save(`${project.info.name}_Groups_${formatVersion(project.version)}_${formatDate()}.pdf`)
    return
  }

  const cols = [
    { label: 'ID',          w: 10 },
    { label: 'FIXTURE',     w: 0  },
    { label: 'PATCH',       w: 20 },
    { label: 'POWER',       w: 20 },
    { label: 'WEIGHT',      w: 18 },
  ]
  cols[1].w = totalW - cols.filter((_, i) => i !== 1).reduce((s, c) => s + c.w, 0)

  for (const g of groups) {
    const members = fixtures.filter((f) => g.fixtureIds.includes(f.id))
    const totalPow = members.reduce((s, f) => s + f.powerRating, 0)
    const totalWt  = members.reduce((s, f) => s + f.weight, 0)

    if (y > H - TITLE_BLOCK_H - 30) { pdf.addPage(); y = MARGIN + 4 }

    // Group header
    const hex = g.color
    const gr = parseInt(hex.slice(1, 3), 16)
    const gg = parseInt(hex.slice(3, 5), 16)
    const gb = parseInt(hex.slice(5, 7), 16)
    pdf.setFillColor(gr, gg, gb)
    pdf.rect(MARGIN, y, 4, 10, 'F')
    rgb(pdf, C.faint, 'fill')
    pdf.rect(MARGIN + 4, y, totalW - 4, 10, 'F')
    rgb(pdf, C.ink, 'text')
    pdf.setFont('helvetica', BOLD); pdf.setFontSize(9)
    pdf.text(g.name, MARGIN + 8, y + 5.5)
    pdf.setFont('helvetica', NORMAL); pdf.setFontSize(7)
    rgb(pdf, C.mid, 'text')
    const summary = `${members.length} fixture${members.length !== 1 ? 's' : ''}  ·  ${(totalPow / 1000).toFixed(2)} kW  ·  ${totalWt.toFixed(1)} kg`
    pdf.text(summary, W - MARGIN - 3, y + 5.5, { align: 'right' })
    y += 10

    if (members.length === 0) {
      rgb(pdf, C.light, 'text'); pdf.setFontSize(7)
      pdf.text('No fixtures in this group.', MARGIN + 3, y + 4)
      y += 8
      continue
    }

    y = tableHeader(pdf, MARGIN, y, cols, totalW)

    members.sort((a, b) => a.channel - b.channel).forEach((f, i) => {
      if (y > H - TITLE_BLOCK_H - 10) { pdf.addPage(); y = MARGIN + 4; y = tableHeader(pdf, MARGIN, y, cols, totalW) }
      y = tableRow(pdf, MARGIN, y, [
        String(f.channel),
        `${f.manufacturer}  ${f.model}`,
        `${f.universe}.${String(f.address).padStart(3, '0')}`,
        `${f.powerRating.toFixed(0)} W`,
        `${f.weight.toFixed(1)} kg`,
      ], cols, i % 2 === 0, totalW)
    })
    y += 4
  }

  drawTitleBlock(pdf, project, W, H, 'Groups')
  pdf.save(`${project.info.name}_Groups_${formatVersion(project.version)}_${formatDate()}.pdf`)
}
