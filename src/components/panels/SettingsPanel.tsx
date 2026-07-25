import { Crosshair, Image } from 'lucide-react'
import { useProjectStore } from '../../store/projectStore'
import { loadImageFile } from '../../lib/utils'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0'>
      <span className='text-xs text-gray-600'>{label}</span>
      {children}
    </div>
  )
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative w-8 h-4.5 rounded-full transition-colors ${on ? 'bg-blue-600' : 'bg-gray-300'}`}
      style={{ height: 18, width: 32 }}
    >
      <span
        className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`}
        style={{ height: 14, width: 14 }}
      />
    </button>
  )
}

export default function SettingsPanel() {
  const {
    gridVisible, setGridVisible,
    snapToGrid, setSnapToGrid,
    showUniverseColors, setShowUniverseColors,
    showScaleBar, setShowScaleBar,
    autoAddress, setAutoAddress,
    gridSize, project,
    setBackgroundImage, updateBackgroundImage,
  } = useProjectStore()

  const bg = project?.backgroundImage

  const handleBgImage = async () => {
    try {
      const { src, width, height } = await loadImageFile()
      const targetW = 20
      const targetH = (height / width) * targetW
      setBackgroundImage({ src, x: 0, y: 0, width: targetW, height: targetH, rotation: 0, opacity: 0.4, visible: true, locked: false })
    } catch { /* cancelled */ }
  }

  return (
    <div className='flex flex-col h-full overflow-y-auto'>
      <div className='px-3 py-2.5 border-b border-gray-200 shrink-0'>
        <span className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>Settings</span>
      </div>

      <div className='p-3'>
        {/* Canvas */}
        <div className='text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1.5'>Canvas</div>
        <div className='bg-white border border-gray-200 rounded-lg px-3 mb-4'>
          <Row label='Show grid'>
            <Toggle on={gridVisible} onClick={() => setGridVisible(!gridVisible)} />
          </Row>
          <Row label='Snap to grid'>
            <Toggle on={snapToGrid} onClick={() => setSnapToGrid(!snapToGrid)} />
          </Row>
          <Row label='Scale bar'>
            <Toggle on={showScaleBar} onClick={() => setShowScaleBar(!showScaleBar)} />
          </Row>
          <Row label={`Grid size (${gridSize}m)`}>
            <div className='flex gap-1'>
              {[0.25, 0.5, 1, 2].map((s) => (
                <button
                  key={s}
                  className={`text-xs px-1.5 py-0.5 rounded border ${gridSize === s ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-400'}`}
                  onClick={() => useProjectStore.getState().setGridSize?.(s)}
                >
                  {s}m
                </button>
              ))}
            </div>
          </Row>
        </div>

        {/* Fixtures */}
        <div className='text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1.5'>Fixtures</div>
        <div className='bg-white border border-gray-200 rounded-lg px-3 mb-4'>
          <Row label='Universe colours'>
            <Toggle on={showUniverseColors} onClick={() => setShowUniverseColors(!showUniverseColors)} />
          </Row>
          <Row label='Auto-address on place'>
            <Toggle on={autoAddress} onClick={() => setAutoAddress(!autoAddress)} />
          </Row>
        </div>

        {/* Background image */}
        <div className='text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1.5'>Background Image</div>
        <div className='bg-white border border-gray-200 rounded-lg px-3 mb-4'>
          <Row label='Import image'>
            <button
              onClick={handleBgImage}
              className='flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 transition-colors'
            >
              <Image size={13} /> Import
            </button>
          </Row>
          {bg && <>
            <Row label='Visible'>
              <Toggle on={bg.visible !== false} onClick={() => updateBackgroundImage({ visible: !bg.visible })} />
            </Row>
            <Row label='Opacity'>
              <input
                type='range' min={0.05} max={1} step={0.05}
                value={bg.opacity}
                onChange={(e) => updateBackgroundImage({ opacity: parseFloat(e.target.value) })}
                className='w-20 accent-blue-600'
              />
            </Row>
            <Row label='Scale / Calibrate'>
              <button
                onClick={() => useProjectStore.getState().setActiveTool('calibrate')}
                className='flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 transition-colors'
              >
                <Crosshair size={13} /> Calibrate
              </button>
            </Row>
          </>}
        </div>
      </div>
    </div>
  )
}
