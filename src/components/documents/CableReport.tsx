import { useState } from 'react'
import { useProjectStore } from '../../store/projectStore'
import type { CableElement, CableType } from '../../types'
import { CABLE_COLORS, CABLE_LABELS } from '../../types'

// Standard rental lengths in metres, grouped by cable family
const POWER_LENGTHS  = [1, 2, 5, 10, 20]
const DATA_LENGTHS   = [1, 2, 5, 10, 20]
const NETWORK_LENGTHS = [1, 2, 5, 10, 20, 50]
const AUDIO_LENGTHS  = [1, 2, 5, 10, 20]

function getLengths(type: CableType): number[] {
  if (type.startsWith('power') || type.startsWith('cee') || type === 'iec') return POWER_LENGTHS
  if (type === 'ethernet' || type === 'cat6' || type === 'fibre') return NETWORK_LENGTHS
  if (type.startsWith('dmx')) return DATA_LENGTHS
  return AUDIO_LENGTHS
}

/**
 * Given a required run length and a set of available standard lengths (sorted desc),
 * return the minimum combination using greedy algorithm.
 */
function breakIntoLengths(totalM: number, available: number[]): Record<number, number> {
  const sorted = [...available].sort((a, b) => b - a)
  const result: Record<number, number> = {}
  let remaining = totalM
  for (const len of sorted) {
    if (remaining <= 0) break
    const count = Math.floor(remaining / len)
    if (count > 0) { result[len] = count; remaining -= count * len }
  }
  // If there's anything left (< smallest length), add one of the smallest
  if (remaining > 0.05) {
    const min = sorted[sorted.length - 1]
    result[min] = (result[min] ?? 0) + 1
  }
  return result
}

interface RunRow {
  type: CableType
  label: string
  from: string
  to: string
  plotM: number
  withOverheadM: number
}

export default function CableReport() {
  const { project } = useProjectStore()
  const [overhead, setOverhead] = useState(20) // %
  const [view, setView] = useState<'runs' | 'summary'>('runs')

  if (!project) return null

  const cables = project.elements.filter((e) => e.type === 'cable') as CableElement[]
  const fixtures = project.fixtures
  const distros = project.distros

  if (cables.length === 0) {
    return (
      <div>
        <div className='text-sm font-semibold text-gray-700 mb-3'>Cable Schedule</div>
        <div className='text-center text-xs text-gray-400 py-6'>
          No cable lines drawn yet.<br />
          Use the Cable tool (C) to draw point-to-point cable runs.
        </div>
      </div>
    )
  }

  const resolveName = (id?: string) => {
    if (!id) return '—'
    const fx = fixtures.find((f) => f.id === id)
    if (fx) return `CH${fx.channel} ${fx.shortName || fx.model}`
    const dx = distros.find((d) => d.id === id)
    if (dx) return dx.ref ? `[${dx.ref}] ${dx.name}` : dx.name
    return '—'
  }

  const cableLength = (c: CableElement): number => {
    const pts = [{ x: c.x, y: c.y }, ...(c.waypoints ?? []), { x: c.x2, y: c.y2 }]
    let len = 0
    for (let i = 1; i < pts.length; i++) len += Math.sqrt((pts[i].x - pts[i-1].x)**2 + (pts[i].y - pts[i-1].y)**2)
    return len
  }

  const runs: RunRow[] = cables.map((c) => {
    const plot = cableLength(c)
    return {
      type: c.cableType,
      label: c.label || '',
      from: resolveName(c.startConnectedTo),
      to: resolveName(c.endConnectedTo),
      plotM: plot,
      withOverheadM: plot * (1 + overhead / 100),
    }
  })

  // ── Summary with optimal lengths ─────────────────────────────────────────────
  const byType: Record<string, { runs: RunRow[]; total: number; withOverhead: number }> = {}
  for (const r of runs) {
    if (!byType[r.type]) byType[r.type] = { runs: [], total: 0, withOverhead: 0 }
    byType[r.type].runs.push(r)
    byType[r.type].total += r.plotM
    byType[r.type].withOverhead += r.withOverheadM
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center justify-between'>
        <div className='text-sm font-semibold text-gray-700'>Cable Schedule</div>
        <div className='flex items-center gap-3'>
          <div className='flex items-center gap-1.5'>
            <label className='text-xs text-gray-500'>Overhead %</label>
            <input
              type='number' min={0} max={100} value={overhead}
              onChange={(e) => setOverhead(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
              className='w-14 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500'
            />
          </div>
          <div className='flex bg-gray-100 rounded overflow-hidden text-xs'>
            <button onClick={() => setView('runs')} className={`px-2 py-1 ${view === 'runs' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-200'}`}>Runs</button>
            <button onClick={() => setView('summary')} className={`px-2 py-1 ${view === 'summary' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-200'}`}>Lengths</button>
          </div>
        </div>
      </div>

      {view === 'runs' && (
        <table className='w-full text-xs border-collapse'>
          <thead>
            <tr className='bg-gray-800 text-white'>
              <th className='px-2 py-1.5 text-left'>Type</th>
              <th className='px-2 py-1.5 text-left'>From</th>
              <th className='px-2 py-1.5 text-left'>To</th>
              <th className='px-2 py-1.5 text-right'>Plotted</th>
              <th className='px-2 py-1.5 text-right'>+OH</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className='px-2 py-1.5'>
                  <div className='flex items-center gap-1.5'>
                    <span className='w-2 h-2 rounded-full shrink-0' style={{ background: CABLE_COLORS[r.type] }} />
                    {CABLE_LABELS[r.type]}
                  </div>
                </td>
                <td className='px-2 py-1.5 text-gray-600 max-w-[80px] truncate' title={r.from}>{r.from}</td>
                <td className='px-2 py-1.5 text-gray-600 max-w-[80px] truncate' title={r.to}>{r.to}</td>
                <td className='px-2 py-1.5 text-right text-gray-600 font-mono'>{r.plotM.toFixed(1)}m</td>
                <td className='px-2 py-1.5 text-right font-medium text-gray-800 font-mono'>{r.withOverheadM.toFixed(1)}m</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className='bg-gray-100 font-semibold border-t border-gray-300'>
              <td colSpan={3} className='px-2 py-1.5 text-gray-700'>{runs.length} cable run{runs.length !== 1 ? 's' : ''}</td>
              <td className='px-2 py-1.5 text-right text-gray-700 font-mono'>{runs.reduce((s, r) => s + r.plotM, 0).toFixed(1)}m</td>
              <td className='px-2 py-1.5 text-right text-gray-800 font-mono'>{runs.reduce((s, r) => s + r.withOverheadM, 0).toFixed(1)}m</td>
            </tr>
          </tfoot>
        </table>
      )}

      {view === 'summary' && (
        <div className='flex flex-col gap-4'>
          {Object.entries(byType).map(([type, data]) => {
            const available = getLengths(type as CableType)
            const breakdown = breakIntoLengths(data.withOverhead, available)
            const allLengths = [...available].sort((a, b) => a - b)
            return (
              <div key={type} className='border border-gray-200 rounded-lg overflow-hidden'>
                <div className='flex items-center gap-2 px-3 py-2 bg-gray-800 text-white'>
                  <span className='w-2.5 h-2.5 rounded-full shrink-0' style={{ background: CABLE_COLORS[type as CableType] }} />
                  <span className='text-xs font-semibold'>{CABLE_LABELS[type as CableType]}</span>
                  <span className='ml-auto text-xs text-gray-400'>{data.runs.length} run{data.runs.length !== 1 ? 's' : ''} · {data.withOverhead.toFixed(1)}m total</span>
                </div>
                <table className='w-full text-xs'>
                  <thead>
                    <tr className='bg-gray-50 border-b border-gray-200'>
                      <th className='px-3 py-1.5 text-left text-gray-500'>Length</th>
                      <th className='px-3 py-1.5 text-right text-gray-500'>Qty</th>
                      <th className='px-3 py-1.5 text-right text-gray-500'>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allLengths.map((len) => {
                      const qty = breakdown[len] ?? 0
                      if (qty === 0) return null
                      return (
                        <tr key={len} className='border-b border-gray-100 last:border-0'>
                          <td className='px-3 py-1.5 font-mono font-medium text-gray-800'>{len}m</td>
                          <td className='px-3 py-1.5 text-right font-mono font-bold text-blue-600'>{qty}</td>
                          <td className='px-3 py-1.5 text-right font-mono text-gray-500'>{(qty * len).toFixed(0)}m</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className='bg-gray-50'>
                      <td className='px-3 py-1.5 text-gray-500'>Total stocked</td>
                      <td className='px-3 py-1.5 text-right font-bold font-mono text-gray-800'>
                        {allLengths.reduce((s, l) => s + (breakdown[l] ?? 0), 0)}
                      </td>
                      <td className='px-3 py-1.5 text-right font-mono text-gray-700'>
                        {allLengths.reduce((s, l) => s + (breakdown[l] ?? 0) * l, 0).toFixed(0)}m
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          })}
          <p className='text-xs text-gray-400'>
            Lengths are plotted distances + {overhead}% overhead, broken into standard rental lengths using greedy allocation.
            Network cables up to 50m; power/DMX/audio up to 20m.
          </p>
        </div>
      )}
    </div>
  )
}
