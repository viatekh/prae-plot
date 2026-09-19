import jsPDF from 'jspdf'
import type { Project, CableElement, CableType } from '../types'
import { CABLE_COLORS, CABLE_LABELS, isFreeform } from '../types'
import { formatVersion, cableLength } from './utils'
import {
  DEFAULT_PLOT_OPTIONS, PAPER_LABELS, PEN, contentBounds, drawCaption, drawLegend, drawPlot,
  drawText, paperDimensions, selectPlotContent,
} from './plotVector'
import type { PlotOptions } from './plotVector'
import { formatCircuitRef, computeDistroLoad, computeCircuitLoad, circuitCapacityW } from '../store/projectStore'

// ── Constants ─────────────────────────────────────────────────────────────────

const MARGIN = 14          // mm — report page margin
const REPORT_FOOTER_H = 15 // mm — the strip under a report
const ROW_H = 5.6          // mm — schedule row height

const BOLD = 'bold' as const

// Colour palette — architectural drawing look
const C = {
  ink:       [17, 24, 39] as RGB,    // drawing black
  mid:       [88, 97, 112] as RGB,
  light:     [150, 158, 172] as RGB,
  faint:     [226, 231, 238] as RGB,
  zebra:     [247, 249, 251] as RGB, // schedule row banding
  white:     [255, 255, 255] as RGB,
  blue:      [29, 78, 216] as RGB,   // the single accent
  bluePale:  [239, 246, 255] as RGB,
  red:       [190, 30, 45] as RGB,
  amber:     [180, 100, 10] as RGB,
  green:     [22, 140, 78] as RGB,
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

/** "network-switch" → "Network Switch" */
function titleCase(slugged: string): string {
  return slugged.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
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

// ── Sheet frame ───────────────────────────────────────────────────────────────
// Drawings get the full treatment: a trim border, a zone-reference gutter and
// an inner frame. It is what makes a sheet readable when it is rolled out on a
// production desk and someone says "the dimmer in C3".

const TRIM = 8        // outer trim border, mm from the paper edge
const ZONE_GUTTER = 5 // where the zone letters and numbers live
const FRAME = TRIM + ZONE_GUTTER

function drawSheetFrame(pdf: jsPDF, W: number, H: number) {
  rgb(pdf, C.ink, 'draw')

  // Trim border
  pdf.setLineWidth(PEN.border)
  pdf.rect(TRIM, TRIM, W - TRIM * 2, H - TRIM * 2, 'S')

  // Inner frame
  pdf.setLineWidth(PEN.frame)
  pdf.rect(FRAME, FRAME, W - FRAME * 2, H - FRAME * 2, 'S')

  const innerW = W - FRAME * 2
  const innerH = H - FRAME * 2
  const colCount = Math.max(2, Math.round(innerW / 70))
  const rowCount = Math.max(2, Math.round(innerH / 70))
  const colW = innerW / colCount
  const rowH = innerH / rowCount

  pdf.setLineWidth(PEN.hair)
  for (let i = 0; i < colCount; i++) {
    const cx = FRAME + colW * (i + 0.5)
    const letter = String.fromCharCode(65 + i)
    drawText(pdf, letter, cx, TRIM + ZONE_GUTTER - 1.4, { size: 5, bold: true, align: 'center', color: C.mid })
    drawText(pdf, letter, cx, H - TRIM - 1.6, { size: 5, bold: true, align: 'center', color: C.mid })
    if (i > 0) {
      const x = FRAME + colW * i
      pdf.line(x, TRIM, x, FRAME)
      pdf.line(x, H - FRAME, x, H - TRIM)
    }
  }
  for (let i = 0; i < rowCount; i++) {
    const cy = FRAME + rowH * (i + 0.5) + 1.6
    const num = String(i + 1)
    drawText(pdf, num, TRIM + ZONE_GUTTER / 2, cy, { size: 5, bold: true, align: 'center', color: C.mid })
    drawText(pdf, num, W - TRIM - ZONE_GUTTER / 2, cy, { size: 5, bold: true, align: 'center', color: C.mid })
    if (i > 0) {
      const y = FRAME + rowH * i
      pdf.line(TRIM, y, FRAME, y)
      pdf.line(W - FRAME, y, W - TRIM, y)
    }
  }
}

// ── Title block ───────────────────────────────────────────────────────────────

const TITLE_BLOCK_H = 38 // mm, measured from the inner frame

interface TitleBlockData {
  subtitle: string
  scaleLabel: string
  paperLabel: string
  sheetRef: string
  layerLabel?: string
  page: number
  pageCount: number
}

/** One captioned cell of the title block. */
function cell(
  pdf: jsPDF, x: number, y: number, w: number, caption: string, value: string,
  opts: { size?: number; color?: RGB; bold?: boolean } = {},
) {
  drawCaption(pdf, caption, x + 2, y + 3.2, { size: 4.3 })
  drawText(pdf, value || '—', x + 2, y + 3.2 + (opts.size ?? 8) * 0.48 + 1.4, {
    size: opts.size ?? 8,
    bold: opts.bold ?? true,
    color: opts.color ?? C.ink,
    maxW: w - 4,
  })
}

function drawTitleBlock(pdf: jsPDF, project: Project, W: number, H: number, d: TitleBlockData) {
  const left = FRAME
  const right = W - FRAME
  const top = H - FRAME - TITLE_BLOCK_H
  const bottom = H - FRAME
  const width = right - left

  // Block outline, heavier than the cell rules inside it
  rgb(pdf, C.ink, 'draw')
  pdf.setLineWidth(PEN.frame)
  pdf.line(left, top, right, top)

  const c1 = left + width * 0.42
  const c2 = c1 + width * 0.30
  pdf.line(c1, top, c1, bottom)
  pdf.line(c2, top, c2, bottom)

  // ── Column 1: what this drawing is ─────────────────────────────────────────
  let y = top
  const c1w = c1 - left

  // Company mark sits top-right of the identity column
  if (project.info.companyLogo) {
    try {
      pdf.addImage(project.info.companyLogo, c1 - 27, top + 2, 25, 9, undefined, 'FAST')
    } catch { /* unusable logo data — the block still prints */ }
  }
  cell(pdf, left, y, project.info.companyLogo ? c1w - 29 : c1w, 'Project', project.info.name, { size: 11 })
  y += 12
  rgb(pdf, C.faint, 'draw'); pdf.setLineWidth(PEN.hair); pdf.line(left, y, c1, y)

  cell(pdf, left, y, c1w, 'Drawing', d.subtitle, { size: 8.5, color: C.blue })
  y += 9.5
  rgb(pdf, C.faint, 'draw'); pdf.setLineWidth(PEN.hair); pdf.line(left, y, c1, y)

  const venue = [project.info.venue, project.info.venueAddress].filter(Boolean).join(' — ')
  cell(pdf, left, y, c1w * 0.62, 'Venue', venue, { size: 7.5 })
  cell(pdf, left + c1w * 0.62, y, c1w * 0.38, 'Client', project.info.clientName ?? project.info.companyName, { size: 7.5 })

  // ── Column 2: who is responsible ───────────────────────────────────────────
  const c2w = c2 - c1
  const half = c2w / 2
  const fields: [string, string][] = [
    ['Lighting designer', project.info.lightingDesigner],
    ['Technical director', project.info.technicalDirector],
    ['Drawn by', project.info.drawingAuthor],
    ['Project date', project.info.projectDate],
  ]
  const rowH = TITLE_BLOCK_H / 2
  fields.forEach(([caption, value], i) => {
    const cx = c1 + (i % 2) * half
    const cy = top + Math.floor(i / 2) * rowH
    cell(pdf, cx, cy, half, caption, value, { size: 8 })
  })
  rgb(pdf, C.faint, 'draw'); pdf.setLineWidth(PEN.hair)
  pdf.line(c1, top + rowH, c2, top + rowH)
  pdf.line(c1 + half, top, c1 + half, bottom)

  // ── Column 3: sheet data ───────────────────────────────────────────────────
  const c3w = right - c2
  const c3half = c3w / 2
  const r3 = TITLE_BLOCK_H / 3
  const sheetFields: [string, string, number][] = [
    ['Scale', d.scaleLabel, 10],
    ['Paper', d.paperLabel, 10],
    ['Drawing no.', d.sheetRef, 9],
    ['Revision', formatVersion(project.version), 9],
    ['Sheet', d.pageCount > 1 ? `${d.page} of ${d.pageCount}` : '1 of 1', 8],
    ['Layers', d.layerLabel ?? 'All', 7],
  ]
  sheetFields.forEach(([caption, value, size], i) => {
    const cx = c2 + (i % 2) * c3half
    const cy = top + Math.floor(i / 2) * r3
    cell(pdf, cx, cy, c3half, caption, value, { size })
  })
  rgb(pdf, C.faint, 'draw'); pdf.setLineWidth(PEN.hair)
  pdf.line(c2, top + r3, right, top + r3)
  pdf.line(c2, top + r3 * 2, right, top + r3 * 2)
  pdf.line(c2 + c3half, top, c2 + c3half, bottom)

  // Issue stamp along the bottom of the identity column
  drawText(pdf, `Issued ${new Date().toLocaleString()} · Prae Plot`, left + 2, bottom - 1.6, {
    size: 4.2, color: C.light,
  })
}

// ── Report scaffolding ────────────────────────────────────────────────────────
// Paperwork is set like a technical schedule: tracked caps for headings, rules
// instead of filled bars, numerics right-aligned, and the same header and
// footer on every sheet.

interface Report {
  pdf: jsPDF
  W: number
  H: number
  y: number
  title: string
  sheetRef: string
  project: Project
  /** Redrawn at the top of every continuation page. */
  repeatHeader?: () => void
}

function startReport(project: Project, title: string, sheetRef: string): Report {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  setDocProperties(pdf, project, title)

  const r: Report = { pdf, W, H, y: 0, title, sheetRef, project }
  r.y = reportHeader(r)
  return r
}

function reportHeader(r: Report): number {
  const { pdf, W, project, title } = r
  const x = MARGIN
  const w = W - MARGIN * 2
  let y = MARGIN + 6

  drawText(pdf, title.toUpperCase(), x, y, { size: 13, bold: true, spacing: 0.5, color: C.ink })
  drawText(pdf, 'PRAE PLOT', W - MARGIN, y, { size: 5, spacing: 0.9, color: C.light, align: 'right' })
  y += 2.4

  rgb(pdf, C.ink, 'draw')
  pdf.setLineWidth(PEN.frame)
  pdf.line(x, y, x + w, y)
  y += 4.5

  // Meta strip: four captioned facts across the page
  const meta: [string, string][] = [
    ['Project', project.info.name],
    ['Venue', project.info.venue],
    ['Version', formatVersion(project.version)],
    ['Date', project.info.projectDate || formatDate()],
  ]
  const colW = [w * 0.38, w * 0.3, w * 0.14, w * 0.18]
  let cx = x
  meta.forEach(([caption, value], i) => {
    drawCaption(pdf, caption, cx, y, { size: 4.2 })
    drawText(pdf, value || '—', cx, y + 4.2, { size: 8, bold: true, maxW: colW[i] - 3 })
    cx += colW[i]
  })
  y += 6.5

  rgb(pdf, C.faint, 'draw')
  pdf.setLineWidth(PEN.hair)
  pdf.line(x, y, x + w, y)
  return y + 6
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
  pdf.setLineWidth(PEN.hair)
  pdf.line(MARGIN, y, W - MARGIN, y)

  const left = [
    project.info.companyName,
    project.info.drawingAuthor && `Drawn by ${project.info.drawingAuthor}`,
    project.info.venue,
  ].filter(Boolean).join('   ·   ')
  drawText(pdf, left || 'Prae Plot', MARGIN, y + 4.4, { size: 5.5, color: C.light, maxW: W * 0.55 })

  drawText(pdf, `${r.sheetRef}   ·   SHEET ${page} OF ${pageCount}`, W - MARGIN, y + 4.4, {
    size: 5.5, spacing: 0.3, color: C.mid, align: 'right', bold: true,
  })
  drawText(pdf, `Generated ${new Date().toLocaleString()}`, W - MARGIN, y + 8.2, {
    size: 5, color: C.light, align: 'right',
  })
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
  drawText(r.pdf, text, r.W / 2, r.y + 12, { size: 8.5, color: C.light, align: 'center' })
  r.y += 20
}

/** Section rule: tracked caps with an optional colour chip, over a rule. */
function sectionHeading(r: Report, text: string, right?: string, chip?: string) {
  const { pdf, W } = r
  const x = MARGIN
  const w = W - MARGIN * 2
  if (chip) {
    pdf.setFillColor(chip)
    pdf.rect(x, r.y - 2.6, 2.2, 3.4, 'F')
  }
  drawText(pdf, text.toUpperCase(), x + (chip ? 4.5 : 0), r.y, { size: 7.5, bold: true, spacing: 0.35 })
  if (right) drawText(pdf, right, x + w, r.y, { size: 6.5, color: C.mid, align: 'right' })
  r.y += 1.8
  rgb(pdf, C.mid, 'draw')
  pdf.setLineWidth(PEN.archLight)
  pdf.line(x, r.y, x + w, r.y)
  r.y += 4.5
}

// ── Table utilities ───────────────────────────────────────────────────────────

interface Col { label: string; w: number; align?: 'left' | 'right' }

/** Gives the flexible column whatever width the fixed ones leave over. */
function fillColumn(cols: Col[], flexIndex: number, totalW: number) {
  const fixed = cols.reduce((s, c, i) => (i === flexIndex ? s : s + c.w), 0)
  cols[flexIndex].w = Math.max(12, totalW - fixed)
}

function tableHeader(pdf: jsPDF, x: number, y: number, cols: Col[], totalW: number) {
  rgb(pdf, C.ink, 'draw')
  pdf.setLineWidth(PEN.archLight)
  pdf.line(x, y, x + totalW, y)

  let cx = x
  for (const col of cols) {
    const right = col.align === 'right'
    drawCaption(pdf, col.label, right ? cx + col.w - 1.5 : cx + 1.5, y + 3.6, {
      size: 4.6, color: C.mid, align: right ? 'right' : 'left',
    })
    cx += col.w
  }
  y += 5
  rgb(pdf, C.mid, 'draw')
  pdf.setLineWidth(PEN.hair)
  pdf.line(x, y, x + totalW, y)
  return y + 0.6
}

function tableRow(pdf: jsPDF, x: number, y: number, cells: string[], cols: Col[], even: boolean, totalW: number) {
  if (even) {
    rgb(pdf, C.zebra, 'fill')
    pdf.rect(x, y, totalW, ROW_H, 'F')
  }
  let cx = x
  for (let i = 0; i < cells.length && i < cols.length; i++) {
    const right = cols[i].align === 'right'
    drawText(pdf, cells[i] ?? '', right ? cx + cols[i].w - 1.5 : cx + 1.5, y + 3.8, {
      size: 6.8, align: right ? 'right' : 'left', maxW: cols[i].w - 3,
    })
    cx += cols[i].w
  }
  return y + ROW_H
}

/** Closes a schedule with the double rule a totals line is set under. */
function tableRule(pdf: jsPDF, x: number, y: number, totalW: number, heavy = false) {
  rgb(pdf, heavy ? C.ink : C.faint, 'draw')
  pdf.setLineWidth(heavy ? PEN.archLight : PEN.hair)
  pdf.line(x, y, x + totalW, y)
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
  // The drawing mode belongs to the project, not to the export dialog.
  const opts: PlotOptions = { ...DEFAULT_PLOT_OPTIONS, ...req.options, freeform: isFreeform(project) }
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

    drawSheetFrame(pdf, W, H)

    const legendW = opts.showLegend ? Math.min(62, Math.max(44, W * 0.16)) : 0
    const area = {
      x: FRAME + 4,
      y: FRAME + 4,
      w: W - FRAME * 2 - 8,
      h: H - FRAME - TITLE_BLOCK_H - FRAME - 8,
    }
    const drawing = { ...area, w: area.w - (legendW ? legendW + 6 : 0) }

    const content = selectPlotContent(project, page.layerIds, opts.showBackground)
    const result = drawPlot(pdf, project, content, drawing, opts, req.gridSize ?? 1, sharedBounds)

    if (legendW) {
      // Rule between the drawing and the key column
      rgb(pdf, C.faint, 'draw')
      line(pdf, area.x + drawing.w + 3, area.y, area.x + drawing.w + 3, area.y + area.h, PEN.hair)
      drawLegend(pdf, { x: area.x + drawing.w + 6, y: area.y, w: legendW, h: area.h }, content, result, opts.paper)
    }

    if (result.scale.overflow) {
      rgb(pdf, C.amber, 'draw')
      rgb(pdf, C.white, 'fill')
      pdf.setLineWidth(PEN.archLight)
      pdf.rect(drawing.x, drawing.y, 64, 6, 'FD')
      drawText(pdf, 'DRAWING CLIPPED AT THIS SCALE', drawing.x + 2.5, drawing.y + 4, {
        size: 5.5, bold: true, spacing: 0.25, color: C.amber,
      })
    }

    const layerLabel = page.label
      ?? (page.layerIds ? page.layerIds.map(layerName).join(', ') : 'All layers')

    drawTitleBlock(pdf, project, W, H, {
      subtitle: page.label ? `Lighting Plot — ${page.label}` : 'Lighting Plot',
      scaleLabel: result.scale.notToScale ? 'NTS' : `1:${result.scale.denominator}${result.scale.standard ? '' : '*'}`,
      paperLabel: `${PAPER_LABELS[opts.paper]} ${opts.orientation === 'landscape' ? 'L' : 'P'}`,
      sheetRef: `LX-${String(i + 1).padStart(2, '0')}`,
      layerLabel,
      page: i + 1,
      pageCount: pages.length,
    })
  })

  const suffix = pages.length === 1 && pages[0].label ? `Plot_${slug(pages[0].label)}` : 'Plot'
  return { doc: pdf, filename: filenameFor(project, suffix) }
}

// ── Patch PDF ─────────────────────────────────────────────────────────────────

export function buildPatchPDF(project: Project): BuiltPdf {
  const r = startReport(project, 'Patch Sheet', 'PATCH')
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

  ensureSpace(r, 10)
  tableRule(pdf, MARGIN, r.y, totalW, true)
  r.y += 4.2
  const kw = fixtures.reduce((s, f) => s + f.powerRating, 0) / 1000
  const kg = fixtures.reduce((s, f) => s + f.weight, 0)
  drawCaption(pdf, 'Total', MARGIN + 1.5, r.y, { size: 4.6, color: C.ink })
  drawText(pdf, `${fixtures.length} fixtures    ${kw.toFixed(1)} kW    ${kg.toFixed(1)} kg`, MARGIN + totalW - 1.5, r.y, {
    size: 7, bold: true, align: 'right',
  })
  r.y += 1.6
  tableRule(pdf, MARGIN, r.y, totalW, true)
  r.y += 6

  return finishReport(r, 'Patch')
}

// ── Equipment PDF ─────────────────────────────────────────────────────────────

export function buildEquipmentPDF(project: Project): BuiltPdf {
  const r = startReport(project, 'Equipment List', 'EQUIP')
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

    ensureSpace(r, 10)
    tableRule(pdf, MARGIN, r.y, totalW, true)
    r.y += 4.2
    const tw = project.fixtures.reduce((s, f) => s + f.weight, 0)
    const tp = project.fixtures.reduce((s, f) => s + f.powerRating, 0)
    const wCol = MARGIN + cols[0].w + cols[1].w
    drawText(pdf, String(project.fixtures.length), MARGIN + cols[0].w - 1.5, r.y, { size: 7, bold: true, align: 'right' })
    drawCaption(pdf, 'Total', MARGIN + cols[0].w + 1.5, r.y, { size: 4.6, color: C.ink })
    drawText(pdf, `${tw.toFixed(1)} kg`, wCol + cols[2].w - 1.5, r.y, { size: 7, bold: true, align: 'right' })
    drawText(pdf, `${tp.toFixed(0)} W`, wCol + cols[2].w + cols[3].w - 1.5, r.y, { size: 7, bold: true, align: 'right' })
    r.y += 1.6
    tableRule(pdf, MARGIN, r.y, totalW, true)
    r.y += 6
  }

  // Devices belong on the equipment list too — they are things that get packed.
  if (project.devices.length > 0) {
    ensureSpace(r, 24)
    r.y += 4
    sectionHeading(r, 'Devices', `${project.devices.length} item${project.devices.length !== 1 ? 's' : ''}`)
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
        titleCase(d.category),
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
  const r = startReport(project, 'Cable Schedule', 'CABLE')
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

  const freeform = isFreeform(project)
  const runCols: Col[] = freeform
    ? [
        { label: '#', w: 9, align: 'right' },
        { label: 'LABEL', w: 16 },
        { label: 'FROM', w: 0 },
        { label: 'TO', w: 46 },
        { label: 'LENGTH', w: 24, align: 'right' },
      ]
    : [
        { label: '#', w: 9, align: 'right' },
        { label: 'LABEL', w: 16 },
        { label: 'FROM', w: 0 },
        { label: 'TO', w: 40 },
        { label: 'DRAWN', w: 20, align: 'right' },
        { label: '+20%', w: 20, align: 'right' },
      ]
  fillColumn(runCols, 2, totalW)
  /** Length of a run for scheduling: measured, or typed in on a freeform plot. */
  const runLength = (c: CableElement): number | null =>
    freeform ? (c.manualLength ?? null) : cableLength(c)

  let runIdx = 1
  for (const [type, runs] of byType) {
    if (!ensureSpace(r, 32)) r.y += 3

    const measured = runs.map(runLength).filter((l): l is number => l != null)
    const typeTotal = measured.reduce((s, l) => s + l * (1 + CABLE_OVERHEAD), 0)
    const unknown = runs.length - measured.length
    sectionHeading(
      r,
      CABLE_LABELS[type] ?? type,
      [
        `${runs.length} run${runs.length !== 1 ? 's' : ''}`,
        measured.length > 0 ? `${typeTotal.toFixed(1)} m total` : null,
        unknown > 0 ? `${unknown} without a length` : null,
      ].filter(Boolean).join('   ·   '),
      CABLE_COLORS[type] ?? '#9ca3af',
    )

    r.repeatHeader = () => { r.y = tableHeader(pdf, MARGIN, r.y, runCols, totalW) }
    r.y = tableHeader(pdf, MARGIN, r.y, runCols, totalW)

    const available = getRentalLengths(type)
    const breakdown: Record<number, number> = {}

    runs.forEach((c, i) => {
      ensureSpace(r, ROW_H)
      const plotM = runLength(c)
      const withOH = plotM == null ? null : plotM * (1 + CABLE_OVERHEAD)
      if (withOH != null) {
        for (const [len, qty] of Object.entries(packRun(withOH, available))) {
          breakdown[Number(len)] = (breakdown[Number(len)] ?? 0) + qty
        }
      }
      const cells = [
        String(runIdx++),
        c.autoLabel ?? '—',
        resolveName(c.startConnectedTo, project),
        resolveName(c.endConnectedTo, project),
        plotM == null ? '—' : `${plotM.toFixed(1)} m`,
      ]
      if (!freeform) cells.push(withOH == null ? '—' : `${withOH.toFixed(1)} m`)
      r.y = tableRow(pdf, MARGIN, r.y, cells, runCols, i % 2 === 0, totalW)
    })

    // Stock lengths to pull from the store
    const lengths = available.filter((l) => breakdown[l])
    ensureSpace(r, 22)
    tableRule(pdf, MARGIN, r.y, totalW)
    r.y += 4
    drawCaption(pdf, lengths.length > 0
      ? 'Cables to pull — per run, incl. 20% slack'
      : 'No run lengths entered yet — set a length on each cable', MARGIN, r.y, { size: 4.4 })
    r.y += 3.5

    lengths.forEach((len, i) => {
      const qty = breakdown[len]
      const bx = MARGIN + (i % 7) * 25
      const by = r.y + Math.floor(i / 7) * 11
      rgb(pdf, C.white, 'fill')
      rgb(pdf, C.faint, 'draw')
      pdf.setLineWidth(PEN.hair)
      pdf.rect(bx, by, 22, 9, 'FD')
      pdf.setFont('helvetica', BOLD); pdf.setFontSize(9.5)
      const qtyW = pdf.getTextWidth(String(qty))
      drawText(pdf, String(qty), bx + 2.5, by + 6.2, { size: 9.5, bold: true, color: C.blue })
      drawText(pdf, `× ${len} m`, bx + 3.6 + qtyW, by + 6.2, { size: 7 })
    })
    r.y += lengths.length > 0 ? Math.ceil(lengths.length / 7) * 11 + 6 : 3
  }

  return finishReport(r, 'Cables')
}

// ── Power PDF ─────────────────────────────────────────────────────────────────

const NOMINAL_VOLTAGE = 230

export function buildPowerPDF(project: Project): BuiltPdf {
  const r = startReport(project, 'Power Report', 'POWER')
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
  rgb(pdf, C.ink, 'draw'); pdf.setLineWidth(PEN.archLight)
  pdf.line(MARGIN, r.y, MARGIN + totalW, r.y)
  kpis.forEach((k, i) => {
    const bx = MARGIN + i * (kpiBoxW + 2)
    drawCaption(pdf, k.label, bx, r.y + 4.5, { size: 4.4 })
    drawText(pdf, k.value, bx, r.y + 11, { size: 11, bold: true, maxW: kpiBoxW - 3 })
    drawText(pdf, k.sub, bx, r.y + 15, { size: 5.5, color: C.mid, maxW: kpiBoxW - 3 })
    if (i > 0) {
      rgb(pdf, C.faint, 'draw'); pdf.setLineWidth(PEN.hair)
      pdf.line(bx - 3, r.y + 1.5, bx - 3, r.y + 16)
    }
  })
  r.y += 17.5
  rgb(pdf, C.faint, 'draw'); pdf.setLineWidth(PEN.hair)
  pdf.line(MARGIN, r.y, MARGIN + totalW, r.y)
  r.y += 7

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

    const statusColor: RGB = pct > 90 ? C.red : pct > 70 ? C.amber : C.green
    sectionHeading(r, distro.ref ? `${distro.ref} — ${distro.name}` : distro.name,
      `${distro.incomingRating}A · ${distro.phases}Ø · ${distro.circuits.length} circuits`)
    r.y -= 2

    drawText(pdf, `${kw(totalLoad)}`, MARGIN, r.y + 3, { size: 9, bold: true })
    drawText(pdf, `${pct}% of capacity`, MARGIN + 22, r.y + 3, { size: 6.5, color: statusColor, bold: true })
    drawText(pdf,
      downstreamLoad > 0
        ? `${kw(directLoad)} direct + ${kw(downstreamLoad)} downstream   ·   capacity ${kw(capacity)}`
        : `${kw(directLoad)} direct   ·   capacity ${kw(capacity)}`,
      W - MARGIN, r.y + 3, { size: 6.5, color: C.mid, align: 'right' })
    r.y += 5.5

    // Utilisation bar — outline plus fill, so it survives a mono print
    rgb(pdf, C.faint, 'fill')
    pdf.rect(MARGIN, r.y, totalW, 2.6, 'F')
    rgb(pdf, statusColor, 'fill')
    pdf.rect(MARGIN, r.y, totalW * Math.min(pct, 100) / 100, 2.6, 'F')
    rgb(pdf, C.mid, 'draw'); pdf.setLineWidth(PEN.hair)
    pdf.rect(MARGIN, r.y, totalW, 2.6, 'S')
    r.y += 7

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
        const usage = cap > 0 ? Math.min(1, load / cap) : 0
        rgb(pdf, C.white, 'fill'); rgb(pdf, C.faint, 'draw')
        pdf.setLineWidth(PEN.hair)
        pdf.rect(bx, r.y, phW, 11, 'FD')
        // Phase colour tab
        rgb(pdf, phColors[i], 'fill')
        pdf.rect(bx, r.y, 1.6, 11, 'F')
        drawText(pdf, `L${ph}`, bx + 3.5, r.y + 4.4, { size: 6.5, bold: true, color: phColors[i], spacing: 0.15 })
        drawText(pdf, kw(load), bx + 11, r.y + 4.4, { size: 6.5, bold: true })
        drawText(pdf, `${kw(cap)} capacity`, bx + 3.5, r.y + 8.4, { size: 5, color: C.mid })
        drawText(pdf, `${Math.round(usage * 100)}%`, bx + phW - 2, r.y + 8.4, { size: 5.5, color: C.mid, align: 'right' })
      })
      r.y += 13.5
      if (imbalance > 15) {
        drawText(pdf, `Phase imbalance ${imbalance.toFixed(0)}% — consider re-balancing circuits`, MARGIN, r.y + 3, {
          size: 6.2, color: C.amber, bold: true,
        })
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

    ensureSpace(r, 12)
    tableRule(pdf, MARGIN, r.y, totalW, true)
    r.y += 4.2
    drawCaption(pdf, 'Distro total', MARGIN + 1.5, r.y, { size: 4.6, color: C.ink })
    drawText(pdf, `${kw(directLoad)}    capacity ${kw(capacity)}    headroom ${kw(capacity - directLoad)}`,
      MARGIN + totalW - 1.5, r.y, { size: 7, bold: true, align: 'right' })
    r.y += 1.6
    tableRule(pdf, MARGIN, r.y, totalW, true)
    r.y += 9
    r.repeatHeader = undefined
  }

  return finishReport(r, 'Power')
}

// ── Groups PDF ────────────────────────────────────────────────────────────────

export function buildGroupsPDF(project: Project): BuiltPdf {
  const r = startReport(project, 'Groups', 'GROUP')
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

    if (!ensureSpace(r, 28)) r.y += 4

    sectionHeading(
      r,
      g.name,
      `${members.length} fixture${members.length !== 1 ? 's' : ''}   ·   ${(totalPow / 1000).toFixed(2)} kW   ·   ${totalWt.toFixed(1)} kg`,
      g.color || '#6b7280',
    )

    if (members.length === 0) {
      drawText(pdf, 'No fixtures in this group.', MARGIN, r.y + 3, { size: 6.8, color: C.light })
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
