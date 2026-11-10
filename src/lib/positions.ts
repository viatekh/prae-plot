// Hanging positions.
//
// A fixture belongs to a position when it sits on a truss — the same rule a
// rigger uses reading the plot. Nothing is stored: membership and unit numbers
// are worked out from where things are, so dragging a light onto another bar
// re-homes and renumbers it without anyone having to maintain a list.

import type { PlacedFixture, Project, TrussElement } from '../types'

/** How close (in drawing units) a fixture must be to a truss to hang on it. */
export const ATTACH_DISTANCE = 0.6

export interface Position {
  id: string
  name: string
  trim?: number
  /** Fixtures on this position, in unit-number order. */
  fixtures: PlacedFixture[]
}

export interface FixturePosition {
  positionId: string | null
  /** Position name, or '' when the fixture hangs on nothing. */
  position: string
  /** 1-based unit number along the position; 0 when unassigned. */
  unit: number
}

export interface ResolvedPositions {
  positions: Position[]
  /** Fixtures that are not on any truss, in reading order. */
  loose: PlacedFixture[]
  byFixture: Map<string, FixturePosition>
}

/** Closest point on a truss to (px,py): distance, and how far along it (0–1). */
export function projectOntoTruss(t: Pick<TrussElement, 'x' | 'y' | 'x2' | 'y2'>, px: number, py: number) {
  const dx = t.x2 - t.x, dy = t.y2 - t.y
  const len2 = dx * dx + dy * dy
  const along = len2 > 0 ? Math.max(0, Math.min(1, ((px - t.x) * dx + (py - t.y) * dy) / len2)) : 0
  const x = t.x + dx * along, y = t.y + dy * along
  return { x, y, along, distance: Math.hypot(px - x, py - y) }
}

/** The truss a point would hang on, if any. */
export function nearestTruss(trusses: TrussElement[], px: number, py: number, within = ATTACH_DISTANCE) {
  let best: { truss: TrussElement; x: number; y: number; along: number; distance: number } | null = null
  for (const truss of trusses) {
    const hit = projectOntoTruss(truss, px, py)
    if (hit.distance <= within && (!best || hit.distance < best.distance)) best = { truss, ...hit }
  }
  return best
}

export function positionName(truss: TrussElement, index: number): string {
  return truss.label?.trim() || `Position ${index + 1}`
}

export function resolvePositions(project: Pick<Project, 'elements' | 'fixtures'>): ResolvedPositions {
  const trusses = project.elements.filter((e): e is TrussElement => e.type === 'truss')
  const members = new Map<string, { fixture: PlacedFixture; along: number }[]>(trusses.map((t) => [t.id, []]))
  const loose: PlacedFixture[] = []

  for (const fixture of project.fixtures) {
    const hit = nearestTruss(trusses, fixture.x, fixture.y)
    if (hit) members.get(hit.truss.id)!.push({ fixture, along: hit.along })
    else loose.push(fixture)
  }

  const byFixture = new Map<string, FixturePosition>()
  const positions: Position[] = trusses.map((truss, i) => {
    // Units count from the left end of the bar (the top end of a vertical one)
    // unless the position says otherwise.
    const startsAtOrigin = truss.x !== truss.x2 ? truss.x < truss.x2 : truss.y <= truss.y2
    const forwards = startsAtOrigin !== !!truss.numberFromEnd
    const ordered = members.get(truss.id)!
      .sort((a, b) => (forwards ? a.along - b.along : b.along - a.along) || a.fixture.channel - b.fixture.channel)
      .map((m) => m.fixture)
    const name = positionName(truss, i)
    ordered.forEach((f, n) => byFixture.set(f.id, { positionId: truss.id, position: name, unit: n + 1 }))
    return { id: truss.id, name, trim: truss.trim, fixtures: ordered }
  })

  loose.sort((a, b) => a.y - b.y || a.x - b.x)
  for (const f of loose) byFixture.set(f.id, { positionId: null, position: '', unit: 0 })

  return { positions, loose, byFixture }
}
