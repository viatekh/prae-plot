// The three views of a rig that every lighting department works from. They hold
// the same facts, sorted three ways:
//   • instrument schedule — by hanging position, then unit number (the hang)
//   • channel hookup      — by channel (the desk)
//   • patch               — by universe and address (the data)
// The screen documents and the PDFs are both built from these rows.

import type { Project } from '../types'
import { resolvePositions } from './positions'
import { formatCircuitRef } from '../store/projectStore'

export interface ScheduleRow {
  id: string
  channel: number
  universe: number
  address: number
  /** "1.001" */
  patch: string
  /** Last address the fixture occupies. */
  endAddress: number
  footprint: number
  position: string
  unit: number
  type: string
  mode: string
  watts: number
  weight: number
  purpose: string
  colour: string
  circuit: string
  notes: string
}

export function scheduleRows(project: Project): ScheduleRow[] {
  const { byFixture } = resolvePositions(project)
  return project.fixtures.map((f) => {
    const pos = byFixture.get(f.id)
    const footprint = Math.max(1, f.channelCount || 1)
    return {
      id: f.id,
      channel: f.channel,
      universe: f.universe,
      address: f.address,
      patch: `${f.universe}.${String(f.address).padStart(3, '0')}`,
      endAddress: f.address + footprint - 1,
      footprint,
      position: pos?.position ?? '',
      unit: pos?.unit ?? 0,
      type: `${f.manufacturer} ${f.model}`.trim(),
      mode: f.mode,
      watts: f.powerRating,
      weight: f.weight,
      purpose: [f.purpose, f.label].filter(Boolean).join(' — '),
      colour: f.color ?? '',
      circuit: formatCircuitRef(project.distros, f.circuitId),
      notes: f.notes ?? '',
    }
  })
}

export interface PositionSchedule {
  name: string
  trim?: number
  rows: ScheduleRow[]
  watts: number
  weight: number
}

/** Fixtures grouped by position in hang order; unassigned ones come last. */
export function instrumentSchedule(project: Project): PositionSchedule[] {
  const rows = new Map(scheduleRows(project).map((r) => [r.id, r]))
  const { positions, loose } = resolvePositions(project)
  const group = (name: string, trim: number | undefined, ids: string[]): PositionSchedule => {
    const list = ids.map((id) => rows.get(id)!).filter(Boolean)
    return {
      name, trim, rows: list,
      watts: list.reduce((s, r) => s + r.watts, 0),
      weight: list.reduce((s, r) => s + r.weight, 0),
    }
  }
  return [
    ...positions.map((p) => group(p.name, p.trim, p.fixtures.map((f) => f.id))),
    group('Not on a position', undefined, loose.map((f) => f.id)),
  ].filter((g) => g.rows.length > 0)
}

export function channelHookup(project: Project): ScheduleRow[] {
  return scheduleRows(project).sort((a, b) => a.channel - b.channel || a.universe - b.universe || a.address - b.address)
}

export interface UniversePatch {
  universe: number
  /** Addresses in use, counting an overlapped slot once. */
  used: number
  rows: (ScheduleRow & { clash: boolean })[]
}

/** The patch laid out the way the data runs: universe by universe, in address order. */
export function patchByUniverse(project: Project): UniversePatch[] {
  const byUniverse = new Map<number, ScheduleRow[]>()
  for (const row of scheduleRows(project)) {
    if (!byUniverse.has(row.universe)) byUniverse.set(row.universe, [])
    byUniverse.get(row.universe)!.push(row)
  }
  return [...byUniverse.entries()].sort((a, b) => a[0] - b[0]).map(([universe, list]) => {
    list.sort((a, b) => a.address - b.address || a.channel - b.channel)
    const slots = new Uint8Array(513)
    for (const r of list) for (let a = Math.max(1, r.address); a <= Math.min(512, r.endAddress); a++) slots[a]++
    const rows = list.map((r) => {
      let clash = r.endAddress > 512 || r.address < 1
      for (let a = Math.max(1, r.address); a <= Math.min(512, r.endAddress) && !clash; a++) clash = slots[a] > 1
      return { ...r, clash }
    })
    return { universe, used: slots.reduce((s, n) => s + (n > 0 ? 1 : 0), 0), rows }
  })
}

// ── Patch files ───────────────────────────────────────────────────────────────
// A console or a visualiser will not read a PDF. These are the hookup as plain
// columns, one fixture per row in channel order. Both importers go by the
// header row, so the columns are named the way each one names its own fields
// and need no mapping by hand; the order does not matter to either.

type Column = [string, (r: ScheduleRow) => string | number]

// Capture ("Import Fixture Data"): comma-separated, matched on Capture's own
// property names, patch written Universe.Address. The columns after Note are
// not Capture's — they are there for spreadsheets and for importers that want
// the patch split up or as one running number, and can be mapped or ignored.
const CSV_COLUMNS: Column[] = [
  ['Fixture', (r) => r.type],
  ['Channel', (r) => r.channel || ''],
  ['Patch', (r) => `${r.universe}.${r.address}`],
  ['Unit', (r) => r.unit || ''],
  ['Circuit', (r) => (r.circuit === '—' ? '' : r.circuit)],
  ['Purpose', (r) => r.purpose],
  ['Note', (r) => r.notes],
  ['Mode', (r) => r.mode],
  ['Footprint', (r) => r.footprint],
  ['Position', (r) => r.position],
  ['Colour', (r) => r.colour],
  ['Universe', (r) => r.universe],
  ['Address', (r) => r.address],
  ['Absolute Address', (r) => (r.universe - 1) * 512 + r.address],
]

// Eos ("Import > Lightwright"): a tab-separated text file under Lightwright's
// headings, the address in one Dimmer column as universe/address.
const EOS_COLUMNS: Column[] = [
  ['Channel', (r) => r.channel || ''],
  ['Dimmer', (r) => `${r.universe}/${r.address}`],
  ['Device Type', (r) => r.type],
  ['Position', (r) => r.position],
  ['Unit#', (r) => r.unit || ''],
  ['Purpose', (r) => r.purpose],
  ['Color', (r) => r.colour],
  ['Circuit Name', (r) => (r.circuit === '—' ? '' : r.circuit)],
]

function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** A tab-separated file has no quoting, so a cell cannot hold a tab or a line break. */
function tsvCell(value: string | number): string {
  return String(value).replace(/[\t\r\n]+/g, ' ')
}

function table(project: Project, columns: Column[], cell: (v: string | number) => string, divider: string): string {
  const lines = [columns.map(([name]) => name).join(divider)]
  for (const row of channelHookup(project)) lines.push(columns.map(([, pick]) => cell(pick(row))).join(divider))
  // CRLF line ends and a trailing one: Eos refuses anything else, and
  // spreadsheets and Capture are happy with it.
  return lines.join('\r\n') + '\r\n'
}

/** Comma-separated patch, headed for Capture's fixture data import. */
export function buildPatchCSV(project: Project): string {
  return table(project, CSV_COLUMNS, csvCell, ',')
}

/** Tab-separated patch, headed for the Eos family's Lightwright import. */
export function buildEosPatchText(project: Project): string {
  return table(project, EOS_COLUMNS, tsvCell, '\t')
}
