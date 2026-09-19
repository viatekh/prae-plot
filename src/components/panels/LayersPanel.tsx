import { useState } from 'react'
import { Eye, EyeOff, Lock, Unlock, Plus, Trash2, ChevronUp, ChevronDown, Image } from 'lucide-react'
import { useProjectStore } from '../../store/projectStore'
import type { Layer } from '../../types'
import { isFreeform } from '../../types'
import { cn } from '../../lib/utils'

const PRESET_COLORS = ['#6b7280', '#3b82f6', '#f97316', '#22c55e', '#ef4444', '#a855f7', '#ec4899', '#06b6d4']

function BgImageRow() {
  const { project, updateBackgroundImage } = useProjectStore()
  const bg = project?.backgroundImage
  if (!bg) return null

  const visible = bg.visible !== false
  const locked = bg.locked === true

  return (
    <div className='group flex items-center gap-2 px-2 py-1.5 border-b border-gray-100 bg-amber-50'>
      <Image size={12} className='text-amber-500 shrink-0' />
      <div className='flex-1 min-w-0'>
        <div className='text-xs font-medium text-gray-700 truncate'>Background Image</div>
        <div className='text-xs text-gray-400'>
          {isFreeform(project) ? 'Reference image' : `${bg.width.toFixed(1)}m × ${bg.height.toFixed(1)}m`}
        </div>
      </div>
      <div className='flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity'>
        <button
          title={visible ? 'Hide' : 'Show'}
          onClick={() => updateBackgroundImage({ visible: !visible })}
          className='p-0.5 text-gray-400 hover:text-gray-700 transition-colors'
        >
          {visible ? <Eye size={12} /> : <EyeOff size={12} className='text-gray-300' />}
        </button>
        <button
          title={locked ? 'Unlock' : 'Lock'}
          onClick={() => updateBackgroundImage({ locked: !locked })}
          className='p-0.5 text-gray-400 hover:text-gray-700 transition-colors'
        >
          {locked ? <Lock size={12} className='text-amber-500' /> : <Unlock size={12} />}
        </button>
      </div>
      {!visible && <EyeOff size={11} className='text-gray-300 shrink-0' />}
      {locked && <Lock size={11} className='text-amber-400 shrink-0' />}
    </div>
  )
}

function LayerRow({ layer, isActive, isFirst, isLast, onSelect }: {
  layer: Layer; isActive: boolean; isFirst: boolean; isLast: boolean; onSelect: () => void
}) {
  const { updateLayer, deleteLayer, moveLayer, project } = useProjectStore()
  const [editingName, setEditingName] = useState(false)

  const elementCount = (project?.elements.filter((e) => e.layerId === layer.id).length ?? 0) +
    (project?.fixtures.filter((f) => f.layerId === layer.id).length ?? 0)

  return (
    <div
      onClick={onSelect}
      className={cn(
        'group flex items-center gap-2 px-2 py-1.5 cursor-pointer border-b border-gray-100 transition-colors',
        isActive ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-gray-50',
      )}
    >
      <div className='flex flex-col shrink-0 -my-1' onClick={(e) => e.stopPropagation()}>
        <button
          title='Move up'
          disabled={isFirst}
          onClick={() => moveLayer(layer.id, 'up')}
          className='text-gray-300 hover:text-gray-600 disabled:opacity-30 disabled:hover:text-gray-300 transition-colors'
        >
          <ChevronUp size={11} />
        </button>
        <button
          title='Move down'
          disabled={isLast}
          onClick={() => moveLayer(layer.id, 'down')}
          className='text-gray-300 hover:text-gray-600 disabled:opacity-30 disabled:hover:text-gray-300 transition-colors'
        >
          <ChevronDown size={11} />
        </button>
      </div>

      <input
        type='color'
        value={layer.color}
        onChange={(e) => updateLayer(layer.id, { color: e.target.value })}
        onClick={(e) => e.stopPropagation()}
        className='w-4 h-4 rounded-sm cursor-pointer border-0 p-0 shrink-0'
        style={{ background: layer.color }}
        title='Layer colour'
      />

      <div className='flex-1 min-w-0'>
        {editingName ? (
          <input
            autoFocus
            className='w-full text-xs border border-blue-300 rounded px-1 py-0.5'
            value={layer.name}
            onChange={(e) => updateLayer(layer.id, { name: e.target.value })}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <button
            className='text-xs text-left w-full truncate font-medium text-gray-800'
            onDoubleClick={(e) => { e.stopPropagation(); setEditingName(true) }}
          >
            {layer.name}
          </button>
        )}
        <div className='text-xs text-gray-400'>{elementCount} item{elementCount !== 1 ? 's' : ''}</div>
      </div>

      <div className='flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity' onClick={(e) => e.stopPropagation()}>
        <button
          title={layer.visible ? 'Hide layer' : 'Show layer'}
          onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
          className='p-0.5 text-gray-400 hover:text-gray-700 transition-colors'
        >
          {layer.visible ? <Eye size={12} /> : <EyeOff size={12} className='text-gray-300' />}
        </button>
        <button
          title={layer.locked ? 'Unlock layer' : 'Lock layer — stays visible, cannot be edited'}
          onClick={() => updateLayer(layer.id, { locked: !layer.locked })}
          className='p-0.5 text-gray-400 hover:text-gray-700 transition-colors'
        >
          {layer.locked ? <Lock size={12} className='text-amber-500' /> : <Unlock size={12} />}
        </button>
        <button
          title='Delete layer'
          onClick={() => {
            if (elementCount > 0 && !window.confirm(`Delete layer "${layer.name}"?\n\n${elementCount} item${elementCount !== 1 ? 's' : ''} stay on the plot but lose their layer assignment.`)) return
            deleteLayer(layer.id)
          }}
          className='p-0.5 text-gray-300 hover:text-red-400 transition-colors'
        >
          <Trash2 size={11} />
        </button>
      </div>

      {!layer.visible && <EyeOff size={11} className='text-gray-300 shrink-0' />}
      {layer.locked && <Lock size={11} className='text-amber-400 shrink-0' />}
    </div>
  )
}

export default function LayersPanel() {
  const { project, addLayer, activeLayerId, setActiveLayerId } = useProjectStore()
  if (!project) return null

  const layers = [...project.layers].sort((a, b) => a.order - b.order)

  return (
    <div className='flex flex-col h-full'>
      <div className='px-2 py-1.5 border-b border-gray-200 flex items-center justify-between shrink-0'>
        <span className='text-xs font-semibold text-gray-600'>Layers</span>
        <button
          onClick={() => addLayer({ name: `Layer ${project.layers.length + 1}`, color: PRESET_COLORS[project.layers.length % PRESET_COLORS.length], visible: true, locked: false })}
          className='flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors'
        >
          <Plus size={12} /> Add
        </button>
      </div>

      <div className='px-2 py-1 border-b border-gray-100 text-xs text-gray-400'>
        Top of the list draws first; later layers sit on top.
      </div>

      <div className='flex-1 overflow-y-auto'>
        <BgImageRow />

        {layers.length === 0 && !project.backgroundImage && (
          <div className='p-4 text-center text-xs text-gray-400'>No layers. Add one to organise your plot.</div>
        )}
        {layers.map((layer, i) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            isActive={layer.id === activeLayerId}
            isFirst={i === 0}
            isLast={i === layers.length - 1}
            onSelect={() => setActiveLayerId(layer.id)}
          />
        ))}
      </div>

      {activeLayerId && (
        <div className='shrink-0 border-t border-gray-200 px-3 py-1.5 bg-gray-50'>
          <div className='text-xs text-gray-500'>
            Drawing on: <span className='font-semibold text-gray-800'>
              {layers.find((l) => l.id === activeLayerId)?.name ?? 'Unknown'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
