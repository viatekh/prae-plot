import { useState } from 'react'
import { Plus, Trash2, MapPin } from 'lucide-react'
import { useProjectStore } from '../../store/projectStore'
import type { DeviceCategory } from '../../types'

const CATEGORY_OPTIONS: { value: DeviceCategory; label: string }[] = [
  { value: 'console',        label: 'Lighting Console' },
  { value: 'dimmer-rack',    label: 'Dimmer Rack' },
  { value: 'media-server',   label: 'Media Server' },
  { value: 'network-switch', label: 'Network Switch' },
  { value: 'dmx-splitter',   label: 'DMX Y-Split / Splitter' },
  { value: 'power-splitter', label: 'Power Y-Split / T-Split' },
  { value: 'amplifier',      label: 'Amplifier' },
  { value: 'other',          label: 'Other' },
]

const CATEGORY_COLORS: Record<DeviceCategory, string> = {
  'console':        'bg-blue-700',
  'dimmer-rack':    'bg-gray-700',
  'media-server':   'bg-teal-700',
  'network-switch': 'bg-sky-700',
  'dmx-splitter':   'bg-violet-700',
  'power-splitter': 'bg-amber-700',
  'amplifier':      'bg-emerald-700',
  'other':          'bg-gray-500',
}

export default function DevicesPanel() {
  const { project, addDevice, deleteDevice, updateDevice, setSelectedIds } = useProjectStore()
  const [form, setForm] = useState<{ name: string; category: DeviceCategory }>({ name: '', category: 'console' })
  const [showForm, setShowForm] = useState(false)

  if (!project) return null

  const handleAdd = () => {
    if (!form.name.trim()) return
    addDevice({ name: form.name.trim(), category: form.category })
    setForm({ name: '', category: 'console' })
    setShowForm(false)
  }

  const handlePlaceOnCanvas = (id: string) => {
    // Place at centre of current view (roughly)
    const { view } = useProjectStore.getState()
    const BASE_PX = 50
    const x = Math.round((-view.x / view.scale / BASE_PX) + 10)
    const y = Math.round((-view.y / view.scale / BASE_PX) + 8)
    updateDevice(id, { x: Math.max(0, x), y: Math.max(0, y) })
    setSelectedIds([id])
  }

  return (
    <div className='flex flex-col h-full overflow-hidden'>
      <div className='px-3 py-2.5 border-b border-gray-200 flex items-center justify-between shrink-0'>
        <span className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>Devices</span>
        <button
          onClick={() => setShowForm(!showForm)}
          className='text-blue-600 hover:text-blue-800 transition-colors'
          title='Add device'
        >
          <Plus size={15} />
        </button>
      </div>

      {showForm && (
        <div className='p-2 border-b border-gray-100 flex flex-col gap-2'>
          <input
            type='text'
            placeholder='Device name…'
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className='w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500'
            autoFocus
          />
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as DeviceCategory })}
            className='w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500'
          >
            {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div className='flex gap-1.5'>
            <button onClick={handleAdd} className='flex-1 text-xs bg-blue-600 text-white py-1.5 rounded hover:bg-blue-700 transition-colors'>Add</button>
            <button onClick={() => setShowForm(false)} className='flex-1 text-xs border border-gray-200 text-gray-500 py-1.5 rounded hover:bg-gray-50 transition-colors'>Cancel</button>
          </div>
        </div>
      )}

      <div className='flex-1 overflow-y-auto p-2 flex flex-col gap-1.5'>
        {project.devices.length === 0 && (
          <div className='text-xs text-gray-400 text-center py-8'>
            No devices yet.<br />Add consoles, splitters, servers…
          </div>
        )}
        {project.devices.map((d) => (
          <div key={d.id} className='bg-white border border-gray-200 rounded-lg overflow-hidden'>
            <div className='flex items-center gap-2 px-2.5 py-2'>
              <span className={`text-white text-xs px-1.5 py-0.5 rounded font-mono shrink-0 ${CATEGORY_COLORS[d.category]}`}>
                {d.category === 'dmx-splitter' || d.category === 'power-splitter' ? 'SPLIT' :
                 d.category === 'console' ? 'CON' :
                 d.category === 'dimmer-rack' ? 'DIM' :
                 d.category === 'media-server' ? 'MED' :
                 d.category === 'network-switch' ? 'NET' :
                 d.category === 'amplifier' ? 'AMP' : 'DEV'}
              </span>
              <div className='flex-1 min-w-0'>
                <div className='text-xs font-semibold text-gray-800 truncate'>{d.name}</div>
                {d.manufacturer && <div className='text-xs text-gray-400 truncate'>{d.manufacturer} {d.model}</div>}
              </div>
            </div>
            <div className='flex border-t border-gray-100'>
              <button
                onClick={() => handlePlaceOnCanvas(d.id)}
                className='flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-blue-600 hover:bg-blue-50 transition-colors'
                title={d.x !== undefined ? 'Re-place on canvas' : 'Place on canvas'}
              >
                <MapPin size={11} /> {d.x !== undefined ? 'Re-place' : 'Place'}
              </button>
              <button
                onClick={() => deleteDevice(d.id)}
                className='px-3 flex items-center justify-center text-red-400 hover:bg-red-50 transition-colors'
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
