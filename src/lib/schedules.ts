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

// ── Patch CSV ─────────────────────────────────────────────────────────────────
// A console or a visualiser will not read a PDF. This is the hookup as plain
// columns, one fixture per row in channel order, for an importer that lets you
// map columns to its own fields.

const CSV_COLUMNS: [string, (r: ScheduleRow) => string | number][] = [
  ['Channel', (r) => r.channel || ''],
  ['Universe', (r) => r.universe],
  ['Address', (r) => r.address],
  // Some importers want one running number rather than universe and address.
  ['Absolute Address', (r) => (r.universe - 1) * 512 + r.address],
  ['Patch', (r) => `${r.universe}/${r.address}`],
  ['Fixture Type', (r) => r.type],
  ['Mode', (r) => r.mode],
  ['Footprint', (r) => r.footprint],
  ['Position', (r) => r.position],
  ['Unit', (r) => r.unit || ''],
  ['Purpose', (r) => r.purpose],
  ['Colour', (r) => r.colour],
  ['Circuit', (r) => (r.circuit === '—' ? '' : r.circuit)],
  ['Notes', (r) => r.notes],
]

function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function buildPatchCSV(project: Project): string {
  const lines = [CSV_COLUMNS.map(([name]) => name).join(',')]
  for (const row of channelHookup(project)) lines.push(CSV_COLUMNS.map(([, pick]) => csvCell(pick(row))).join(','))
  // CRLF line ends and a trailing one: what spreadsheet and console importers expect.
  return lines.join('\r\n') + '\r\n'
}
