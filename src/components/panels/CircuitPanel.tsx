import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, AlertTriangle, AlertCircle, CheckCircle, MapPin } from 'lucide-react'
import { useProjectStore, computeCircuitLoad, computeDistroLoad, circuitCapacityW, loadStatus, viewCentreWorld } from '../../store/projectStore'
import type { Project, Distro, Circuit, PlacedFixture } from '../../types'
import { DISTRO_PRESETS } from '../../types'
import { cn, generateId } from '../../lib/utils'

function LoadBar({ loadW, capacityW }: { loadW: number; capacityW: number }) {
  const pct = Math.min(100, (loadW / capacityW) * 100)
  const status = loadStatus(loadW, capacityW)
  const color = status === 'overload' ? 'bg-red-500' : status === 'warning' ? 'bg-amber-400' : 'bg-green-500'
  return (
    <div className='flex items-center gap-2'>
      <div className='flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden'>
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className='text-xs text-gray-500 shrink-0 w-8 text-right'>{pct.toFixed(0)}%</span>
      {status === 'overload' && <AlertCircle size={12} className='text-red-500 shrink-0' />}
      {status === 'warning' && <AlertTriangle size={12} className='text-amber-500 shrink-0' />}
      {status === 'ok' && <CheckCircle size={12} className='text-green-400 shrink-0' />}
    </div>
  )
}

function phaseLabel(phase: 1 | 2 | 3): string {
  return `L${phase}`
}

function CircuitRow({ circuit, distroId, fixtures }: { circuit: Circuit; distroId: string; fixtures: PlacedFixture[] }) {
  const { updateCircuit, deleteCircuit } = useProjectStore()
  const load = computeCircuitLoad(fixtures, circuit.id)
  const capacity = circuitCapacityW(circuit)
  const [editing, setEditing] = useState(false)
  const assignedFixtures = fixtures.filter((f) => f.circuitId === circuit.id)

  return (
    <div className='ml-3 border-l-2 border-gray-100 pl-2 py-1'>
      <div className='flex items-center gap-1.5'>
        {/* Way name */}
        {editing ? (
          <input
            autoFocus
            className='text-xs border border-blue-300 rounded px-1 py-0.5 flex-1'
            value={circuit.name}
            onChange={(e) => updateCircuit(distroId, circuit.id, { name: e.target.value })}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => e.key === 'Enter' && setEditing(false)}
          />
        ) : (
          <button onClick={() => setEditing(true)} className='text-xs text-gray-700 hover:text-blue-600 flex-1 text-left font-mono font-semibold'>
            {circuit.name}
          </button>
        )}
        <span className='text-xs text-gray-400 shrink-0 font-mono'>{phaseLabel(circuit.phase)}</span>
        <span className='text-xs text-gray-400 shrink-0'>{circuit.rating}A</span>
        <button onClick={() => deleteCircuit(distroId, circuit.id)} className='text-gray-200 hover:text-red-400 transition-colors shrink-0'>
          <Trash2 size={10} />
        </button>
      </div>
      <div className='mt-0.5'>
        <LoadBar loadW={load} capacityW={capacity} />
        <div className='flex items-center justify-between text-xs text-gray-400 mt-0.5'>
          <span>{load.toFixed(0)}W / {capacity.toFixed(0)}W</span>
          {assignedFixtures.length > 0 && (
            <span className='text-gray-500'>{assignedFixtures.length} fixture{assignedFixtures.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
    </div>
  )
}

function DistroCard({ distro }: { distro: Distro }) {
  const { project, updateDistro, deleteDistro, addCircuit } = useProjectStore()
  const fixtures = project?.fixtures ?? []
  const allDistros = project?.distros ?? []
  const elements = project?.elements ?? []
  const [expanded, setExpanded] = useState(true)

  const placeOnCanvas = (e: React.MouseEvent) => {
    e.stopPropagation()
    const centre = viewCentreWorld()
    updateDistro(distro.id, { x: centre.x, y: centre.y, layerId: 'power' })
    useProjectStore.getState().setSelectedIds([distro.id])
  }

  // Total load includes downstream distros connected via cables
  const totalLoad = computeDistroLoad(distro, allDistros, fixtures, elements)
  const directLoad = distro.circuits.reduce((sum, c) => sum + computeCircuitLoad(fixtures, c.id), 0)
  const downstreamLoad = totalLoad - directLoad
  // Capacity = sum of per-circuit capacities (correct for mixed-rating distros)
  const totalCapacity = distro.circuits.reduce((sum, c) => sum + circuitCapacityW(c), 0) || (distro.incomingRating * (distro.phases === 3 ? 3 * 230 : 230))

  const addCircuitWay = () => {
    const phase = ((distro.circuits.length % 3) + 1) as 1 | 2 | 3
    const idx = distro.circuits.length + 1
    const defaultRating = distro.circuits[0]?.rating ?? 16
    addCircuit(distro.id, { name: `C${idx}`, rating: defaultRating, voltage: 230, phase })
  }

  return (
    <div className='border border-gray-200 rounded-lg mb-2 overflow-hidden'>
      {/* Header */}
      <div className='flex items-center gap-1.5 p-2 bg-gray-50 cursor-pointer' onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown size={13} className='text-gray-400' /> : <ChevronRight size={13} className='text-gray-400' />}
        {/* Short ref identifier */}
        <input
          className='text-xs font-bold text-red-600 bg-white border border-gray-200 rounded w-8 text-center focus:outline-none focus:border-blue-400 shrink-0'
          value={distro.ref ?? ''}
          placeholder='A'
          onChange={(e) => updateDistro(distro.id, { ref: e.target.value || undefined })}
          onClick={(e) => e.stopPropagation()}
          title='Short distro reference (A, B, DSR…)'
        />
        <input
          className='text-xs font-semibold text-gray-800 bg-transparent flex-1 focus:outline-none min-w-0'
          value={distro.name}
          onChange={(e) => updateDistro(distro.id, { name: e.target.value })}
          onClick={(e) => e.stopPropagation()}
        />
        <span className='text-xs text-gray-400 shrink-0 font-mono'>{distro.incomingRating}A {distro.phases}Ø</span>
        <button
          onClick={placeOnCanvas}
          className={cn('transition-colors shrink-0', distro.x !== undefined ? 'text-green-500 hover:text-green-700' : 'text-blue-400 hover:text-blue-600')}
          title={distro.x !== undefined ? 'Re-place on canvas' : 'Place on canvas'}
        >
          <MapPin size={12} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete "${distro.name}"?`)) deleteDistro(distro.id) }} className='text-gray-300 hover:text-red-400 transition-colors'>
          <Trash2 size={12} />
        </button>
      </div>

      {expanded && (
        <div className='p-2'>
          {/* Summary load bar */}
          {distro.circuits.length > 0 && (
            <div className='mb-2 bg-gray-50 rounded px-2 py-1.5'>
              <LoadBar loadW={totalLoad} capacityW={totalCapacity} />
              <div className='flex justify-between text-xs text-gray-400 mt-0.5'>
                <span>{totalLoad.toFixed(0)}W / {totalCapacity.toFixed(0)}W</span>
                <span>{distro.circuits.length} circuit{distro.circuits.length !== 1 ? 's' : ''}</span>
              </div>
              {downstreamLoad > 0 && (
                <div className='text-xs text-blue-500 mt-0.5'>
                  ↳ {directLoad.toFixed(0)}W direct + {downstreamLoad.toFixed(0)}W downstream
                </div>
              )}
            </div>
          )}

          {distro.circuits.length === 0 && (
            <div className='text-xs text-gray-400 text-center py-2'>No circuits — add one below</div>
          )}

          {distro.circuits.map((c) => (
            <CircuitRow key={c.id} circuit={c} distroId={distro.id} fixtures={fixtures} />
          ))}

          <button
            onClick={addCircuitWay}
            className='mt-1 ml-3 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors'
          >
            <Plus size={11} /> Add circuit
          </button>
        </div>
      )}
    </div>
  )
}

function PhaseBalance({ project }: { project: Project }) {
  if (!project) return null
  const fixtures = project.fixtures
  // Total watts per phase across all distro circuits
  const byPhase: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 }
  const capByPhase: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 }
  for (const d of project.distros) {
    for (const c of d.circuits) {
      const load = computeCircuitLoad(fixtures, c.id)
      const cap = circuitCapacityW(c)
      byPhase[c.phase] += load
      capByPhase[c.phase] += cap
    }
  }
  const hasAny = Object.values(capByPhase).some((v) => v > 0)
  if (!hasAny) return null
  return (
    <div className='p-2 border-t border-gray-200'>
      <div className='text-xs font-semibold text-gray-600 mb-2'>Phase Balance</div>
      {([1, 2, 3] as const).map((ph) => {
        if (capByPhase[ph] === 0) return null
        const pct = Math.min(100, (byPhase[ph] / capByPhase[ph]) * 100)
        const color = pct > 90 ? 'bg-red-500' : pct > 75 ? 'bg-amber-400' : 'bg-green-500'
        return (
          <div key={ph} className='mb-1.5'>
            <div className='flex items-center justify-between text-xs text-gray-500 mb-0.5'>
              <span className='font-mono font-semibold'>L{ph}</span>
              <span>{(byPhase[ph] / 1000).toFixed(1)}kW / {(capByPhase[ph] / 1000).toFixed(1)}kW</span>
            </div>
            <div className='h-1.5 bg-gray-200 rounded-full overflow-hidden'>
              <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface CustomForm {
  name: string
  incomingRating: number
  phases: 1 | 3
  circuitCount: number
  circuitRating: number
}

function CustomDistroModal({ onAdd, onClose }: { onAdd: (f: CustomForm) => void; onClose: () => void }) {
  const [form, setForm] = useState<CustomForm>({ name: 'Custom Distro', incomingRating: 63, phases: 3, circuitCount: 6, circuitRating: 16 })
  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40' onClick={onClose}>
      <div className='bg-white rounded-xl shadow-2xl p-5 w-72 flex flex-col gap-3' onClick={(e) => e.stopPropagation()}>
        <div className='text-sm font-semibold text-gray-800'>Custom Distro</div>

        <div className='flex flex-col gap-0.5'>
          <label className='text-xs text-gray-500'>Name</label>
          <input className='text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500' value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>

        <div className='grid grid-cols-2 gap-2'>
          <div className='flex flex-col gap-0.5'>
            <label className='text-xs text-gray-500'>Incoming (A)</label>
            <input type='number' min={1} className='text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500' value={form.incomingRating} onChange={(e) => setForm({ ...form, incomingRating: parseInt(e.target.value) || 32 })} />
          </div>
          <div className='flex flex-col gap-0.5'>
            <label className='text-xs text-gray-500'>Phases</label>
            <select className='text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500' value={form.phases} onChange={(e) => setForm({ ...form, phases: parseInt(e.target.value) as 1 | 3 })}>
              <option value={1}>1Ø Single</option>
              <option value={3}>3Ø Three</option>
            </select>
          </div>
        </div>

        <div className='grid grid-cols-2 gap-2'>
          <div className='flex flex-col gap-0.5'>
            <label className='text-xs text-gray-500'>Circuits</label>
            <input type='number' min={1} max={48} className='text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500' value={form.circuitCount} onChange={(e) => setForm({ ...form, circuitCount: parseInt(e.target.value) || 6 })} />
          </div>
          <div className='flex flex-col gap-0.5'>
            <label className='text-xs text-gray-500'>Circuit rating (A)</label>
            <input type='number' min={1} className='text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500' value={form.circuitRating} onChange={(e) => setForm({ ...form, circuitRating: parseInt(e.target.value) || 16 })} />
          </div>
        </div>

        <div className='flex gap-2 pt-1'>
          <button onClick={onClose} className='flex-1 text-sm py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors'>Cancel</button>
          <button onClick={() => { onAdd(form); onClose() }} className='flex-1 text-sm py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium'>Add</button>
        </div>
      </div>
    </div>
  )
}

export default function CircuitPanel() {
  const { project, addDistro } = useProjectStore()
  const [showPresets, setShowPresets] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  if (!project) return null

  const handlePreset = (presetLabel: string) => {
    if (presetLabel === 'Custom') { setShowPresets(false); setShowCustom(true); return }
    const p = DISTRO_PRESETS.find((x) => x.label === presetLabel)
    if (!p) return
    addDistro({
      name: p.name,
      incomingRating: p.incomingRating,
      phases: p.phases,
      circuits: p.circuits as Circuit[],
    })
    setShowPresets(false)
  }

  const handleCustomAdd = (f: CustomForm) => {
    const circuits: Circuit[] = Array.from({ length: f.circuitCount }, (_, i) => ({
      id: generateId(),
      name: `C${i + 1}`,
      rating: f.circuitRating,
      voltage: 230,
      phase: f.phases === 3 ? ((i % 3 + 1) as 1 | 2 | 3) : (1 as 1 | 2 | 3),
    }))
    addDistro({ name: f.name, incomingRating: f.incomingRating, phases: f.phases, circuits })
  }

  return (
    <div className='flex flex-col h-full'>
      {showCustom && <CustomDistroModal onAdd={handleCustomAdd} onClose={() => setShowCustom(false)} />}
      <div className='p-2 border-b border-gray-200 flex items-center justify-between shrink-0'>
        <span className='text-xs font-semibold text-gray-600'>Power & Circuits</span>
        <div className='relative'>
          <button
            onClick={() => setShowPresets(!showPresets)}
            className='flex items-center gap-1 text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 transition-colors'
          >
            <Plus size={11} /> Add distro
          </button>
          {showPresets && (
            <div className='absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 w-56 py-1 max-h-72 overflow-y-auto'>
              {DISTRO_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => handlePreset(p.label)}
                  className='w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors'
                >
                  <div className='font-medium'>{p.label}</div>
                  {p.circuits.length > 0 && (
                    <div className='text-gray-400'>{p.circuits.length} ways pre-configured</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {showPresets && (
        <div className='fixed inset-0 z-40' onClick={() => setShowPresets(false)} />
      )}

      <div className='flex-1 overflow-y-auto p-2'>
        {project.distros.length === 0 && (
          <div className='text-center text-xs text-gray-400 mt-8 leading-relaxed'>
            No power distros yet.<br />
            Add one to start tracking circuits<br />and power allocation.
          </div>
        )}
        {project.distros.map((d) => <DistroCard key={d.id} distro={d} />)}
      </div>
      <PhaseBalance project={project} />
    </div>
  )
}
