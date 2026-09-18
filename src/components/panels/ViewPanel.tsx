import { Crosshair, Image, Trash2, RotateCcw } from 'lucide-react'
import { useProjectStore } from '../../store/projectStore'
import { loadImageFile, cn } from '../../lib/utils'
import { DEFAULT_VIEW_OPTIONS } from '../../types'
import type { ViewOptions } from '../../types'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className='mb-4'>
      <div className='text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1.5'>{title}</div>
      <div className='bg-white border border-gray-200 rounded-lg px-3'>{children}</div>
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className='flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0' title={hint}>
      <span className='text-xs text-gray-600'>{label}</span>
      {children}
    </div>
  )
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={cn('relative rounded-full transition-colors shrink-0', on ? 'bg-blue-600' : 'bg-gray-300')}
      style={{ height: 18, width: 32 }}
    >
      <span
        className={cn('absolute top-0.5 rounded-full bg-white shadow transition-transform', on ? 'translate-x-4' : 'translate-x-0.5')}
        style={{ height: 14, width: 14 }}
      />
    </button>
  )
}

export default function ViewPanel() {
  const { viewOptions: vo, setViewOption, autoAddress, setAutoAddress, project, setBackgroundImage, updateBackgroundImage } =
    useProjectStore()

  const bg = project?.backgroundImage

  const flag = (key: keyof ViewOptions, label: string, hint?: string) => (
    <Row label={label} hint={hint}>
      <Toggle on={vo[key] as boolean} onClick={() => setViewOption(key, !vo[key] as never)} />
    </Row>
  )

  const handleBgImage = async () => {
    try {
      const { src, width, height } = await loadImageFile()
      const targetW = 20
      const targetH = (height / width) * targetW
      setBackgroundImage({ src, x: 0, y: 0, width: targetW, height: targetH, rotation: 0, opacity: 0.4, visible: true, locked: false })
    } catch { /* cancelled */ }
  }

  const handleRemoveBg = () => {
    if (!window.confirm('Remove the background image from this project?')) return
    setBackgroundImage(undefined)
  }

  return (
    <div className='flex flex-col h-full overflow-y-auto'>
      <div className='px-3 py-2.5 border-b border-gray-200 shrink-0 flex items-center justify-between'>
        <span className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>View</span>
        <button
          title='Reset every view option'
          onClick={() => (Object.keys(DEFAULT_VIEW_OPTIONS) as (keyof ViewOptions)[])
            .forEach((k) => setViewOption(k, DEFAULT_VIEW_OPTIONS[k] as never))}
          className='flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors'
        >
          <RotateCcw size={11} /> Reset
        </button>
      </div>

      <div className='p-3'>
        <Section title='Canvas'>
          {flag('grid', 'Grid')}
          {flag('snap', 'Snap to grid')}
          <Row label={`Grid size (${vo.gridSize}m)`}>
            <div className='flex gap-1'>
              {[0.25, 0.5, 1, 2].map((s) => (
                <button
                  key={s}
                  onClick={() => setViewOption('gridSize', s)}
                  className={cn('text-xs px-1.5 py-0.5 rounded border transition-colors',
                    vo.gridSize === s ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-400')}
                >
                  {s}m
                </button>
              ))}
            </div>
          </Row>
          {flag('scaleBar', 'Scale bar')}
        </Section>

        <Section title='Fixtures'>
          {flag('channels', 'Channel numbers')}
          {flag('addresses', 'DMX addresses')}
          {flag('fixtureLabels', 'Fixture labels')}
          {flag('circuitRefs', 'Circuit references', 'Show the power circuit under each fixture')}
          {flag('universeColors', 'Universe colours', 'Coloured ring around each fixture by DMX universe')}
        </Section>

        <Section title='Cables'>
          {flag('cableLabels', 'Cable labels')}
          {flag('cableLengths', 'Cable lengths')}
        </Section>

        <Section title='Positions & shapes'>
          {flag('positionLabels', 'Position names')}
          {flag('positionLengths', 'Position lengths')}
          {flag('elementLabels', 'Shape labels')}
          {flag('deviceLabels', 'Device names')}
        </Section>

        <Section title='Editing'>
          <Row label='Auto-address on place' hint='Give each new fixture the next free DMX slot'>
            <Toggle on={autoAddress} onClick={() => setAutoAddress(!autoAddress)} />
          </Row>
        </Section>

        <Section title='Background image'>
          <Row label={bg ? 'Replace image' : 'Import image'}>
            <button onClick={handleBgImage} className='flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 transition-colors'>
              <Image size={13} /> {bg ? 'Replace' : 'Import'}
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
            <Row label='Size' hint='Measured size of the image in the plot'>
              <span className='text-xs text-gray-500 font-mono'>{bg.width.toFixed(1)} × {bg.height.toFixed(1)} m</span>
            </Row>
            <Row label='Scale to a known distance'>
              <button
                onClick={() => useProjectStore.getState().setActiveTool('calibrate')}
                className='flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 transition-colors'
              >
                <Crosshair size={13} /> Calibrate
              </button>
            </Row>
            <Row label='Remove image'>
              <button onClick={handleRemoveBg} className='flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors'>
                <Trash2 size={13} /> Remove
              </button>
            </Row>
          </>}
        </Section>
      </div>
    </div>
  )
}
