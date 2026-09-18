import jsPDF from 'jspdf'
import type { Project, CableElement, CableType } from '../types'
import { CABLE_COLORS, CABLE_LABELS } from '../types'
import { formatVersion, cableLength } from './utils'
import {
  DEFAULT_PLOT_OPTIONS, contentBounds, drawLegend, drawPlot, paperDimensions, selectPlotContent,
} from './plotVector'
import type { PlotOptions } from './plotVector'
import { formatCircuitRef, computeDistroLoad, computeCircuitLoad, circuitCapacityW } from '../store/projectStore'

// ── Constants ─────────────────────────────────────────────────────────────────

const MARGIN = 12            // mm
const PLOT_TITLE_BLOCK_H = 52 // mm — the architectural block under a drawing
const REPORT_FOOTER_H = 15   // mm — the compact strip under a report
const ROW_H = 6              // mm

const BOLD = 'bold' as const
const NORMAL = 'normal' as const

// Colour palette — architectural drawing look
const C = {
  ink:       [15, 23, 42] as RGB,    // near black
  mid:       [71, 85, 105] as RGB,   // slate-600
  light:     [148, 163, 184] as RGB, // slate-400
  faint:     [226, 232, 240] as RGB, // slate-200
  white:     [255, 255, 255] as RGB,
  blue:      [37, 99, 235] as RGB,   // blue-600
  bluePale:  [239, 246, 255] as RGB, // blue-50
  red:       [220, 38, 38] as RGB,
  amber:     [217, 119, 6] as RGB,
  green:     [34, 197, 94] as RGB,
}

type RGB = [number, number, number]

/** A built document, ready to preview or save. */
export interface BuiltPdf {
  doc: jsPDF
  filename: string
}

export function savePdf(built: BuiltPdf) {
  built.doc.save(built.filename)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rgb(pdf: jsPDF, col: RGB, mode: 'fill' | 'text' | 'draw') {
  if (mode === 'fill') pdf.setFillColor(col[0], col[1], col[2])
  if (mode === 'text') pdf.setTextColor(col[0], col[1], col[2])
  if (mode === 'draw') pdf.setDrawColor(col[0], col[1], col[2])
}

function line(pdf: jsPDF, x1: number, y1: number, x2: number, y2: number, lw = 0.2) {
  pdf.setLineWidth(lw)
  pdf.line(x1, y1, x2, y2)
}

function formatDate(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Filesystem-safe version of a project name. */
function slug(name: string): string {
  return (name || 'Project').replace(/[^\w\-. ]+/g, '').trim().replace(/\s+/g, '_') || 'Project'
}

function filenameFor(project: Project, kind: string): string {
  return `${slug(project.info.name)}_${kind}_${formatVersion(project.version)}_${formatDate()}.pdf`
}

/** Shortens text with an ellipsis so it fits `maxW` mm at the current font. */
function fit(pdf: jsPDF, text: string, maxW: number): string {
  if (!text) return ''
  if (maxW <= 0) return ''
  if (pdf.getTextWidth(text) <= maxW) return text
  let lo = 0, hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (pdf.getTextWidth(text.slice(0, mid) + '…') <= maxW) lo = mid
    else hi = mid - 1
  }
  return lo > 0 ? text.slice(0, lo) + '…' : ''
}

function setDocProperties(pdf: jsPDF, project: Project, subject: string) {
  pdf.setProperties({
    title: `${project.info.name} — ${subject}`,
    subject,
    author: project.info.drawingAuthor || project.info.lightingDesigner || project.info.companyName || 'Prae Plot',
    creator: 'Prae Plot',
    keywords: ['lighting', 'plot', project.info.venue].filter(Boolean).join(', '),
  })
}

// ── Title block (architectural drawing frame) ─────────────────────────────────

interface TitleBlockExtras {
  scaleLabel?: string
  layerLabel?: string
}

function drawTitleBlock(
  pdf: jsPDF, project: Project, W: number, H: number, subtitle: string,
  page: number, pageCount: number, extras: TitleBlockExtras = {},
) {
  const tbY = H - PLOT_TITLE_BLOCK_H
  const m = MARGIN

  // Outer page border
  rgb(pdf, C.ink, 'draw')
  pdf.setLineWidth(0.6)
  pdf.rect(m, m, W - m * 2, H - m * 2, 'S')

  // Title block top rule
  line(pdf, m, tbY, W - m, tbY, 0.4)

  const col1W = (W - m * 2) * 0.38
  const col2W = (W - m * 2) * 0.28
  const col3X = m + col1W + col2W

  line(pdf, m + col1W, tbY, m + col1W, H - m, 0.3)
  line(pdf, col3X, tbY, col3X, H - m, 0.3)

  // ── Left: company, client, project, venue ──────────────────────────────────
  let ty = tbY + 6
  pdf.setFont('helvetica', BOLD); pdf.setFontSize(10)
  rgb(pdf, C.ink, 'text')
  pdf.text(fit(pdf, project.info.companyName || 'Prae Plot', col1W - 6), m + 3, ty)

  if (project.info.clientName) {
    ty += 4.5
    pdf.setFont('helvetica', NORMAL); pdf.setFontSize(6.5)
    rgb(pdf, C.light, 'text')
    pdf.text('CLIENT', m + 3, ty)
    ty += 3.2
    rgb(pdf, C.mid, 'text'); pdf.setFontSize(8)
    pdf.text(fit(pdf, project.info.clientName, col1W - 6), m + 3, ty)
  }

  ty += 4
  line(pdf, m, ty, m + col1W, ty, 0.15)
  ty += 4.5

  pdf.setFont('helvetica', BOLD); pdf.setFontSize(11)
  rgb(pdf, C.ink, 'text')
  pdf.text(fit(pdf, project.info.name, col1W - 6), m + 3, ty)
  ty += 4.5

  pdf.setFont('helvetica', NORMAL); pdf.setFontSize(8.5)
  rgb(pdf, C.blue, 'text')
  pdf.text(fit(pdf, subtitle, col1W - 6), m + 3, ty)
  ty += 4

  line(pdf, m, ty, m + col1W, ty, 0.15)
  ty += 4

  pdf.setFont('helvetica', NORMAL); pdf.setFontSize(6.5)
  rgb(pdf, C.light, 'text'); pdf.text('VENUE', m + 3, ty)
  ty += 3.2
  rgb(pdf, C.mid, 'text'); pdf.setFontSize(8)
  const venue = `${project.info.venue}${project.info.venueAddress ? ' — ' + project.info.venueAddress : ''}`
  pdf.text(fit(pdf, venue || '—', col1W - 6), m + 3, ty)

  // ── Middle: responsibilities ───────────────────────────────────────────────
  const mx = m + col1W + 3
  const fields: [string, string][] = [
    ['LIGHTING DESIGNER', project.info.lightingDesigner],
    ['TECHNICAL DIRECTOR', project.info.technicalDirector],
    ['DRAWING AUTHOR', project.info.drawingAuthor],
    ['PROJECT DATE', project.info.projectDate],
  ]
  let my = tbY + 6
  for (const [label, value] of fields) {
    pdf.setFont('helvetica', NORMAL); pdf.setFontSize(6)
    rgb(pdf, C.light, 'text')
    pdf.text(label, mx, my)
    my += 3
    pdf.setFont('helvetica', BOLD); pdf.setFontSize(8)
    rgb(pdf, C.ink, 'text')
    pdf.text(fit(pdf, value || '—', col2W - 6), mx, my)
    my += 4.5
    line(pdf, m + col1W, my - 1.2, col3X, my - 1.2, 0.1)
  }

  // ── Right: version, scale, generated stamp, logo ───────────────────────────
  const rx = col3X + 3
  const rightW = W - m - col3X - 6
  let ry = tbY + 6

  pdf.setFont('helvetica', NORMAL); pdf.setFontSize(6)
  rgb(pdf, C.light, 'text')
  pdf.text('VERSION', rx, ry)
  pdf.text('SCALE', rx + rightW * 0.45, ry)
  ry += 4.5
  pdf.setFont('helvetica', BOLD); pdf.setFontSize(13)
  rgb(pdf, C.ink, 'text')
  pdf.text(formatVersion(project.version), rx, ry)
  pdf.setFontSize(extras.scaleLabel && extras.scaleLabel.length > 8 ? 9 : 11)
  pdf.text(extras.scaleLabel ?? 'NTS', rx + rightW * 0.45, ry)
  ry += 3

  line(pdf, col3X, ry, W - m, ry, 0.15)
  ry += 4.5

  if (extras.layerLabel) {
    pdf.setFont('helvetica', NORMAL); pdf.setFontSize(6)
    rgb(pdf, C.light, 'text')
    pdf.text('LAYERS', rx, ry)
    ry += 3.2
    pdf.setFont('helvetica', NORMAL); pdf.setFontSize(7.5)
    rgb(pdf, C.mid, 'text')
    pdf.text(fit(pdf, extras.layerLabel, rightW), rx, ry)
    ry += 4.5
  }

  pdf.setFont('helvetica', NORMAL); pdf.setFontSize(6)
  rgb(pdf, C.light, 'text')
  pdf.text('GENERATED', rx, ry)
  ry += 3.2
  pdf.setFont('helvetica', NORMAL); pdf.setFontSize(7)
  rgb(pdf, C.mid, 'text')
  pdf.text(fit(pdf, new Date().toLocaleString(), rightW), rx, ry)

  if (project.info.companyLogo) {
    try {
      const logoW = 24, logoH = 10
      pdf.addImage(project.info.companyLogo, W - m - logoW - 3, H - m - logoH - 5, logoW, logoH, undefined, 'FAST')
    } catch { /* unusable logo data — the block still prints */ }
  }

  pdf.setFont('helvetica', NORMAL); pdf.setFontSize(6)
  rgb(pdf, C.light, 'text')
  const stamp = pageCount > 1 ? `Page ${page} of ${pageCount}  ·  Generated by Prae Plot` : 'Generated by Prae Plot'
  pdf.text(stamp, W - m - 3, H - m - 2, { align: 'right' })
}

// ── Report scaffolding ────────────────────────────────────────────────────────
// Reports get a compact footer instead of the full architectural title block —
// there is no drawing to frame, and an A4 sheet needs the room for rows.

interface Report {
  pdf: jsPDF
  W: number
  H: number
  y: number
  title: string
  project: Project
  /** Redrawn at the top of every continuation page. */
  repeatHeader?: () => void
}

function startReport(project: Project, title: string): Report {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  setDocProperties(pdf, project, title)

  const r: Report = { pdf, W, H, y: 0, title, project }
  r.y = reportHeader(r)
  return r
}

function reportHeader(r: Report): number {
  const { pdf, W, project, title } = r
  const top = MARGIN + 4

  pdf.setFont('helvetica', BOLD); pdf.setFontSize(14)
  rgb(pdf, C.ink, 'text')
  pdf.text(title.toUpperCase(), MARGIN, top + 8)

  pdf.setFont('helvetica', NORMAL); pdf.setFontSize(8)
  rgb(pdf, C.mid, 'text')
  const meta = [project.info.name, project.info.venue, formatVersion(project.version)].filter(Boolean).join('  ·  ')
  pdf.text(fit(pdf, meta, W - MARGIN * 2), MARGIN, top + 14)

  rgb(pdf, C.blue, 'draw')
  pdf.setLineWidth(0.8)
  pdf.line(MARGIN, top + 17, W - MARGIN, top + 17)
  return top + 22
}

/** Bottom of the usable area on a report page. */
function reportFloor(r: Report): number {
  return r.H - REPORT_FOOTER_H - MARGIN
}

/** Starts a new page when `space` mm would not fit. Returns true if it broke. */
function ensureSpace(r: Report, space: number): boolean {
  if (r.y + space <= reportFloor(r)) return false
  r.pdf.addPage()
  r.y = reportHeader(r)
  r.repeatHeader?.()
  return true
}

function drawReportFooter(r: Report, page: number, pageCount: number) {
  const { pdf, W, H, project } = r
  const y = H - REPORT_FOOTER_H - MARGIN + 4

  rgb(pdf, C.faint, 'draw')
  line(pdf, MARGIN, y, W - MARGIN, y, 0.3)

  pdf.setFont('helvetica', NORMAL); pdf.setFontSize(6.5)
  rgb(pdf, C.light, 'text')
  const left = [
    project.info.companyName,
    project.info.drawingAuthor && `Drawn by ${project.info.drawingAuthor}`,
    project.info.projectDate,
  ].filter(Boolean).join('  ·  ')
  pdf.text(fit(pdf, left || 'Prae Plot', W * 0.6), MARGIN, y + 4.5)

  const right = pageCount > 1 ? `Page ${page} of ${pageCount}  ·  Prae Plot` : 'Generated by Prae Plot'
  pdf.text(right, W - MARGIN, y + 4.5, { align: 'right' })
  pdf.text(new Date().toLocaleString(), W - MARGIN, y + 8, { align: 'right' })
}

function finishReport(r: Report, kind: string): BuiltPdf {
  const count = r.pdf.getNumberOfPages()
  for (let p = 1; p <= count; p++) {
    r.pdf.setPage(p)
    drawReportFooter(r, p, count)
  }
  return { doc: r.pdf, filename: filenameFor(r.project, kind) }
}

function emptyNote(r: Report, text: string) {
  rgb(r.pdf, C.light, 'text')
  r.pdf.setFont('helvetica', NORMAL); r.pdf.setFontSize(9)
  r.pdf.text(text, r.W / 2, r.y + 12, { align: 'center' })
  r.y += 20
}

// ── Table utilities ───────────────────────────────────────────────────────────

interface Col { label: string; w: number; align?: 'left' | 'right' }

/** Gives the flexible column whatever width the fixed ones leave over. */
function fillColumn(cols: Col[], flexIndex: number, totalW: number) {
  const fixed = cols.reduce((s, c, i) => (i === flexIndex ? s : s + c.w), 0)
  cols[flexIndex].w = Math.max(12, totalW - fixed)
}

function tableHeader(pdf: jsPDF, x: number, y: number, cols: Col[], totalW: number) {
  rgb(pdf, C.ink, 'fill')
  pdf.rect(x, y, totalW, 5.5, 'F')
  rgb(pdf, C.white, 'text')
  pdf.setFont('helvetica', BOLD); pdf.setFontSize(6.5)
  let cx = x
  for (const col of cols) {
    if (col.align === 'right') pdf.text(col.label, cx + col.w - 1.5, y + 3.8, { align: 'right' })
    else pdf.text(col.label, cx + 1.5, y + 3.8)
    cx += col.w
  }
  return y + 5.5
}

function tableRow(pdf: jsPDF, x: number, y: number, cells: string[], cols: Col[], even: boolean, totalW: number) {
  if (even) {
    rgb(pdf, C.faint, 'fill')
    pdf.rect(x, y, totalW, ROW_H - 0.5, 'F')
  }
  rgb(pdf, C.ink, 'text')
  pdf.setFont('helvetica', NORMAL); pdf.setFontSize(7)
  let cx = x
  for (let i = 0; i < cells.length && i < cols.length; i++) {
    const text = fit(pdf, cells[i] ?? '', cols[i].w - 3)
    if (cols[i].align === 'right') pdf.text(text, cx + cols[i].w - 1.5, y + 4, { align: 'right' })
    else pdf.text(text, cx + 1.5, y + 4)
    cx += cols[i].w
  }
  return y + ROW_H - 0.5
}

// ── Plot PDF ──────────────────────────────────────────────────────────────────

export interface PlotPage {
  /** Shown in the title block; omit for an all-layers drawing. */
  label?: string
  /** Undefined means every layer. */
  layerIds?: string[]
}

export interface PlotExportRequest {
  options?: Partial<PlotOptions>
  /** One page per entry. Defaults to a single all-layers page. */
  pages?: PlotPage[]
  gridSize?: number
}

/**
 * Builds the lighting plot as a scale-accurate vector drawing — see
 * lib/plotVector.ts for why this is not a canvas screenshot.
 */
export function buildPlotPDF(project: Project, req: PlotExportRequest = {}): BuiltPdf {
  const opts: PlotOptions = { ...DEFAULT_PLOT_OPTIONS, ...req.options }
  const pages: PlotPage[] = req.pages?.length ? req.pages : [{}]
  const { w: W, h: H } = paperDimensions(opts.paper, opts.orientation)

  const pdf = new jsPDF({ orientation: opts.orientation, unit: 'mm', format: [W, H] })
  setDocProperties(pdf, project, 'Lighting Plot')

  const layerName = (id: string) => project.layers.find((l) => l.id === id)?.name ?? id

  // Every page of a set is drawn at one scale from one origin, so the sheets
  // overlay each other the way a layered drawing set is supposed to.
  const sharedBounds = pages.length > 1
    ? contentBounds(selectPlotContent(
        project,
        pages.some((p) => !p.layerIds) ? undefined : [...new Set(pages.flatMap((p) => p.layerIds ?? []))],
        opts.showBackground,
      ))
    : undefined

  pages.forEach((page, i) => {
    if (i > 0) pdf.addPage([W, H], opts.orientation)

    const legendW = opts.showLegend ? Math.min(58, Math.max(40, W * 0.15)) : 0
    const area = {
      x: MARGIN + 3,
      y: MARGIN + 3,
      w: W - MARGIN * 2 - 6,
      h: H - PLOT_TITLE_BLOCK_H - MARGIN - 6,
    }
    const drawing = { ...area, w: area.w - (legendW ? legendW + 5 : 0) }

    const content = selectPlotContent(project, page.layerIds, opts.showBackground)
    const result = drawPlot(pdf, project, content, drawing, opts, req.gridSize ?? 1, sharedBounds)

    if (legendW) {
      // Separator between drawing and key column
      rgb(pdf, C.faint, 'draw')
      line(pdf, area.x + drawing.w + 2.5, area.y, area.x + drawing.w + 2.5, area.y + area.h, 0.2)
      drawLegend(pdf, { x: area.x + drawing.w + 5, y: area.y, w: legendW, h: area.h }, content, result, opts.paper)
    }

    if (result.scale.overflow) {
      rgb(pdf, C.amber, 'fill')
      pdf.roundedRect(drawing.x, drawing.y, 62, 6, 1, 1, 'F')
      rgb(pdf, C.white, 'text')
      pdf.setFont('helvetica', BOLD); pdf.setFontSize(6.5)
      pdf.text('Drawing is clipped at this scale', drawing.x + 2, drawing.y + 4)
    }

    const layerLabel = page.label
      ?? (page.layerIds ? page.layerIds.map(layerName).join(', ') : 'All layers')
    const subtitle = page.label ? `Lighting Plot — ${page.label}` : 'Lighting Plot'

    drawTitleBlock(pdf, project, W, H, subtitle, i + 1, pages.length, {
      scaleLabel: `1:${result.scale.denominator}${result.scale.standard ? '' : '*'}`,
      layerLabel,
    })
  })

  const suffix = pages.length === 1 && pages[0].label ? `Plot_${slug(pages[0].label)}` : 'Plot'
  return { doc: pdf, filename: filenameFor(project, suffix) }
}

// ── Patch PDF ─────────────────────────────────────────────────────────────────

export function buildPatchPDF(project: Project): BuiltPdf {
  const r = startReport(project, 'Patch Sheet')
  const { pdf, W } = r
  const totalW = W - MARGIN * 2

  const cols: Col[] = [
    { label: 'CH', w: 10 },
    { label: 'CIRCUIT', w: 30 },
    { label: 'FIXTURE', w: 0 },
    { label: 'PATCH', w: 20 },
    { label: 'MODE', w: 24 },
    { label: 'CH CNT', w: 14, align: 'right' },
    { label: 'COLOUR', w: 18 },
    { label: 'NOTES', w: 30 },
  ]
  fillColumn(cols, 2, totalW)

  const fixtures = [...project.fixtures].sort((a, b) => a.channel - b.channel)
  if (fixtures.length === 0) {
    emptyNote(r, 'No fixtures placed yet.')
    return finishReport(r, 'Patch')
  }

  r.repeatHeader = () => { r.y = tableHeader(pdf, MARGIN, r.y, cols, totalW) }
  r.y = tableHeader(pdf, MARGIN, r.y, cols, totalW)

  fixtures.forEach((f, idx) => {
    ensureSpace(r, ROW_H)
    r.y = tableRow(pdf, MARGIN, r.y, [
      String(f.channel || '—'),
      formatCircuitRef(project.distros, f.circuitId),
      `${f.manufacturer} ${f.model}`,
      `${f.universe}.${String(f.address).padStart(3, '0')}`,
      f.mode,
      String(f.channelCount || '—'),
      f.color || '—',
      f.notes || '',
    ], cols, idx % 2 === 0, totalW)
  })

  ensureSpace(r, 8)
  r.y += 2
  rgb(pdf, C.faint, 'fill')
  pdf.rect(MARGIN, r.y, totalW, 6, 'F')
  rgb(pdf, C.mid, 'text'); pdf.setFont('helvetica', BOLD); pdf.setFontSize(7)
  const kw = fixtures.reduce((s, f) => s + f.powerRating, 0) / 1000
  const kg = fixtures.reduce((s, f) => s + f.weight, 0)
  pdf.text(`${fixtures.length} fixture${fixtures.length !== 1 ? 's' : ''} · ${kw.toFixed(1)} kW · ${kg.toFixed(1)} kg`, MARGIN + 2, r.y + 4)
  r.y += 8

  return finishReport(r, 'Patch')
}

// ── Equipment PDF ─────────────────────────────────────────────────────────────

export function buildEquipmentPDF(project: Project): BuiltPdf {
  const r = startReport(project, 'Equipment List')
  const { pdf, W } = r
  const totalW = W - MARGIN * 2

  const cols: Col[] = [
    { label: 'QTY', w: 14, align: 'right' },
    { label: 'FIXTURE', w: 0 },
    { label: 'WEIGHT', w: 24, align: 'right' },
    { label: 'POWER', w: 24, align: 'right' },
  ]
  fillColumn(cols, 1, totalW)

  const byModel = new Map<string, { name: string; manufacturer: string; qty: number; weight: number; power: number }>()
  for (const f of project.fixtures) {
    const key = `${f.manufacturer}__${f.model}`
    const entry = byModel.get(key) ?? { name: f.model, manufacturer: f.manufacturer, qty: 0, weight: 0, power: 0 }
    entry.qty += 1
    entry.weight += f.weight
    entry.power += f.powerRating
    byModel.set(key, entry)
  }
  const items = [...byModel.values()].sort((a, b) => b.qty - a.qty)

  if (items.length === 0) {
    emptyNote(r, 'No fixtures placed yet.')
  } else {
    r.repeatHeader = () => { r.y = tableHeader(pdf, MARGIN, r.y, cols, totalW) }
    r.y = tableHeader(pdf, MARGIN, r.y, cols, totalW)
    items.forEach((item, idx) => {
      ensureSpace(r, ROW_H)
      r.y = tableRow(pdf, MARGIN, r.y, [
        String(item.qty),
        `${item.manufacturer}  ${item.name}`,
        `${item.weight.toFixed(1)} kg`,
        `${item.power.toFixed(0)} W`,
      ], cols, idx % 2 === 0, totalW)
    })

    ensureSpace(r, 8)
    r.y += 1
    rgb(pdf, C.ink, 'fill')
    pdf.rect(MARGIN, r.y, totalW, 6, 'F')
    rgb(pdf, C.white, 'text'); pdf.setFont('helvetica', BOLD); pdf.setFontSize(7)
    const tw = project.fixtures.reduce((s, f) => s + f.weight, 0)
    const tp = project.fixtures.reduce((s, f) => s + f.powerRating, 0)
    pdf.text('TOTAL', MARGIN + 2, r.y + 4)
    const wCol = MARGIN + cols[0].w + cols[1].w
    pdf.text(`${tw.toFixed(1)} kg`, wCol + cols[2].w - 1.5, r.y + 4, { align: 'right' })
    pdf.text(`${tp.toFixed(0)} W`, wCol + cols[2].w + cols[3].w - 1.5, r.y + 4, { align: 'right' })
    r.y += 8
  }

  // Devices belong on the equipment list too — they are things that get packed.
  if (project.devices.length > 0) {
    ensureSpace(r, 20)
    r.y += 4
    pdf.setFont('helvetica', BOLD); pdf.setFontSize(8)
    rgb(pdf, C.mid, 'text')
    pdf.text('DEVICES', MARGIN, r.y)
    r.y += 2
    const dCols: Col[] = [
      { label: 'QTY', w: 14, align: 'right' },
      { label: 'DEVICE', w: 0 },
      { label: 'CATEGORY', w: 34 },
      { label: 'POWER', w: 24, align: 'right' },
    ]
    fillColumn(dCols, 1, totalW)
    r.repeatHeader = () => { r.y = tableHeader(pdf, MARGIN, r.y, dCols, totalW) }
    r.y = tableHeader(pdf, MARGIN, r.y, dCols, totalW)
    project.devices.forEach((d, idx) => {
      ensureSpace(r, ROW_H)
      r.y = tableRow(pdf, MARGIN, r.y, [
        '1',
        [d.manufacturer, d.model, d.name].filter(Boolean).join(' ') || d.name,
        d.category,
        d.powerRating ? `${d.powerRating} W` : '—',
      ], dCols, idx % 2 === 0, totalW)
    })
  }

  return finishReport(r, 'Equipment')
}

// ── Cable PDF ─────────────────────────────────────────────────────────────────

const RENTAL_LENGTHS: Record<string, number[]> = {
  power: [1, 2, 5, 10, 20],
  data: [1, 2, 5, 10, 20],
  network: [1, 2, 5, 10, 20, 50],
  audio: [1, 2, 5, 10, 20],
}

function getRentalLengths(type: CableType): number[] {
  if (type.startsWith('power') || type.startsWith('cee') || type === 'iec') return RENTAL_LENGTHS.power
  if (type === 'ethernet' || type === 'cat6' || type === 'fibre') return RENTAL_LENGTHS.network
  if (type.startsWith('dmx')) return RENTAL_LENGTHS.data
  return RENTAL_LENGTHS.audio
}

/**
 * Stock lengths needed for ONE run. A single cable is used when a stock length
 * covers the run; otherwise runs are made up from the longest stock length plus
 * one that covers the remainder. Packing the *sum* of all runs (as this used to
 * do) under-counts badly — three 6 m runs need three cables, not 18 m of them.
 */
function packRun(needM: number, available: number[]): Record<number, number> {
  const asc = [...available].sort((a, b) => a - b)
  if (asc.length === 0 || needM <= 0) return {}
  const result: Record<number, number> = {}
  const single = asc.find((l) => l >= needM)
  if (single) return { [single]: 1 }

  const longest = asc[asc.length - 1]
  let rem = needM
  while (rem > longest) {
    result[longest] = (result[longest] ?? 0) + 1
    rem -= longest
  }
  const last = asc.find((l) => l >= rem) ?? longest
  result[last] = (result[last] ?? 0) + 1
  return result
}

function resolveName(id: string | undefined, project: Project): string {
  if (!id) return '—'
  const fx = project.fixtures.find((f) => f.id === id)
  if (fx) return `CH${fx.channel} ${fx.shortName || fx.model}`
  const dx = project.distros.find((d) => d.id === id)
  if (dx) return dx.ref ? `[${dx.ref}] ${dx.name}` : dx.name
  const dv = project.devices.find((d) => d.id === id)
  if (dv) return dv.name
  return '—'
}

const CABLE_OVERHEAD = 0.20 // 20% slack on drawn lengths

export function buildCablePDF(project: Project): BuiltPdf {
  const r = startReport(project, 'Cable Schedule')
  const { pdf, W } = r
  const totalW = W - MARGIN * 2

  const cables = project.elements.filter((e) => e.type === 'cable') as CableElement[]
  if (cables.length === 0) {
    emptyNote(r, 'No cable runs drawn.')
    return finishReport(r, 'Cables')
  }

  const byType = new Map<CableType, CableElement[]>()
  for (const c of cables) {
    const list = byType.get(c.cableType) ?? []
    list.push(c)
    byType.set(c.cableType, list)
  }

  const runCols: Col[] = [
    { label: '#', w: 9, align: 'right' },
    { label: 'LABEL', w: 16 },
    { label: 'FROM', w: 0 },
    { label: 'TO', w: 40 },
    { label: 'DRAWN', w: 20, align: 'right' },
    { label: '+20%', w: 20, align: 'right' },
  ]
  fillColumn(runCols, 2, totalW)

  let runIdx = 1
  for (const [type, runs] of byType) {
    ensureSpace(r, 30)

    const hex = CABLE_COLORS[type] ?? '#9ca3af'
    pdf.setFillColor(hex)
    pdf.rect(MARGIN, r.y, 3, 5.5, 'F')
    rgb(pdf, C.faint, 'fill')
    pdf.rect(MARGIN + 3, r.y, totalW - 3, 5.5, 'F')
    rgb(pdf, C.ink, 'text'); pdf.setFont('helvetica', BOLD); pdf.setFontSize(7.5)
    pdf.text(CABLE_LABELS[type] ?? type, MARGIN + 6, r.y + 3.8)

    const typeTotal = runs.reduce((s, c) => s + cableLength(c) * (1 + CABLE_OVERHEAD), 0)
    rgb(pdf, C.mid, 'text'); pdf.setFont('helvetica', NORMAL); pdf.setFontSize(7)
    pdf.text(`${runs.length} run${runs.length !== 1 ? 's' : ''}  ·  ${typeTotal.toFixed(1)} m total`, W - MARGIN - 2, r.y + 3.8, { align: 'right' })
    r.y += 5.5

    r.repeatHeader = () => { r.y = tableHeader(pdf, MARGIN, r.y, runCols, totalW) }
    r.y = tableHeader(pdf, MARGIN, r.y, runCols, totalW)

    const available = getRentalLengths(type)
    const breakdown: Record<number, number> = {}

    runs.forEach((c, i) => {
      ensureSpace(r, ROW_H)
      const plotM = cableLength(c)
      const withOH = plotM * (1 + CABLE_OVERHEAD)
      for (const [len, qty] of Object.entries(packRun(withOH, available))) {
        breakdown[Number(len)] = (breakdown[Number(len)] ?? 0) + qty
      }
      r.y = tableRow(pdf, MARGIN, r.y, [
        String(runIdx++),
        c.autoLabel ?? '—',
        resolveName(c.startConnectedTo, project),
        resolveName(c.endConnectedTo, project),
        `${plotM.toFixed(1)} m`,
        `${withOH.toFixed(1)} m`,
      ], runCols, i % 2 === 0, totalW)
    })

    // Stock lengths to pull from the store
    const lengths = available.filter((l) => breakdown[l])
    ensureSpace(r, 20)
    r.y += 3
    rgb(pdf, C.light, 'text'); pdf.setFont('helvetica', BOLD); pdf.setFontSize(6.5)
    pdf.text('CABLES TO PULL (per run, incl. 20% slack)', MARGIN, r.y + 3)
    r.y += 5

    lengths.forEach((len, i) => {
      const qty = breakdown[len]
      const bx = MARGIN + (i % 6) * 30
      const by = r.y + Math.floor(i / 6) * 11
      rgb(pdf, C.bluePale, 'fill')
      pdf.roundedRect(bx, by, 27, 9, 1, 1, 'F')
      rgb(pdf, C.blue, 'text'); pdf.setFont('helvetica', BOLD); pdf.setFontSize(9)
      pdf.text(`${qty}×`, bx + 2, by + 6)
      rgb(pdf, C.ink, 'text'); pdf.setFont('helvetica', NORMAL); pdf.setFontSize(8)
      pdf.text(`${len} m`, bx + 11, by + 6)
    })
    r.y += Math.ceil(Math.max(1, lengths.length) / 6) * 11 + 4
  }

  return finishReport(r, 'Cables')
}

// ── Power PDF ─────────────────────────────────────────────────────────────────

const NOMINAL_VOLTAGE = 230

export function buildPowerPDF(project: Project): BuiltPdf {
  const r = startReport(project, 'Power Report')
  const { pdf, W } = r
  const totalW = W - MARGIN * 2
  const kw = (w: number) => `${(w / 1000).toFixed(2)} kW`

  const { distros, fixtures, elements } = project
  const totalFixturePower = fixtures.reduce((s, f) => s + f.powerRating, 0)
  const totalCapacity = distros.reduce((s, d) => s + d.incomingRating * d.phases * NOMINAL_VOLTAGE, 0)
  const totalAssigned = distros.reduce((s, d) => s + computeDistroLoad(d, distros, fixtures, elements, new Set()), 0)
  const unassigned = fixtures.filter((f) => !f.circuitId).length

  const kpiBoxW = (totalW - 6) / 4
  const kpis = [
    { label: 'FIXTURE LOAD', value: kw(totalFixturePower), sub: `${fixtures.length} fixtures` },
    { label: 'DISTRO CAPACITY', value: kw(totalCapacity), sub: `${distros.length} distros` },
    { label: 'ASSIGNED LOAD', value: kw(totalAssigned), sub: totalCapacity > 0 ? `${Math.round(totalAssigned / totalCapacity * 100)}% of capacity` : '—' },
    { label: 'UNASSIGNED', value: String(unassigned), sub: unassigned > 0 ? 'fixtures need a circuit' : 'all assigned' },
  ]
  kpis.forEach((k, i) => {
    const bx = MARGIN + i * (kpiBoxW + 2)
    rgb(pdf, C.faint, 'fill')
    pdf.roundedRect(bx, r.y, kpiBoxW, 17, 1, 1, 'F')
    pdf.setFont('helvetica', NORMAL); pdf.setFontSize(5.5)
    rgb(pdf, C.light, 'text')
    pdf.text(k.label, bx + 2.5, r.y + 4.5)
    pdf.setFont('helvetica', BOLD); pdf.setFontSize(9.5)
    rgb(pdf, C.ink, 'text')
    pdf.text(fit(pdf, k.value, kpiBoxW - 5), bx + 2.5, r.y + 10.5)
    pdf.setFont('helvetica', NORMAL); pdf.setFontSize(6)
    rgb(pdf, C.mid, 'text')
    pdf.text(fit(pdf, k.sub, kpiBoxW - 5), bx + 2.5, r.y + 14.5)
  })
  r.y += 22

  if (distros.length === 0) {
    emptyNote(r, 'No power distribution added.')
    return finishReport(r, 'Power')
  }

  for (const distro of distros) {
    ensureSpace(r, 45)

    const totalLoad = computeDistroLoad(distro, distros, fixtures, elements, new Set())
    const directLoad = distro.circuits.reduce((s, c) => s + computeCircuitLoad(fixtures, c.id), 0)
    const downstreamLoad = totalLoad - directLoad
    const capacity = distro.incomingRating * distro.phases * NOMINAL_VOLTAGE
    const pct = capacity > 0 ? Math.round(totalLoad / capacity * 100) : 0

    rgb(pdf, C.ink, 'fill')
    pdf.rect(MARGIN, r.y, totalW, 11, 'F')
    rgb(pdf, C.white, 'text')
    pdf.setFont('helvetica', BOLD); pdf.setFontSize(9)
    pdf.text(distro.ref ? `[${distro.ref}]  ${distro.name}` : distro.name, MARGIN + 3, r.y + 5)
    const pctColor: RGB = pct > 90 ? [252, 165, 165] : pct > 70 ? [253, 230, 138] : [134, 239, 172]
    rgb(pdf, pctColor, 'text')
    pdf.text(`${kw(totalLoad)}  ·  ${pct}%`, W - MARGIN - 3, r.y + 5, { align: 'right' })
    rgb(pdf, [156, 163, 175], 'text')
    pdf.setFont('helvetica', NORMAL); pdf.setFontSize(6.5)
    pdf.text(`${distro.incomingRating}A · ${distro.phases}Ø · ${distro.circuits.length} circuits`, MARGIN + 3, r.y + 9)
    pdf.text(
      downstreamLoad > 0
        ? `${kw(directLoad)} direct + ${kw(downstreamLoad)} downstream  ·  capacity ${kw(capacity)}`
        : `${kw(directLoad)} direct  ·  capacity ${kw(capacity)}`,
      W - MARGIN - 3, r.y + 9, { align: 'right' },
    )
    r.y += 11

    rgb(pdf, C.faint, 'fill')
    pdf.rect(MARGIN, r.y, totalW, 4, 'F')
    rgb(pdf, pct > 90 ? C.red : pct > 70 ? C.amber : C.green, 'fill')
    pdf.rect(MARGIN, r.y, totalW * Math.min(pct, 100) / 100, 4, 'F')
    r.y += 6

    if (distro.phases === 3) {
      const byPhase = [1, 2, 3].map((ph) => {
        const circs = distro.circuits.filter((c) => c.phase === ph)
        return {
          ph,
          load: circs.reduce((s, c) => s + computeCircuitLoad(fixtures, c.id), 0),
          cap: circs.reduce((s, c) => s + circuitCapacityW(c), 0),
        }
      })
      const maxLoad = Math.max(...byPhase.map((b) => b.load), 1)
      const imbalance = (maxLoad - Math.min(...byPhase.map((b) => b.load))) / maxLoad * 100

      const phW = (totalW - 4) / 3
      const phColors: RGB[] = [[180, 140, 40], [50, 130, 200], [140, 60, 200]]
      byPhase.forEach(({ ph, load, cap }, i) => {
        const bx = MARGIN + i * (phW + 2)
        rgb(pdf, C.faint, 'fill')
        pdf.roundedRect(bx, r.y, phW, 12, 1, 1, 'F')
        rgb(pdf, phColors[i], 'text')
        pdf.setFont('helvetica', BOLD); pdf.setFontSize(7)
        pdf.text(`L${ph}`, bx + 2.5, r.y + 5)
        rgb(pdf, C.ink, 'text')
        pdf.setFont('helvetica', NORMAL); pdf.setFontSize(6.5)
        pdf.text(kw(load), bx + 10, r.y + 5)
        rgb(pdf, C.light, 'text'); pdf.setFontSize(5.5)
        pdf.text(`${kw(cap)} cap · ${cap > 0 ? Math.round(load / cap * 100) : 0}%`, bx + 2.5, r.y + 9.5)
      })
      r.y += 14
      if (imbalance > 15) {
        rgb(pdf, C.amber, 'text'); pdf.setFont('helvetica', NORMAL); pdf.setFontSize(6.5)
        pdf.text(`! Phase imbalance: ${imbalance.toFixed(0)}% — consider re-balancing circuits`, MARGIN + 2, r.y + 4)
        r.y += 7
      }
    }

    const hasPhase = distro.phases === 3
    const cCols: Col[] = hasPhase
      ? [{ label: 'CIRCUIT', w: 20 }, { label: 'PH', w: 11 }, { label: 'FIXTURES', w: 0 }, { label: 'LOAD', w: 22, align: 'right' }, { label: 'RATING', w: 18, align: 'right' }, { label: 'FREE', w: 20, align: 'right' }]
      : [{ label: 'CIRCUIT', w: 20 }, { label: 'FIXTURES', w: 0 }, { label: 'LOAD', w: 22, align: 'right' }, { label: 'RATING', w: 18, align: 'right' }, { label: 'FREE', w: 20, align: 'right' }]
    const flex = hasPhase ? 2 : 1
    fillColumn(cCols, flex, totalW)

    r.repeatHeader = () => { r.y = tableHeader(pdf, MARGIN, r.y, cCols, totalW) }
    r.y = tableHeader(pdf, MARGIN, r.y, cCols, totalW)

    distro.circuits.forEach((c, i) => {
      ensureSpace(r, ROW_H)
      const load = computeCircuitLoad(fixtures, c.id)
      const cap = circuitCapacityW(c)
      const fxStr = fixtures.filter((f) => f.circuitId === c.id).map((f) => `CH${f.channel}`).join(' ') || '—'
      const ref = distro.ref ? `${distro.ref}·${i + 1}` : c.name
      const free = cap - load
      const cells = [ref, ...(hasPhase ? [`L${c.phase}`] : []), fxStr,
        load > 0 ? `${load.toFixed(0)} W` : '—', `${c.rating}A`,
        free < 0 ? `${free.toFixed(0)} W OVER` : `${free.toFixed(0)} W`]
      const rowTop = r.y
      r.y = tableRow(pdf, MARGIN, r.y, cells, cCols, i % 2 === 0, totalW)
      if (free < 0) {
        // Re-print the headroom cell in red: an overloaded circuit must shout.
        const freeCol = cCols[cCols.length - 1]
        rgb(pdf, C.red, 'fill')
        pdf.rect(MARGIN + totalW - freeCol.w, rowTop, freeCol.w, ROW_H - 0.5, 'F')
        rgb(pdf, C.white, 'text'); pdf.setFont('helvetica', BOLD); pdf.setFontSize(6.5)
        pdf.text(`${free.toFixed(0)} W OVER`, MARGIN + totalW - 1.5, rowTop + 4, { align: 'right' })
      }
    })

    ensureSpace(r, 10)
    rgb(pdf, C.faint, 'fill')
    pdf.rect(MARGIN, r.y, totalW, 6, 'F')
    rgb(pdf, C.mid, 'text'); pdf.setFont('helvetica', BOLD); pdf.setFontSize(6.5)
    pdf.text(`TOTAL  ${kw(directLoad)}  ·  capacity ${kw(capacity)}  ·  headroom ${kw(capacity - directLoad)}`, MARGIN + 3, r.y + 4)
    r.y += 10
    r.repeatHeader = undefined
  }

  return finishReport(r, 'Power')
}

// ── Groups PDF ────────────────────────────────────────────────────────────────

export function buildGroupsPDF(project: Project): BuiltPdf {
  const r = startReport(project, 'Groups')
  const { pdf, W } = r
  const totalW = W - MARGIN * 2
  const { groups, fixtures } = project

  if (groups.length === 0) {
    emptyNote(r, 'No groups defined.')
    return finishReport(r, 'Groups')
  }

  const cols: Col[] = [
    { label: 'CH', w: 12 },
    { label: 'FIXTURE', w: 0 },
    { label: 'PATCH', w: 22 },
    { label: 'POWER', w: 22, align: 'right' },
    { label: 'WEIGHT', w: 22, align: 'right' },
  ]
  fillColumn(cols, 1, totalW)

  for (const g of groups) {
    const members = fixtures.filter((f) => g.fixtureIds.includes(f.id)).sort((a, b) => a.channel - b.channel)
    const totalPow = members.reduce((s, f) => s + f.powerRating, 0)
    const totalWt = members.reduce((s, f) => s + f.weight, 0)

    ensureSpace(r, 28)

    pdf.setFillColor(g.color || '#6b7280')
    pdf.rect(MARGIN, r.y, 4, 10, 'F')
    rgb(pdf, C.faint, 'fill')
    pdf.rect(MARGIN + 4, r.y, totalW - 4, 10, 'F')
    rgb(pdf, C.ink, 'text')
    pdf.setFont('helvetica', BOLD); pdf.setFontSize(9)
    pdf.text(fit(pdf, g.name, totalW * 0.5), MARGIN + 8, r.y + 5.5)
    pdf.setFont('helvetica', NORMAL); pdf.setFontSize(7)
    rgb(pdf, C.mid, 'text')
    pdf.text(
      `${members.length} fixture${members.length !== 1 ? 's' : ''}  ·  ${(totalPow / 1000).toFixed(2)} kW  ·  ${totalWt.toFixed(1)} kg`,
      W - MARGIN - 3, r.y + 5.5, { align: 'right' },
    )
    r.y += 10

    if (members.length === 0) {
      rgb(pdf, C.light, 'text'); pdf.setFont('helvetica', NORMAL); pdf.setFontSize(7)
      pdf.text('No fixtures in this group.', MARGIN + 3, r.y + 4)
      r.y += 8
      continue
    }

    r.repeatHeader = () => { r.y = tableHeader(pdf, MARGIN, r.y, cols, totalW) }
    r.y = tableHeader(pdf, MARGIN, r.y, cols, totalW)
    members.forEach((f, i) => {
      ensureSpace(r, ROW_H)
      r.y = tableRow(pdf, MARGIN, r.y, [
        String(f.channel),
        `${f.manufacturer}  ${f.model}`,
        `${f.universe}.${String(f.address).padStart(3, '0')}`,
        `${f.powerRating.toFixed(0)} W`,
        `${f.weight.toFixed(1)} kg`,
      ], cols, i % 2 === 0, totalW)
    })
    r.repeatHeader = undefined
    r.y += 4
  }

  return finishReport(r, 'Groups')
}

// ── Convenience wrappers ──────────────────────────────────────────────────────

export function exportPlotPDF(project: Project, req?: PlotExportRequest) { savePdf(buildPlotPDF(project, req)) }
export function exportPatchPDF(project: Project) { savePdf(buildPatchPDF(project)) }
export function exportEquipmentPDF(project: Project) { savePdf(buildEquipmentPDF(project)) }
export function exportCablePDF(project: Project) { savePdf(buildCablePDF(project)) }
export function exportPowerPDF(project: Project) { savePdf(buildPowerPDF(project)) }
export function exportGroupsPDF(project: Project) { savePdf(buildGroupsPDF(project)) }
