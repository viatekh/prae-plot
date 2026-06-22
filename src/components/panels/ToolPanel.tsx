import { MousePointer2, Hand, Square, Circle, Pentagon, Minus, Type, Zap, Image, Grid3x3, Cable, Crosshair } from 'lucide-react'
import { useProjectStore } from '../../store/projectStore'
import { loadImageFile, cn } from '../../lib/utils'
import type { ToolType } from '../../types'

const tools: { id: ToolType; icon: React.ReactNode; label: string }[] = [
  { id: 'select',  icon: <MousePointer2 size={18} />, label: 'Select (V)' },
  { id: 'pan',     icon: <Hand size={18} />,          label: 'Pan (H) — Alt+drag or middle mouse' },
  { id: 'fixture', icon: <Zap size={18} />,           label: 'Place fixture (F) — select from library first' },
  { id: 'cable',   icon: <Cable size={18} />,         label: 'Cable (C) — click to add vertices, double-click to finish, ESC to cancel' },
  { id: 'rect',    icon: <Square size={18} />,        label: 'Rectangle (R)' },
  { id: 'ellipse', icon: <Circle size={18} />,        label: 'Circle / Ellipse (E)' },
  { id: 'polygon', icon: <Pentagon size={18} />,      label: 'Polygon (P) — click points, double-click to close' },
  { id: 'truss',   icon: <Minus size={18} />,         label: 'Truss / bar (T)' },
  { id: 'text',    icon: <Type size={18} />,          label: 'Text annotation (X)' },
]

export default function ToolPanel() {
  const {
    activeTool, setActiveTool,
    gridVisible, setGridVisible,
    snapToGrid, setSnapToGrid,
    autoAddress, setAutoAddress,
    showUniverseColors, setShowUniverseColors,
    setBackgroundImage, project,
  } = useProjectStore()

  const handleBgImage = async () => {
    try {
      const { src, width, height } = await loadImageFile()
      const targetW = 20
      const targetH = (height / width) * targetW
      setBackgroundImage({ src, x: 0, y: 0, width: targetW, height: targetH, rotation: 0, opacity: 0.4, visible: true, locked: false })
    } catch { /* cancelled */ }
  }

  const handleCalibrate = () => {
    if (!project?.backgroundImage) {
      alert('Import a background image first.')
      return
    }
    setActiveTool('calibrate')
  }

  return (
    <div className='flex flex-col gap-1 p-2 overflow-y-auto'>
      {tools.map((t) => (
        <button
          key={t.id}
          title={t.label}
          onClick={() => setActiveTool(t.id)}
          className={cn(
            'flex items-center justify-center w-9 h-9 rounded transition-colors',
            activeTool === t.id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100',
          )}
        >
          {t.icon}
        </button>
      ))}

      <div className='border-t border-gray-200 my-1' />

      {/* Background image */}
      <button title='Import background image' onClick={handleBgImage} className='flex items-center justify-center w-9 h-9 rounded text-gray-600 hover:bg-gray-100 transition-colors'>
        <Image size={18} />
      </button>

      {/* Calibrate */}
      <button
        title='Calibrate background image scale — click two points, enter real distance'
        onClick={handleCalibrate}
        className={cn(
          'flex items-center justify-center w-9 h-9 rounded transition-colors',
          activeTool === 'calibrate' ? 'bg-orange-500 text-white' : 'text-gray-600 hover:bg-gray-100',
          !project?.backgroundImage && 'opacity-30 cursor-not-allowed',
        )}
      >
        <Crosshair size={18} />
      </button>

      <div className='border-t border-gray-200 my-1' />

      {/* Grid toggle */}
      <button
        title={gridVisible ? 'Hide grid' : 'Show grid'}
        onClick={() => setGridVisible(!gridVisible)}
        className={cn('flex items-center justify-center w-9 h-9 rounded transition-colors', gridVisible ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-100')}
      >
        <Grid3x3 size={18} />
      </button>

      {/* Snap toggle */}
      <button
        title={snapToGrid ? 'Snap to grid: on' : 'Snap to grid: off'}
        onClick={() => setSnapToGrid(!snapToGrid)}
        className={cn('flex items-center justify-center w-9 h-9 rounded text-sm font-bold transition-colors', snapToGrid ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-100')}
      >
        ⊞
      </button>

      {/* Universe colour toggle */}
      <button
        title={showUniverseColors ? 'Universe colours: on' : 'Universe colours: off — show coloured rings around fixtures by DMX universe'}
        onClick={() => setShowUniverseColors(!showUniverseColors)}
        className={cn('flex items-center justify-center w-9 h-9 rounded text-sm font-bold transition-colors', showUniverseColors ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-100')}
      >
        ⊙
      </button>

      {/* Auto-address toggle — visible when fixture tool is active */}
      {activeTool === 'fixture' && (
        <>
          <div className='border-t border-gray-200 my-1' />
          <label title='Auto-increment DMX address as fixtures are placed' className='flex flex-col items-center gap-0.5 cursor-pointer px-1 py-1'>
            <input type='checkbox' checked={autoAddress} onChange={(e) => setAutoAddress(e.target.checked)} className='cursor-pointer' />
            <span className='text-xs text-gray-500 leading-tight text-center'>Auto addr.</span>
          </label>
        </>
      )}
    </div>
  )
}
