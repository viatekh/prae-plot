import { useEffect, useRef, useState } from 'react'
import {
  AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal,
  AlignEndHorizontal, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
} from 'lucide-react'
import { useProjectStore, computeCircuitLoad, circuitCapacityW, formatCircuitRef, findAddressConflicts, computeDistroLoad } from '../../store/projectStore'
import type { AnyElement, PlacedFixture, RectElement, EllipseElement, TrussElement, TextElement, CableElement, CableType, Distro, Device } from '../../types'
import { CABLE_COLORS, CABLE_LABELS, CABLE_GROUPS, DEFAULT_TEXT_CM, isFreeform } from '../../types'
import { cableLength } from '../../lib/utils'
import { resolvePositions } from '../../lib/positions'

/** Rounds for display without forcing trailing zeros, which eat the caret. */
function num(v: number, dp = 2): number {
  const f = 10 ** dp
  return Math.round(v * f) / f
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='flex flex-col gap-0.5'>
      <label className='text-xs text-gray-500 font-medium'>{label}</label>
      {children}
    </div>
  )
}

function Input({ value, onChange, type = 'text', autoFocus, placeholder }: {
  value: string | number; onChange: (v: string) => void; type?: string; autoFocus?: boolean; placeholder?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!autoFocus) return
    ref.current?.focus()
    ref.current?.select()
  }, [autoFocus])
  return (
    <input
      ref={ref}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className='w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500'
    />
  )
}

function Select({ value, onChange, children }: { value: string | number; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className='w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500'
    >
      {children}
    </select>
  )
}

/** What hangs on a truss, and which end its unit numbers start from. */
function TrussPosition({ truss }: { truss: TrussElement }) {
  const { project, updateElement, setSelectedIds } = useProjectStore()
  if (!project) return null
  const position = resolvePositions(project).positions.find((p) => p.id === truss.id)
  const count = position?.fixtures.length ?? 0
  const kg = position?.fixtures.reduce((s, f) => s + f.weight, 0) ?? 0
  const kw = (position?.fixtures.reduce((s, f) => s + f.powerRating, 0) ?? 0) / 1000
  return (
    <div className='bg-gray-50 border border-gray-200 rounded px-2.5 py-2 text-xs text-gray-600 flex flex-col gap-1.5'>
      {count === 0 ? (
        <span className='text-gray-400'>Nothing hangs here yet. Drop fixtures onto the truss and they join this position.</span>
      ) : (
        <div className='flex items-center justify-between gap-2'>
          <span><span className='font-semibold text-gray-800'>{count}</span> unit{count !== 1 ? 's' : ''} · {kg.toFixed(1)} kg · {kw.toFixed(1)} kW</span>
          <button className='text-blue-600 hover:text-blue-800 shrink-0' onClick={() => setSelectedIds(position!.fixtures.map((f) => f.id))}>
            Select them
          </button>
        </div>
      )}
      <label className='flex items-center gap-2 cursor-pointer'>
        <input
          type='checkbox' className='rounded accent-blue-600' checked={!!truss.numberFromEnd}
          onChange={(e) => updateElement(truss.id, { numberFromEnd: e.target.checked } as Partial<AnyElement>)}
        />
        Number units from the other end
      </label>
    </div>
  )
}

/** Where a fixture hangs — worked out from where it sits, never typed in. */
function FixturePositionBadge({ fixture }: { fixture: PlacedFixture }) {
  const project = useProjectStore((s) => s.project)
  if (!project) return null
  const pos = resolvePositions(project).byFixture.get(fixture.id)
  if (!pos?.positionId) {
    if (!project.elements.some((e) => e.type === 'truss')) return null
    return <div className='text-xs text-gray-400'>Not on a position — drag it onto a truss to hang it there.</div>
  }
  return (
    <div className='flex items-center gap-2 text-xs'>
      <span className='font-semibold text-gray-800 bg-gray-100 rounded px-1.5 py-0.5'>{pos.position}</span>
      <span className='text-gray-500'>unit {pos.unit}</span>
    </div>
  )
}

/** Edits applied to every selected fixture at once. */
function BulkFixtureEdit({ fixtures }: { fixtures: PlacedFixture[] }) {
  const { updateFixture, project } = useProjectStore()
  const [startChannel, setStartChannel] = useState('')
  if (fixtures.length < 2 || !project) return null

  /** The shared value, or '' when the selection disagrees. */
  const shared = (pick: (f: PlacedFixture) => string) => {
    const first = pick(fixtures[0])
    return fixtures.every((f) => pick(f) === first) ? first : ''
  }
  const setAll = (updates: Partial<PlacedFixture>) => { for (const f of fixtures) updateFixture(f.id, updates) }
  const mixed = (pick: (f: PlacedFixture) => string) => (shared(pick) === '' && fixtures.some((f) => pick(f) !== '') ? 'Mixed' : '')

  // Renumber in hang order: position by position along each truss, then the rest.
  const renumber = () => {
    const start = parseInt(startChannel)
    if (isNaN(start) || start < 1) return
    const { positions, loose } = resolvePositions(project)
    const ids = new Set(fixtures.map((f) => f.id))
    const ordered = [...positions.flatMap((p) => p.fixtures), ...loose].filter((f) => ids.has(f.id))
    ordered.forEach((f, i) => updateFixture(f.id, { channel: start + i }))
    setStartChannel('')
  }

  return (
    <div className='flex flex-col gap-2.5 border-t border-gray-100 pt-3'>
      <div className='text-xs text-gray-400 font-medium uppercase tracking-wide'>Edit {fixtures.length} fixtures</div>
      <Field label='Purpose'>
        <Input value={shared((f) => f.purpose ?? '')} placeholder={mixed((f) => f.purpose ?? '')} onChange={(v) => setAll({ purpose: v })} />
      </Field>
      <div className='grid grid-cols-2 gap-2'>
        <Field label='Colour / Gel'>
          <Input value={shared((f) => f.color ?? '')} placeholder={mixed((f) => f.color ?? '')} onChange={(v) => setAll({ color: v })} />
        </Field>
        <Field label='Rotation (°)'>
          <Input type='number' value={shared((f) => String(num(f.rotation, 1)))} placeholder='Mixed' onChange={(v) => setAll({ rotation: parseFloat(v) || 0 })} />
        </Field>
      </div>
      <Field label='Layer'>
        <Select value={shared((f) => f.layerId ?? '')} onChange={(v) => { if (v) setAll({ layerId: v }) }}>
          <option value=''>— Mixed —</option>
          {project.layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
      </Field>
      <Field label='Renumber channels from'>
        <div className='flex gap-1.5'>
          <Input type='number' value={startChannel} placeholder='e.g. 101' onChange={setStartChannel} />
          <button
            onClick={renumber}
            disabled={!startChannel}
            className='shrink-0 px-2.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors'
          >
            Renumber
          </button>
        </div>
        <div className='text-[11px] text-gray-400 mt-1 leading-snug'>Numbered in hang order — along each truss, position by position.</div>
      </Field>
    </div>
  )
}

function ElementProperties({ el }: { el: AnyElement }) {
  const { updateElement, project, labelDraftId, setLabelDraftId } = useProjectStore()
  // In a freeform plot the coordinates are arbitrary units, so nothing is
  // labelled in metres and nothing derived from the geometry is shown.
  const freeform = isFreeform(project)
  const unit = freeform ? '' : ' (m)'
  const upd = (updates: Partial<AnyElement>) => updateElement(el.id, updates)

  // A shape drawn on the canvas arrives here with its label field focused, so
  // you can name it without reaching for the mouse again.
  const namingThis = labelDraftId === el.id
  useEffect(() => {
    if (namingThis) setLabelDraftId(null)
  }, [namingThis, setLabelDraftId])
  const allFixtures = project?.fixtures ?? []
  const allDistros = project?.distros ?? []
  const allDevices = project?.devices ?? []
  const resolveName = (id?: string) => {
    if (!id) return null
    const fx = allFixtures.find((f) => f.id === id)
    if (fx) return `CH${fx.channel} ${fx.model}`
    const dx = allDistros.find((d) => d.id === id)
    if (dx) return `Distro: ${dx.ref ?? dx.name}`
    const dv = allDevices.find((d) => d.id === id)
    if (dv) return `${dv.name}`
    return null
  }

  return (
    <div className='flex flex-col gap-3'>
      <div className='text-xs font-semibold text-gray-400 uppercase tracking-wide'>
        {el.type.charAt(0).toUpperCase() + el.type.slice(1)}
      </div>

      <Field label='Label'>
        <Input
          value={el.label}
          onChange={(v) => upd({ label: v })}
          autoFocus={namingThis}
          placeholder={el.type === 'truss' ? 'Position name, e.g. FOH' : 'Name this shape'}
        />
      </Field>

      {el.type === 'rect' && (
        <div className='grid grid-cols-2 gap-2'>
          <Field label={`W${unit}`}>
            <Input type='number' value={num((el as RectElement).width)} onChange={(v) => upd({ width: parseFloat(v) || 1 } as Partial<RectElement>)} />
          </Field>
          <Field label={`H${unit}`}>
            <Input type='number' value={num((el as RectElement).height)} onChange={(v) => upd({ height: parseFloat(v) || 1 } as Partial<RectElement>)} />
          </Field>
        </div>
      )}
      {el.type === 'ellipse' && (
        <div className='grid grid-cols-2 gap-2'>
          <Field label={`Radius X${unit}`}>
            <Input type='number' value={num((el as EllipseElement).radiusX)} onChange={(v) => upd({ radiusX: parseFloat(v) || 1 } as Partial<EllipseElement>)} />
          </Field>
          <Field label={`Radius Y${unit}`}>
            <Input type='number' value={num((el as EllipseElement).radiusY)} onChange={(v) => upd({ radiusY: parseFloat(v) || 1 } as Partial<EllipseElement>)} />
          </Field>
        </div>
      )}

      {el.type === 'truss' && (<>
        <div className='grid grid-cols-2 gap-2'>
          <Field label={`End X${unit}`}>
            <Input type='number' value={num((el as TrussElement).x2)} onChange={(v) => upd({ x2: parseFloat(v) || 0 } as Partial<TrussElement>)} />
          </Field>
          <Field label={`End Y${unit}`}>
            <Input type='number' value={num((el as TrussElement).y2)} onChange={(v) => upd({ y2: parseFloat(v) || 0 } as Partial<TrussElement>)} />
          </Field>
        </div>
        <Field label='Trim height (m)'>
          <Input
            type='number' placeholder='Height above the deck'
            value={(el as TrussElement).trim ?? ''}
            onChange={(v) => upd({ trim: v === '' || isNaN(parseFloat(v)) ? undefined : parseFloat(v) } as Partial<TrussElement>)}
          />
        </Field>
        <TrussPosition truss={el as TrussElement} />
      </>)}

      {el.type === 'cable' && (
        <>
          <div className='flex items-center gap-2'>
            <span className='text-xs font-mono font-bold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded'>
              {(el as CableElement).autoLabel ?? '—'}
            </span>
            <span className='flex items-center gap-1.5 text-xs text-gray-500'>
              <span className='w-2.5 h-2.5 rounded-full shrink-0' style={{ background: CABLE_COLORS[(el as CableElement).cableType] ?? '#9ca3af' }} />
              {CABLE_LABELS[(el as CableElement).cableType] ?? (el as CableElement).cableType}
            </span>
          </div>
          <Field label='Annotation (shown on plot)'>
            <Input value={(el as CableElement).annotation ?? ''} onChange={(v) => upd({ annotation: v } as Partial<CableElement>)} />
          </Field>
          <Field label='Cable Type'>
            <Select
              value={(el as CableElement).cableType}
              onChange={(v) => upd({ cableType: v as CableType } as Partial<CableElement>)}
            >
              {CABLE_GROUPS.map((grp) => (
                <optgroup key={grp.label} label={grp.label}>
                  {grp.types.map((t) => (
                    <option key={t} value={t}>{CABLE_LABELS[t]}</option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
          <div className='grid grid-cols-2 gap-2'>
            <Field label={`End X${unit}`}>
              <Input type='number' value={num((el as CableElement).x2)} onChange={(v) => upd({ x2: parseFloat(v) || 0 } as Partial<CableElement>)} />
            </Field>
            <Field label={`End Y${unit}`}>
              <Input type='number' value={num((el as CableElement).y2)} onChange={(v) => upd({ y2: parseFloat(v) || 0 } as Partial<CableElement>)} />
            </Field>
          </div>
          {!freeform && (() => {
            const ce = el as CableElement
            const drawn = cableLength({ ...ce, manualLength: undefined })
            const segs = (ce.waypoints?.length ?? 0) + 1
            return (
              <div className='text-xs text-gray-500 bg-gray-50 rounded px-2 py-1.5 space-y-0.5'>
                <div>Drawn: {drawn.toFixed(2)}m{segs > 1 ? ` · ${segs} segs` : ''}</div>
                {ce.manualLength != null && <div className='text-blue-600 font-semibold'>Override: {ce.manualLength.toFixed(2)}m</div>}
              </div>
            )
          })()}
          <Field label={freeform ? 'Cable length (m)' : 'Manual length override (m)'}>
            <div className='flex items-center gap-1.5'>
              <Input
                type='number'
                value={(el as CableElement).manualLength ?? ''}
                onChange={(v) => upd({ manualLength: v === '' ? undefined : Math.max(0, parseFloat(v) || 0) } as Partial<CableElement>)}
              />
              {(el as CableElement).manualLength != null && (
                <button
                  className='text-xs text-gray-400 hover:text-red-500 transition-colors shrink-0'
                  onClick={() => upd({ manualLength: undefined } as Partial<CableElement>)}
                  title='Clear override'
                >✕</button>
              )}
            </div>
          </Field>
          {/* Connection info */}
          {(() => {
            const ce = el as CableElement
            const from = resolveName(ce.startConnectedTo)
            const to = resolveName(ce.endConnectedTo)
            if (!from && !to) return null
            return (
              <div className='text-xs bg-green-50 border border-green-200 rounded px-2 py-1.5 flex flex-col gap-0.5'>
                {from && <span><span className='text-green-600 font-medium'>From:</span> {from}</span>}
                {to   && <span><span className='text-green-600 font-medium'>To:</span> {to}</span>}
              </div>
            )
          })()}
        </>
      )}

      {el.type === 'text' && (
        <>
          <Field label='Text'>
            <textarea
              className='w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none'
              rows={2}
              value={(el as TextElement).text}
              onChange={(e) => upd({ text: e.target.value } as Partial<TextElement>)}
            />
          </Field>
          <Field label='Text height (cm)'>
            <Input type='number' value={(el as TextElement).fontSize} onChange={(v) => upd({ fontSize: Math.max(2, parseInt(v) || DEFAULT_TEXT_CM) } as Partial<TextElement>)} />
          </Field>
        </>
      )}

      {el.type !== 'truss' && el.type !== 'cable' && (
        <Field label='Rotation (°)'>
          <Input type='number' value={num(el.rotation, 1)} onChange={(v) => upd({ rotation: parseFloat(v) || 0 })} />
        </Field>
      )}

      {el.type !== 'text' && el.type !== 'cable' && (
        <div className='flex flex-col gap-2'>
          <div className='grid grid-cols-2 gap-2'>
            <Field label='Fill'>
              <div className='flex items-center gap-1'>
                <input
                  type='color'
                  value={el.fill === '' || el.fill === 'transparent' ? '#d1d5db' : (el.fill || '#d1d5db')}
                  onChange={(e) => upd({ fill: e.target.value })}
                  disabled={el.fill === '' || el.fill === 'transparent'}
                  className='flex-1 h-7 rounded cursor-pointer border border-gray-200 disabled:opacity-30'
                />
                <button
                  onClick={() => upd({ fill: el.fill === '' || el.fill === 'transparent' ? '#d1d5db' : '' })}
                  className={`w-7 h-7 rounded border text-xs font-bold flex items-center justify-center transition-colors ${el.fill === '' || el.fill === 'transparent' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-400 hover:border-gray-400'}`}
                  title='Transparent / no fill'
                >∅</button>
              </div>
            </Field>
            <Field label='Stroke'>
              <input type='color' value={el.stroke || '#374151'} onChange={(e) => upd({ stroke: e.target.value })} className='w-full h-7 rounded cursor-pointer border border-gray-200' />
            </Field>
          </div>
        </div>
      )}

      <label className='flex items-center gap-2 text-sm text-gray-600 cursor-pointer'>
        <input type='checkbox' checked={el.locked} onChange={(e) => upd({ locked: e.target.checked })} />
        Locked
      </label>
    </div>
  )
}

function FixtureProperties({ fixture }: { fixture: PlacedFixture }) {
  const { updateFixture, autoRepatch, project: proj } = useProjectStore()
  const upd = (updates: Partial<PlacedFixture>) => updateFixture(fixture.id, updates)
  const distros = proj?.distros ?? []
  const allCircuits = distros.flatMap((d) => d.circuits.map((c) => ({ ...c, distroId: d.id })))

  // Conflict check for this fixture
  const allFixtures = proj?.fixtures ?? []
  const conflicts = findAddressConflicts(allFixtures).filter((msg) =>
    msg.includes(`CH${fixture.channel}`)
  )

  return (
    <div className='flex flex-col gap-3'>
      <div className='text-xs font-semibold text-gray-400 uppercase tracking-wide'>Fixture</div>
      <div className='text-sm font-medium text-gray-800'>{fixture.manufacturer} {fixture.model}</div>
      <div className='flex flex-wrap gap-1.5 text-xs text-gray-500'>
        {fixture.powerRating > 0 && <span>{fixture.powerRating}W</span>}
        {fixture.weight > 0 && <span>{fixture.weight}kg</span>}
      </div>

      <Field label='ID (CH)'>
        <Input type='number' value={fixture.channel} onChange={(v) => upd({ channel: parseInt(v) || 0 })} />
      </Field>

      <FixturePositionBadge fixture={fixture} />

      <Field label='Purpose'>
        <Input value={fixture.purpose ?? ''} onChange={(v) => upd({ purpose: v })} placeholder='e.g. Front wash, DS special' />
      </Field>

      <Field label='Label'>
        <Input value={fixture.label} onChange={(v) => upd({ label: v })} placeholder='Free note printed under the fixture' />
      </Field>

      <div className='grid grid-cols-2 gap-2'>
        <Field label='Universe'>
          <Input type='number' value={fixture.universe} onChange={(v) => upd({ universe: parseInt(v) || 1 })} />
        </Field>
        <Field label='Address'>
          {/* A running number past 512 carries into the universe: 613 is 2.101. */}
          <Input type='number' value={fixture.address} onChange={(v) => {
            const n = Math.max(1, parseInt(v) || 1)
            upd(n > 512 ? { universe: Math.floor((n - 1) / 512) + 1, address: ((n - 1) % 512) + 1 } : { address: n })
          }} />
        </Field>
      </div>

      <div className='text-xs text-gray-500 bg-gray-50 rounded px-2 py-1 flex items-center justify-between gap-2'>
        <span>Patch: <span className='font-mono font-semibold text-gray-700'>{fixture.universe}.{String(fixture.address).padStart(3, '0')}</span>
        {fixture.channelCount > 0 && <span className='ml-2'>({fixture.channelCount} ch)</span>}</span>
        <button
          onClick={() => autoRepatch([fixture.id])}
          className='text-xs text-blue-600 hover:text-blue-800 hover:underline shrink-0'
          title='Repack this fixture into the first free slot on its own universe'
        >Re-address</button>
      </div>

      {conflicts.length > 0 && (
        <div className='flex flex-col gap-1'>
          {conflicts.map((msg, i) => (
            <div key={i} className='flex items-start gap-1.5 text-xs text-red-600 bg-red-50 rounded px-2 py-1.5'>
              <span className='shrink-0'>⚠</span>
              <span>{msg}</span>
            </div>
          ))}
        </div>
      )}

      <Field label='Mode'>
        {fixture.availableModes && fixture.availableModes.length > 1 ? (
          <Select
            value={fixture.mode}
            onChange={(v) => {
              const m = fixture.availableModes.find((m) => m.name === v)
              upd({ mode: v, channelCount: m?.channelCount ?? fixture.channelCount })
            }}
          >
            {fixture.availableModes.map((m) => (
              <option key={m.name} value={m.name}>{m.name} ({m.channelCount} ch)</option>
            ))}
          </Select>
        ) : (
          <Input value={fixture.mode} onChange={(v) => upd({ mode: v })} />
        )}
      </Field>

      <Field label='Circuit'>
        <Select
          value={fixture.circuitId ?? ''}
          onChange={(v) => upd({ circuitId: v || undefined })}
        >
          <option value=''>— Unassigned —</option>
          {allCircuits.map((c) => {
            const load = computeCircuitLoad(proj?.fixtures ?? [], c.id)
            const cap = circuitCapacityW(c)
            const contribution = fixture.circuitId === c.id ? fixture.powerRating : 0
            const remaining = cap - load + contribution
            const overload = fixture.powerRating > remaining
            return (
              <option key={c.id} value={c.id}>
                {formatCircuitRef(distros, c.id)} — {remaining.toFixed(0)}W free{overload ? ' ⚠' : ''}
              </option>
            )
          })}
        </Select>
      </Field>

      <div className='grid grid-cols-2 gap-2'>
        <Field label='Weight (kg)'>
          <Input type='number' value={fixture.weight} onChange={(v) => upd({ weight: parseFloat(v) || 0 })} />
        </Field>
        <Field label='Power (W)'>
          <Input type='number' value={fixture.powerRating} onChange={(v) => upd({ powerRating: parseFloat(v) || 0 })} />
        </Field>
      </div>
      {(() => {
        const sameModel = allFixtures.filter((f) => f.id !== fixture.id && f.manufacturer === fixture.manufacturer && f.model === fixture.model)
        if (sameModel.length === 0) return null
        return (
          <button
            className='text-xs text-blue-600 hover:text-blue-800 hover:underline text-left'
            onClick={() => {
              const { updateFixture, updateGDTFFixtureType, gdtfLibrary } = useProjectStore.getState()
              sameModel.forEach((f) => updateFixture(f.id, { weight: fixture.weight, powerRating: fixture.powerRating }))
              // Also persist to GDTF library so future placements use these values
              const libEntry = gdtfLibrary.find((ft) => ft.manufacturer === fixture.manufacturer && ft.name === fixture.model)
              if (libEntry) updateGDTFFixtureType(libEntry.id, { weight: fixture.weight, powerConsumption: fixture.powerRating })
            }}
          >
            Apply weight &amp; power to all {sameModel.length + 1} × {fixture.model} &amp; save to library
          </button>
        )
      })()}

      <Field label='Colour / Gel'>
        <Input value={fixture.color} onChange={(v) => upd({ color: v })} />
      </Field>

      <Field label='Rotation (°)'>
        <Input type='number' value={num(fixture.rotation, 1)} onChange={(v) => upd({ rotation: parseFloat(v) || 0 })} />
      </Field>

      <Field label='Notes'>
        <textarea
          className='w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none'
          rows={2}
          value={fixture.notes}
          onChange={(e) => upd({ notes: e.target.value })}
        />
      </Field>
    </div>
  )
}

const DEVICE_CATEGORY_LABELS: Record<string, string> = {
  'console': 'Lighting Console', 'dimmer-rack': 'Dimmer Rack',
  'media-server': 'Media Server', 'network-switch': 'Network Switch',
  'dmx-splitter': 'DMX Splitter / Y-Split', 'power-splitter': 'Power Y-Split / T-Split',
  'amplifier': 'Amplifier', 'other': 'Other Device',
}

function DeviceProperties({ device }: { device: Device }) {
  const { updateDevice } = useProjectStore()
  const upd = (u: Partial<Device>) => updateDevice(device.id, u)
  return (
    <div className='flex flex-col gap-3'>
      <div className='text-xs font-semibold text-gray-400 uppercase tracking-wide'>Device</div>
      <div className='text-xs text-gray-500'>{DEVICE_CATEGORY_LABELS[device.category] ?? device.category}</div>

      <Field label='Name'>
        <Input value={device.name} onChange={(v) => upd({ name: v })} />
      </Field>
      <Field label='Category'>
        <select value={device.category} onChange={(e) => upd({ category: e.target.value as Device['category'] })}
          className='w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500'>
          {Object.entries(DEVICE_CATEGORY_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <div className='grid grid-cols-2 gap-2'>
        <Field label='Manufacturer'>
          <Input value={device.manufacturer ?? ''} onChange={(v) => upd({ manufacturer: v || undefined })} />
        </Field>
        <Field label='Model'>
          <Input value={device.model ?? ''} onChange={(v) => upd({ model: v || undefined })} />
        </Field>
      </div>
      {(device.category === 'console' || device.category === 'dmx-splitter') && (
        <Field label='DMX Universes'>
          <Input type='number' value={device.universeCount ?? 1} onChange={(v) => upd({ universeCount: parseInt(v) || 1 })} />
        </Field>
      )}
      <div className='grid grid-cols-2 gap-2'>
        <Field label='Power (W)'>
          <Input type='number' value={device.powerRating ?? 0} onChange={(v) => upd({ powerRating: parseFloat(v) || 0 })} />
        </Field>
        <Field label='Weight (kg)'>
          <Input type='number' value={device.weight ?? 0} onChange={(v) => upd({ weight: parseFloat(v) || 0 })} />
        </Field>
      </div>
      <Field label='Notes'>
        <textarea className='w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none' rows={2}
          value={device.notes ?? ''} onChange={(e) => upd({ notes: e.target.value || undefined })} />
      </Field>
    </div>
  )
}

function DistroProperties({ distro }: { distro: Distro }) {
  const { updateDistro, project } = useProjectStore()
  const upd = (updates: Partial<Distro>) => updateDistro(distro.id, updates)
  const allDistros = project?.distros ?? []
  const allFixtures = project?.fixtures ?? []
  const allElements = project?.elements ?? []

  const totalLoad = computeDistroLoad(distro, allDistros, allFixtures, allElements, new Set())
  const directLoad = distro.circuits.reduce((s, c) => {
    return s + allFixtures.filter((f) => f.circuitId === c.id).reduce((ss, f) => ss + f.powerRating, 0)
  }, 0)
  const downstreamLoad = totalLoad - directLoad

  return (
    <div className='flex flex-col gap-3'>
      <div className='text-xs font-semibold text-gray-400 uppercase tracking-wide'>Distro</div>

      <div className='flex items-center gap-2'>
        {distro.ref && (
          <span className='bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded font-mono'>{distro.ref}</span>
        )}
        <span className='text-sm font-medium text-gray-800'>{distro.name}</span>
      </div>

      <Field label='Name'>
        <Input value={distro.name} onChange={(v) => upd({ name: v })} />
      </Field>

      <div className='grid grid-cols-2 gap-2'>
        <Field label='Incoming (A)'>
          <Input type='number' value={distro.incomingRating} onChange={(v) => upd({ incomingRating: parseFloat(v) || 32 })} />
        </Field>
        <Field label='Phases'>
          <select
            value={distro.phases}
            onChange={(e) => upd({ phases: parseInt(e.target.value) as 1 | 3 })}
            className='w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500'
          >
            <option value={1}>1Ø Single</option>
            <option value={3}>3Ø Three</option>
          </select>
        </Field>
      </div>

      <div className='text-xs bg-gray-50 border border-gray-200 rounded px-2 py-2 flex flex-col gap-1'>
        <div className='flex justify-between'>
          <span className='text-gray-500'>Circuits</span>
          <span className='font-mono font-semibold text-gray-700'>{distro.circuits.length}</span>
        </div>
        <div className='flex justify-between'>
          <span className='text-gray-500'>Capacity</span>
          <span className='font-mono text-gray-700'>{distro.incomingRating}A · {distro.phases}Ø · {(distro.incomingRating * distro.phases * 230 / 1000).toFixed(1)} kW</span>
        </div>
      </div>

      {totalLoad > 0 && (
        <div className='text-xs bg-amber-50 border border-amber-200 rounded px-2 py-2 flex flex-col gap-1'>
          <div className='flex justify-between font-semibold'>
            <span className='text-amber-700'>Total Load</span>
            <span className='font-mono text-amber-800'>{(totalLoad / 1000).toFixed(2)} kW</span>
          </div>
          {downstreamLoad > 0 && <>
            <div className='flex justify-between text-gray-500'>
              <span>↳ Direct</span>
              <span className='font-mono'>{directLoad.toFixed(0)} W</span>
            </div>
            <div className='flex justify-between text-gray-500'>
              <span>↳ Downstream</span>
              <span className='font-mono'>{downstreamLoad.toFixed(0)} W</span>
            </div>
          </>}
          {totalLoad > distro.incomingRating * distro.phases * 230 && (
            <div className='text-red-600 font-medium mt-1'>⚠ Overloaded</div>
          )}
        </div>
      )}

      <div>
        <div className='text-xs text-gray-500 font-medium mb-1.5'>Circuits</div>
        <div className='flex flex-col gap-1'>
          {distro.circuits.map((c, i) => {
            const load = computeCircuitLoad(allFixtures, c.id)
            const cap = circuitCapacityW(c)
            const pct = cap > 0 ? Math.min(100, (load / cap) * 100) : 0
            return (
              <div key={c.id} className='text-xs bg-white border border-gray-200 rounded px-2 py-1.5'>
                <div className='flex justify-between mb-0.5'>
                  <span className='font-mono text-gray-600'>{distro.ref ? `${distro.ref}·` : ''}{i + 1}</span>
                  <span className='text-gray-500'>{load > 0 ? `${load.toFixed(0)}W` : '—'} / {cap.toFixed(0)}W</span>
                </div>
                {load > 0 && (
                  <div className='w-full h-1 bg-gray-100 rounded-full overflow-hidden'>
                    <div
                      className={`h-full rounded-full transition-all ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-400' : 'bg-green-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}


function AlignTools() {
  const { project, selectedIds, updateElement, updateFixture } = useProjectStore()
  if (!project || selectedIds.length < 2) return null
  const selFixtures = project.fixtures.filter((f) => selectedIds.includes(f.id))
  const selElements = project.elements.filter((e) => selectedIds.includes(e.id))
  const allX = [...selFixtures.map((f) => f.x), ...selElements.map((e) => e.x)]
  const allY = [...selFixtures.map((f) => f.y), ...selElements.map((e) => e.y)]
  if (allX.length === 0) return null

  const applyX = (newX: (id: string) => number) => {
    for (const f of selFixtures) updateFixture(f.id, { x: newX(f.id) })
    for (const e of selElements) updateElement(e.id, { x: newX(e.id) } as Partial<AnyElement>)
  }
  const applyY = (newY: (id: string) => number) => {
    for (const f of selFixtures) updateFixture(f.id, { y: newY(f.id) })
    for (const e of selElements) updateElement(e.id, { y: newY(e.id) } as Partial<AnyElement>)
  }

  const minX = Math.min(...allX), maxX = Math.max(...allX)
  const minY = Math.min(...allY), maxY = Math.max(...allY)
  const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2

  const btn = 'flex items-center justify-center text-xs text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded px-1 py-1 transition-colors'
  return (
    <div className='p-3 border-t border-gray-100 mt-2'>
      <div className='text-xs text-gray-400 font-medium mb-2 uppercase tracking-wide'>Align {selectedIds.length} items</div>
      <div className='grid grid-cols-6 gap-1 text-xs'>
        <button className={btn} onClick={() => applyX(() => minX)} title='Align left'><AlignStartVertical size={15} /></button>
        <button className={btn} onClick={() => applyX(() => midX)} title='Align centres (horizontal)'><AlignCenterVertical size={15} /></button>
        <button className={btn} onClick={() => applyX(() => maxX)} title='Align right'><AlignEndVertical size={15} /></button>
        <button className={btn} onClick={() => applyY(() => minY)} title='Align top'><AlignStartHorizontal size={15} /></button>
        <button className={btn} onClick={() => applyY(() => midY)} title='Align centres (vertical)'><AlignCenterHorizontal size={15} /></button>
        <button className={btn} onClick={() => applyY(() => maxY)} title='Align bottom'><AlignEndHorizontal size={15} /></button>
      </div>
      <div className='grid grid-cols-2 gap-1 mt-1'>
        <button className={btn}
          title='Space evenly horizontal'
          onClick={() => {
            if (selFixtures.length + selElements.length < 3) return
            const sorted = [...selFixtures.map(f=>({id:f.id,x:f.x,type:'f'})), ...selElements.map(e=>({id:e.id,x:e.x,type:'e'}))].sort((a,b)=>a.x-b.x)
            const step = (sorted[sorted.length-1].x - sorted[0].x) / (sorted.length - 1)
            sorted.forEach((item, i) => {
              if (item.type === 'f') updateFixture(item.id, { x: sorted[0].x + i * step })
              else updateElement(item.id, { x: sorted[0].x + i * step } as Partial<AnyElement>)
            })
          }}
        ><AlignHorizontalDistributeCenter size={15} className='mr-1.5' /> Space evenly</button>
        <button className={btn}
          title='Space evenly vertical'
          onClick={() => {
            if (selFixtures.length + selElements.length < 3) return
            const sorted = [...selFixtures.map(f=>({id:f.id,y:f.y,type:'f'})), ...selElements.map(e=>({id:e.id,y:e.y,type:'e'}))].sort((a,b)=>a.y-b.y)
            const step = (sorted[sorted.length-1].y - sorted[0].y) / (sorted.length - 1)
            sorted.forEach((item, i) => {
              if (item.type === 'f') updateFixture(item.id, { y: sorted[0].y + i * step })
              else updateElement(item.id, { y: sorted[0].y + i * step } as Partial<AnyElement>)
            })
          }}
        ><AlignVerticalDistributeCenter size={15} className='mr-1.5' /> Space evenly</button>
      </div>
    </div>
  )
}

export default function PropertiesPanel() {
  const { project, selectedIds, autoRepatch } = useProjectStore()
  if (!project) return null
  if (selectedIds.length === 0) {
    return (
      <div className='p-4 text-sm text-gray-400 text-center mt-8'>
        Select an element to view its properties
      </div>
    )
  }
  if (selectedIds.length > 1) {
    const selectedFixtureIds = project.fixtures.filter((f) => selectedIds.includes(f.id)).map((f) => f.id)
    const conflicts = findAddressConflicts(project.fixtures.filter((f) => selectedIds.includes(f.id)))
    return (
      <div className='p-3 overflow-y-auto flex-1 flex flex-col gap-3'>
        <div className='text-xs text-gray-400 text-center pt-2'>
          {selectedIds.length} items selected
        </div>
        {selectedFixtureIds.length > 1 && (
          <button
            onClick={() => autoRepatch(selectedFixtureIds)}
            className='w-full py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors'
          >
            Auto Re-patch {selectedFixtureIds.length} Fixtures
          </button>
        )}
        {conflicts.length > 0 && (
          <div className='flex flex-col gap-1'>
            {conflicts.map((msg, i) => (
              <div key={i} className='flex items-start gap-1.5 text-xs text-red-600 bg-red-50 rounded px-2 py-1.5'>
                <span className='shrink-0'>⚠</span><span>{msg}</span>
              </div>
            ))}
          </div>
        )}
        <BulkFixtureEdit fixtures={project.fixtures.filter((f) => selectedIds.includes(f.id))} />
        <AlignTools />
      </div>
    )
  }
  const id = selectedIds[0]
  const el = project.elements.find((e) => e.id === id)
  const fixture = project.fixtures.find((f) => f.id === id)
  const distro = project.distros.find((d) => d.id === id)
  const device = project.devices.find((d) => d.id === id)
  return (
    <div className='p-3 overflow-y-auto flex-1'>
      {el && <ElementProperties el={el} />}
      {fixture && <FixtureProperties fixture={fixture} />}
      {distro && <DistroProperties distro={distro} />}
      {device && <DeviceProperties device={device} />}
    </div>
  )
}
