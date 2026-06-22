import { useMemo, useState } from 'react'
import { useProjectStore } from '../../store/projectStore'
import type { PlacedFixture } from '../../types'

// ── Constants ─────────────────────────────────────────────────────────────────

const DMX_MAX = 512
const BAR_H = 28          // px height of each universe bar
const TICK_EVERY = 64     // draw address tick labels

// ── Helpers ───────────────────────────────────────────────────────────────────

function addrEnd(f: PlacedFixture): number {
  return f.address + Math.max((f.channelCount ?? 1), 1) - 1
}

function isOverlap(a: PlacedFixture, b: PlacedFixture): boolean {
  return a.universe === b.universe &&
    a.address <= addrEnd(b) && addrEnd(a) >= b.address
}

// ── Universe bar ──────────────────────────────────────────────────────────────

interface FxSegment {
  fixture: PlacedFixture
  conflict: boolean
}

function UniverseBar({
  universe,
  fixtures,
  conflicts,
  hovered,
  onHover,
}: {
  universe: number
  fixtures: PlacedFixture[]
  conflicts: Set<string>
  hovered: string | null
  onHover: (id: string | null) => void
}) {
  const used = fixtures.reduce((s, f) => s + Math.max(f.channelCount ?? 1, 1), 0)
  const pct = Math.round(used / DMX_MAX * 100)

  const segments: FxSegment[] = fixtures.map((f) => ({
    fixture: f,
    conflict: conflicts.has(f.id),
  }))

  return (
    <div className='mb-5'>
      {/* Universe header */}
      <div className='flex items-center gap-3 mb-1.5'>
        <span className='text-xs font-bold font-mono text-gray-700 w-24'>Universe {universe}</span>
        <span className='text-xs text-gray-400'>{fixtures.length} fixture{fixtures.length !== 1 ? 's' : ''}</span>
        <span className='text-xs text-gray-400'>·</span>
        <span className={`text-xs font-mono ${pct > 90 ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>{used}/{DMX_MAX} addr ({pct}%)</span>
        {conflicts.size > 0 && (
          <span className='text-xs text-red-600 font-semibold'>⚠ {conflicts.size} conflict{conflicts.size !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Address bar */}
      <div className='relative' style={{ height: BAR_H }}>
        {/* Background */}
        <div className='absolute inset-0 rounded bg-gray-100' />

        {/* Tick marks */}
        {Array.from({ length: Math.floor(DMX_MAX / TICK_EVERY) + 1 }, (_, i) => i * TICK_EVERY).map((addr) => (
          addr > 0 && addr < DMX_MAX && (
            <div key={addr}
              className='absolute top-0 bottom-0 border-l border-gray-300/50'
              style={{ left: `${(addr / DMX_MAX) * 100}%` }}
            />
          )
        ))}

        {/* Fixture segments */}
        {segments.map(({ fixture: f, conflict }) => {
          const chCount = Math.max(f.channelCount ?? 1, 1)
          const left = ((f.address - 1) / DMX_MAX) * 100
          const width = (chCount / DMX_MAX) * 100
          const isHovered = hovered === f.id
          return (
            <div
              key={f.id}
              className='absolute top-0.5 bottom-0.5 rounded-sm transition-all cursor-pointer group'
              style={{
                left: `${left}%`,
                width: `max(${width}%, 2px)`,
                background: conflict ? '#ef4444' : f.color || '#3b82f6',
                opacity: hovered && !isHovered ? 0.5 : 1,
                outline: isHovered ? '2px solid white' : 'none',
                outlineOffset: '1px',
                zIndex: isHovered ? 10 : 1,
              }}
              onMouseEnter={() => onHover(f.id)}
              onMouseLeave={() => onHover(null)}
            >
              {/* Label — only show if segment is wide enough */}
              {width > 4 && (
                <span className='absolute inset-0 flex items-center justify-center text-white font-mono font-bold overflow-hidden'
                  style={{ fontSize: 9 }}>
                  {width > 8 ? `CH${f.channel}` : f.channel}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Address tick labels */}
      <div className='relative h-4 mt-0.5'>
        {Array.from({ length: Math.floor(DMX_MAX / TICK_EVERY) + 1 }, (_, i) => i * TICK_EVERY).map((addr) => (
          <span key={addr}
            className='absolute text-gray-400 font-mono'
            style={{ left: `${(addr / DMX_MAX) * 100}%`, fontSize: 8, transform: 'translateX(-50%)' }}>
            {addr === 0 ? '1' : addr === DMX_MAX ? '512' : addr}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Fixture tooltip ────────────────────────────────────────────────────────────

function FixtureDetail({ fixture, conflicts }: { fixture: PlacedFixture; conflicts: Set<string> }) {
  const chCount = Math.max(fixture.channelCount ?? 1, 1)
  return (
    <div className='border border-gray-200 rounded-xl p-4 text-xs space-y-1.5 bg-white sticky top-0'>
      <div className='font-semibold text-gray-800 text-sm'>CH{fixture.channel}</div>
      <div className='text-gray-600'>{fixture.manufacturer} {fixture.model}</div>
      <div className='text-gray-400'>Mode: {fixture.mode || '—'}</div>
      <div className='font-mono text-gray-700 mt-2'>
        Universe {fixture.universe}<br />
        Addr {fixture.address} – {fixture.address + chCount - 1}<br />
        <span className='text-gray-400'>({chCount} ch)</span>
      </div>
      {conflicts.has(fixture.id) && (
        <div className='mt-2 text-red-600 font-semibold'>⚠ Address conflict</div>
      )}
      {fixture.notes && <div className='text-gray-400 italic mt-1'>{fixture.notes}</div>}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DMXTopology() {
  const { project } = useProjectStore()
  const [hovered, setHovered] = useState<string | null>(null)

  const { byUniverse, conflictIds } = useMemo(() => {
    if (!project) return { byUniverse: new Map<number, PlacedFixture[]>(), conflictIds: new Set<string>() }

    const map = new Map<number, PlacedFixture[]>()
    for (const f of project.fixtures) {
      if (!map.has(f.universe)) map.set(f.universe, [])
      map.get(f.universe)!.push(f)
    }
    // Sort each universe's fixtures by address
    for (const fs of map.values()) fs.sort((a, b) => a.address - b.address)

    // Detect conflicts
    const cIds = new Set<string>()
    for (const fs of map.values()) {
      for (let i = 0; i < fs.length; i++) {
        for (let j = i + 1; j < fs.length; j++) {
          if (isOverlap(fs[i], fs[j])) { cIds.add(fs[i].id); cIds.add(fs[j].id) }
        }
      }
    }

    return { byUniverse: map, conflictIds: cIds }
  }, [project])

  if (!project) return null

  const hoveredFixture = hovered ? project.fixtures.find((f) => f.id === hovered) : null
  const universes = [...byUniverse.keys()].sort((a, b) => a - b)

  if (universes.length === 0) {
    return (
      <div className='text-center py-16 text-gray-400 text-sm'>
        <div className='text-3xl mb-3'>💡</div>
        <div className='font-medium text-gray-500 mb-1'>No fixtures patched</div>
        <div className='text-xs'>Place fixtures and assign DMX addresses to see the universe map here.</div>
      </div>
    )
  }

  const totalUsed = project.fixtures.reduce((s, f) => s + Math.max(f.channelCount ?? 1, 1), 0)
  const totalSlots = universes.length * DMX_MAX

  // Conflicts per universe
  const conflictsByUniverse = new Map<number, Set<string>>()
  for (const [u, fs] of byUniverse) {
    const cSet = new Set<string>()
    for (const f of fs) if (conflictIds.has(f.id)) cSet.add(f.id)
    conflictsByUniverse.set(u, cSet)
  }

  return (
    <div>
      <div className='flex items-baseline gap-4 mb-4'>
        <div className='text-sm font-semibold text-gray-700'>DMX Universe Map</div>
        <div className='text-xs text-gray-400'>
          {universes.length} universe{universes.length !== 1 ? 's' : ''} · {project.fixtures.length} fixtures · {totalUsed}/{totalSlots} addresses used
        </div>
        {conflictIds.size > 0 && (
          <div className='text-xs text-red-600 font-semibold'>⚠ {conflictIds.size} address conflict{conflictIds.size !== 1 ? 's' : ''}</div>
        )}
      </div>

      <div className='flex gap-6'>
        <div className='flex-1 overflow-auto'>
          {universes.map((u) => (
            <UniverseBar
              key={u}
              universe={u}
              fixtures={byUniverse.get(u) ?? []}
              conflicts={conflictsByUniverse.get(u) ?? new Set()}
              hovered={hovered}
              onHover={setHovered}
            />
          ))}
        </div>

        {/* Detail panel */}
        <div className='w-48 shrink-0'>
          {hoveredFixture
            ? <FixtureDetail fixture={hoveredFixture} conflicts={conflictIds} />
            : (
              <div className='text-xs text-gray-400 text-center pt-8'>
                Hover a fixture block to see details
              </div>
            )
          }
        </div>
      </div>

      {/* Fixtures table below */}
      <div className='mt-6 border border-gray-200 rounded-xl overflow-hidden'>
        <div className='bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 border-b border-gray-200'>
          All Fixtures by Address
        </div>
        <div className='overflow-x-auto'>
          <table className='w-full text-xs'>
            <thead>
              <tr className='border-b border-gray-100 text-gray-500 font-medium'>
                <th className='px-3 py-2 text-left'>ID</th>
                <th className='px-3 py-2 text-left'>Fixture</th>
                <th className='px-3 py-2 text-left'>Universe</th>
                <th className='px-3 py-2 text-left'>Address</th>
                <th className='px-3 py-2 text-left'>End</th>
                <th className='px-3 py-2 text-left'>Mode</th>
                <th className='px-3 py-2 text-left'>Ch Count</th>
              </tr>
            </thead>
            <tbody>
              {[...project.fixtures]
                .sort((a, b) => a.universe !== b.universe ? a.universe - b.universe : a.address - b.address)
                .map((f, i) => (
                  <tr key={f.id}
                    className={`border-b border-gray-50 transition-colors cursor-default
                      ${conflictIds.has(f.id) ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}
                      ${hovered === f.id ? 'ring-1 ring-inset ring-blue-400' : ''}`}
                    onMouseEnter={() => setHovered(f.id)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <td className='px-3 py-1.5 font-mono font-semibold text-gray-700'>CH{f.channel}</td>
                    <td className='px-3 py-1.5 text-gray-600'>{f.manufacturer} {f.model}</td>
                    <td className='px-3 py-1.5 font-mono text-gray-600'>{f.universe}</td>
                    <td className='px-3 py-1.5 font-mono text-gray-700'>{f.address}</td>
                    <td className='px-3 py-1.5 font-mono text-gray-500'>{addrEnd(f)}</td>
                    <td className='px-3 py-1.5 text-gray-500'>{f.mode || '—'}</td>
                    <td className='px-3 py-1.5 font-mono text-gray-500'>{f.channelCount ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
