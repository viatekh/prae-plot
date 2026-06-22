import { useProjectStore, computeDistroLoad, computeCircuitLoad, circuitCapacityW } from '../../store/projectStore'

// ── Helpers ───────────────────────────────────────────────────

function kw(w: number) { return `${(w / 1000).toFixed(2)} kW` }
function amp(w: number, v = 230) { return `${(w / v).toFixed(1)} A` }
function pct(load: number, cap: number) { return cap > 0 ? Math.round((load / cap) * 100) : 0 }

function LoadBar({ loadW, capacityW, compact }: { loadW: number; capacityW: number; compact?: boolean }) {
  const p = pct(loadW, capacityW)
  const color = p > 90 ? 'bg-red-500' : p > 70 ? 'bg-amber-400' : 'bg-green-500'
  if (compact) return (
    <div className='flex items-center gap-2'>
      <div className='flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden'>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(p, 100)}%` }} />
      </div>
      <span className={`text-xs font-mono w-8 text-right ${p > 90 ? 'text-red-600 font-bold' : 'text-gray-500'}`}>{p}%</span>
    </div>
  )
  return (
    <div className='flex items-center gap-3'>
      <div className='flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden'>
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(p, 100)}%` }} />
      </div>
      <span className={`text-sm font-mono w-10 text-right font-semibold ${p > 90 ? 'text-red-600' : p > 70 ? 'text-amber-600' : 'text-gray-600'}`}>{p}%</span>
    </div>
  )
}

function PhaseChip({ phase }: { phase: 1 | 2 | 3 }) {
  const colors = { 1: 'bg-amber-100 text-amber-800', 2: 'bg-sky-100 text-sky-800', 3: 'bg-violet-100 text-violet-800' }
  const labels = { 1: 'L1', 2: 'L2', 3: 'L3' }
  return <span className={`text-xs px-1 py-0.5 rounded font-mono font-bold ${colors[phase]}`}>{labels[phase]}</span>
}

// ── Phase summary table ───────────────────────────────────────

function PhaseBalanceTable({ phases, circuits, fixtures }: {
  phases: 1 | 3
  circuits: import('../../types').Circuit[]
  fixtures: import('../../types').PlacedFixture[]
}) {
  if (phases === 1) return null
  const byPhase = [1, 2, 3].map((ph) => {
    const pCircs = circuits.filter((c) => c.phase === ph)
    const load = pCircs.reduce((s, c) => s + computeCircuitLoad(fixtures, c.id), 0)
    const cap = pCircs.reduce((s, c) => s + circuitCapacityW(c), 0)
    return { phase: ph as 1 | 2 | 3, load, cap }
  })
  const maxLoad = Math.max(...byPhase.map((p) => p.load), 1)
  const imbalance = maxLoad > 0 ? ((maxLoad - Math.min(...byPhase.map((p) => p.load))) / maxLoad * 100) : 0
  return (
    <div className='mt-3'>
      <div className='text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2'>Phase Balance</div>
      <div className='grid grid-cols-3 gap-2 mb-2'>
        {byPhase.map(({ phase, load, cap }) => (
          <div key={phase} className='bg-gray-50 rounded p-2 border border-gray-100'>
            <div className='flex items-center justify-between mb-1'>
              <PhaseChip phase={phase} />
              <span className='text-xs font-mono text-gray-600'>{amp(load)}</span>
            </div>
            <LoadBar loadW={load} capacityW={cap} compact />
            <div className='text-xs text-gray-400 mt-1'>{kw(load)} / {kw(cap)}</div>
          </div>
        ))}
      </div>
      {imbalance > 15 && (
        <div className='flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5'>
          ⚠ Phase imbalance: {imbalance.toFixed(0)}% — consider re-balancing circuits
        </div>
      )}
    </div>
  )
}

// ── Per-distro card ───────────────────────────────────────────

function DistroCard() {
  const { project } = useProjectStore()
  if (!project) return null
  const { distros, fixtures, elements } = project

  if (distros.length === 0) return (
    <div className='text-center text-xs text-gray-400 py-8'>No power distribution added.</div>
  )

  return (
    <div className='flex flex-col gap-6'>
      {distros.map((distro) => {
        const totalLoad = computeDistroLoad(distro, distros, fixtures, elements, new Set())
        const directLoad = distro.circuits.reduce((s, c) => s + computeCircuitLoad(fixtures, c.id), 0)
        const downstreamLoad = totalLoad - directLoad
        const capacity = distro.incomingRating * distro.phases * 230
        const p = pct(totalLoad, capacity)

        return (
          <div key={distro.id} className='border border-gray-200 rounded-xl overflow-hidden'>
            {/* Header */}
            <div className='bg-gray-900 text-white px-4 py-3 flex items-center gap-3'>
              {distro.ref && (
                <span className='bg-red-600 text-white text-sm font-bold px-2 py-0.5 rounded font-mono'>{distro.ref}</span>
              )}
              <div className='flex-1'>
                <div className='font-semibold text-sm'>{distro.name}</div>
                <div className='text-gray-400 text-xs'>{distro.incomingRating}A · {distro.phases}Ø · {distro.circuits.length} circuits</div>
              </div>
              <div className='text-right'>
                <div className='text-sm font-mono font-semibold'>{kw(totalLoad)}</div>
                <div className={`text-xs font-mono ${p > 90 ? 'text-red-400' : p > 70 ? 'text-amber-400' : 'text-green-400'}`}>{p}% load</div>
              </div>
            </div>

            {/* Load bar */}
            <div className='px-4 py-2 bg-gray-50 border-b border-gray-200'>
              <LoadBar loadW={totalLoad} capacityW={capacity} />
              <div className='flex justify-between text-xs text-gray-400 mt-1'>
                <span>
                  {directLoad > 0 && `${kw(directLoad)} direct`}
                  {downstreamLoad > 0 && ` + ${kw(downstreamLoad)} downstream`}
                </span>
                <span>Capacity: {kw(capacity)} ({amp(capacity / distro.phases)} × {distro.phases}Ø)</span>
              </div>
            </div>

            {/* Phase balance */}
            {distro.phases === 3 && (
              <div className='px-4 py-3 border-b border-gray-200'>
                <PhaseBalanceTable phases={distro.phases} circuits={distro.circuits} fixtures={fixtures} />
              </div>
            )}

            {/* Circuits table */}
            <div className='overflow-x-auto'>
              <table className='w-full text-xs'>
                <thead>
                  <tr className='bg-gray-50 text-gray-500 border-b border-gray-200'>
                    <th className='px-3 py-2 text-left font-medium w-16'>Circuit</th>
                    {distro.phases === 3 && <th className='px-2 py-2 text-left font-medium w-10'>Phase</th>}
                    <th className='px-3 py-2 text-left font-medium'>Fixtures</th>
                    <th className='px-3 py-2 text-right font-medium w-20'>Load</th>
                    <th className='px-3 py-2 text-right font-medium w-16'>Rating</th>
                    <th className='px-3 py-2 text-right font-medium w-16'>Free</th>
                    <th className='px-3 py-2 w-24'>Utilisation</th>
                  </tr>
                </thead>
                <tbody>
                  {distro.circuits.map((c, i) => {
                    const load = computeCircuitLoad(fixtures, c.id)
                    const cap = circuitCapacityW(c)
                    const cp = pct(load, cap)
                    const fxOnCircuit = fixtures.filter((f) => f.circuitId === c.id)
                    return (
                      <tr key={c.id} className={`border-b border-gray-100 ${cp > 90 ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                        <td className='px-3 py-2 font-mono font-semibold text-gray-700'>
                          {distro.ref ? `${distro.ref}·${i+1}` : c.name}
                        </td>
                        {distro.phases === 3 && (
                          <td className='px-2 py-2'><PhaseChip phase={c.phase} /></td>
                        )}
                        <td className='px-3 py-2 text-gray-600'>
                          {fxOnCircuit.length === 0
                            ? <span className='text-gray-300 italic'>—</span>
                            : fxOnCircuit.map((f) => (
                                <span key={f.id} className='inline-block mr-1 bg-gray-100 rounded px-1 font-mono'>CH{f.channel}</span>
                              ))
                          }
                        </td>
                        <td className='px-3 py-2 text-right font-mono text-gray-700'>{load > 0 ? `${load.toFixed(0)}W` : '—'}</td>
                        <td className='px-3 py-2 text-right font-mono text-gray-500'>{c.rating}A</td>
                        <td className={`px-3 py-2 text-right font-mono ${cp > 90 ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                          {(cap - load).toFixed(0)}W
                        </td>
                        <td className='px-3 py-2'>
                          {load > 0 ? <LoadBar loadW={load} capacityW={cap} compact /> : <span className='text-gray-200 text-xs'>unused</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className='bg-gray-100 border-t-2 border-gray-300 font-semibold'>
                    <td colSpan={distro.phases === 3 ? 3 : 2} className='px-3 py-2 text-gray-700 text-right'>Total</td>
                    <td className='px-3 py-2 text-right font-mono text-gray-800'>{kw(directLoad)}</td>
                    <td className='px-3 py-2 text-right font-mono text-gray-600'>{distro.incomingRating}A</td>
                    <td className='px-3 py-2 text-right font-mono text-gray-600'>{kw(capacity - directLoad)}</td>
                    <td className='px-3 py-2'>
                      <LoadBar loadW={directLoad} capacityW={capacity} compact />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Summary header ─────────────────────────────────────────────

function PowerSummary() {
  const { project } = useProjectStore()
  if (!project) return null
  const { distros, fixtures, elements } = project

  const totalFixturePower = fixtures.reduce((s, f) => s + f.powerRating, 0)
  const totalDistroCapacity = distros.reduce((s, d) => s + d.incomingRating * d.phases * 230, 0)
  const totalDistroLoad = distros.reduce((s, d) => s + computeDistroLoad(d, distros, fixtures, elements, new Set()), 0)
  const unassignedFixtures = fixtures.filter((f) => !f.circuitId)

  return (
    <div className='grid grid-cols-2 md:grid-cols-4 gap-3 mb-6'>
      {[
        { label: 'Total Fixture Load', value: kw(totalFixturePower), sub: `${fixtures.length} fixtures`, color: 'border-blue-200 bg-blue-50' },
        { label: 'Total Distro Capacity', value: kw(totalDistroCapacity), sub: `${distros.length} distros`, color: 'border-gray-200 bg-white' },
        { label: 'Total Assigned Load', value: kw(totalDistroLoad), sub: `${pct(totalDistroLoad, totalDistroCapacity)}% of capacity`, color: totalDistroLoad / totalDistroCapacity > 0.9 ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50' },
        { label: 'Unassigned Fixtures', value: String(unassignedFixtures.length), sub: unassignedFixtures.length > 0 ? 'need circuit' : 'all assigned', color: unassignedFixtures.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50' },
      ].map((s) => (
        <div key={s.label} className={`border rounded-xl p-3 ${s.color}`}>
          <div className='text-xs text-gray-500 font-medium mb-1'>{s.label}</div>
          <div className='text-xl font-bold text-gray-800 font-mono'>{s.value}</div>
          <div className='text-xs text-gray-500 mt-0.5'>{s.sub}</div>
        </div>
      ))}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────

export default function PowerReport() {
  const { project } = useProjectStore()
  if (!project) return null

  return (
    <div>
      <div className='text-sm font-semibold text-gray-700 mb-4'>Power Distribution Report</div>
      <PowerSummary />
      <DistroCard />
    </div>
  )
}
