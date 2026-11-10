import { useState, useRef } from 'react'
import { Search, Upload, X, Zap, ExternalLink, Loader } from 'lucide-react'
import { useProjectStore } from '../../store/projectStore'
import { parseGDTFFile } from '../../lib/gdtf'
import type { GDTFFixtureType } from '../../types'
import { cn } from '../../lib/utils'
import { STARTER_LIBRARY } from '../../lib/starterLibrary'

const SYMBOL_LABELS: Record<string, string> = {
  wash: 'Wash', spot: 'Spot', beam: 'Beam', par: 'Par',
  strobe: 'Strobe', flood: 'Flood', pixel: 'Pixel', other: 'Other',
}

const SYMBOL_COLORS: Record<string, string> = {
  wash: 'bg-blue-100 text-blue-700',
  spot: 'bg-amber-100 text-amber-700',
  beam: 'bg-violet-100 text-violet-700',
  par: 'bg-green-100 text-green-700',
  strobe: 'bg-red-100 text-red-700',
  flood: 'bg-cyan-100 text-cyan-700',
  pixel: 'bg-pink-100 text-pink-700',
  other: 'bg-gray-100 text-gray-600',
}

function LibraryRow({ ft, active, onSelect, onRemove }: {
  ft: GDTFFixtureType; active: boolean; onSelect: () => void; onRemove?: () => void
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        'flex items-start gap-2 px-2 py-2 cursor-pointer border-b border-gray-100 hover:bg-gray-50 transition-colors',
        active && 'bg-blue-50 border-l-2 border-l-blue-500',
      )}
    >
      <div className='flex-1 min-w-0'>
        <div className='text-xs font-medium text-gray-800 truncate'>{ft.name}</div>
        <div className='flex items-center gap-1 mt-0.5 flex-wrap'>
          <span className={cn('text-xs px-1 rounded', SYMBOL_COLORS[ft.symbol])}>
            {SYMBOL_LABELS[ft.symbol]}
          </span>
          {onRemove && <span className='text-xs text-gray-500 truncate'>{ft.manufacturer}</span>}
          {ft.powerConsumption !== undefined && <span className='text-xs text-gray-400'>{ft.powerConsumption}W</span>}
          {ft.weight !== undefined && <span className='text-xs text-gray-400'>{ft.weight}kg</span>}
          {ft.beamAngle !== undefined && <span className='text-xs text-gray-400'>{ft.beamAngle}°</span>}
        </div>
        {ft.modes.length > 0 && (
          <div className='text-xs text-gray-400 truncate mt-0.5'>
            {ft.modes.map((m) => `${m.name}${/\d/.test(m.name) ? '' : ` (${m.channelCount}ch)`}`).join(' · ')}
          </div>
        )}
      </div>
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className='text-gray-300 hover:text-red-400 transition-colors mt-0.5 shrink-0'
          title='Remove from library'
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}

export default function FixtureLibrary() {
  const {
    gdtfLibrary, selectedFixtureType,
    setSelectedFixtureType, addToGDTFLibrary, removeFromGDTFLibrary, setActiveTool,
  } = useProjectStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null)
  const [importErrors, setImportErrors] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const matches = (f: GDTFFixtureType) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      f.name.toLowerCase().includes(q) ||
      f.manufacturer.toLowerCase().includes(q) ||
      f.shortName.toLowerCase().includes(q)
    )
  }
  const filtered = gdtfLibrary.filter(matches)
  const generics = STARTER_LIBRARY.filter(matches)

  const handleImportFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const fileArr = Array.from(files)
    setImporting(true)
    setImportProgress({ done: 0, total: fileArr.length })
    setImportErrors([])

    const errors: string[] = []
    let lastAdded: GDTFFixtureType | null = null

    for (let i = 0; i < fileArr.length; i++) {
      const file = fileArr[i]
      try {
        const ft = await parseGDTFFile(file)
        addToGDTFLibrary(ft)
        lastAdded = ft
      } catch (e) {
        errors.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
      setImportProgress({ done: i + 1, total: fileArr.length })
    }

    if (lastAdded) {
      setSelectedFixtureType(lastAdded)
      setActiveTool('fixture')
    }
    setImportErrors(errors)
    setImporting(false)
    setImportProgress(null)

    // Reset file input so the same files can be re-imported if needed
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const files = e.dataTransfer.files
    const gdtfFiles = Array.from(files).filter((f) => f.name.endsWith('.gdtf'))
    if (gdtfFiles.length === 0) return
    const dt = new DataTransfer()
    gdtfFiles.forEach((f) => dt.items.add(f))
    handleImportFiles(dt.files)
  }

  const selectFixture = (ft: GDTFFixtureType) => {
    setSelectedFixtureType(ft)
    setActiveTool('fixture')
  }

  return (
    <div
      className='flex flex-col h-full'
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className='p-2 border-b border-gray-200 flex flex-col gap-2'>
        {/* Search within library */}
        <div className='relative'>
          <Search size={12} className='absolute left-2 top-1/2 -translate-y-1/2 text-gray-400' />
          <input
            className='w-full text-xs border border-gray-200 rounded pl-6 pr-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500'
            placeholder='Filter library…'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Import button */}
        <input
          ref={fileInputRef}
          type='file'
          accept='.gdtf'
          multiple
          className='hidden'
          onChange={(e) => handleImportFiles(e.target.files)}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className='w-full flex items-center justify-center gap-1.5 text-xs text-gray-600 border border-dashed border-gray-300 rounded py-2 hover:bg-gray-50 hover:border-blue-400 transition-colors disabled:opacity-50'
        >
          {importing ? (
            <>
              <Loader size={12} className='animate-spin' />
              {importProgress ? `Importing ${importProgress.done}/${importProgress.total}…` : 'Importing…'}
            </>
          ) : (
            <>
              <Upload size={12} />
              Import .gdtf files (or drag &amp; drop)
            </>
          )}
        </button>

        {/* Link to GDTF Share */}
        <a
          href='https://gdtf-share.com/share.php?v=gdtf'
          target='_blank'
          rel='noopener noreferrer'
          className='w-full flex items-center justify-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 py-1 transition-colors'
        >
          <ExternalLink size={11} />
          Browse GDTF Share to download fixtures
        </a>

        {/* Import errors */}
        {importErrors.length > 0 && (
          <div className='text-xs text-red-600 bg-red-50 rounded p-1.5'>
            {importErrors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}
      </div>

      {/* Library list */}
      <div className='flex-1 overflow-y-auto'>
        {filtered.length > 0 && (
          <div className='px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400'>
            Your library · {gdtfLibrary.length}
          </div>
        )}
        {filtered.map((ft) => (
          <LibraryRow
            key={ft.id} ft={ft} active={selectedFixtureType?.id === ft.id}
            onSelect={() => selectFixture(ft)} onRemove={() => removeFromGDTFLibrary(ft.id)}
          />
        ))}

        {generics.length > 0 && (
          <div className='px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400'>
            Generic fixtures
          </div>
        )}
        {generics.map((ft) => (
          <LibraryRow key={ft.id} ft={ft} active={selectedFixtureType?.id === ft.id} onSelect={() => selectFixture(ft)} />
        ))}

        {filtered.length + generics.length === 0 && (
          <div className='p-4 text-center text-xs text-gray-400'>No fixtures match "{searchQuery}"</div>
        )}

        {gdtfLibrary.length === 0 && !searchQuery.trim() && (
          <div className='px-3 py-3 text-xs text-gray-400 leading-relaxed border-t border-gray-100 mt-2'>
            Generic fixtures get you drawing straight away. For exact modes, weight and power,
            import the manufacturer's <code>.gdtf</code> file — imported fixtures are kept between sessions.
          </div>
        )}
      </div>

      {/* Active fixture banner */}
      {selectedFixtureType && (
        <div className='p-2 border-t border-gray-200 bg-blue-50 shrink-0'>
          <div className='flex items-center gap-1 text-xs text-blue-700'>
            <Zap size={11} />
            <span className='font-medium truncate'>Placing: {selectedFixtureType.shortName}</span>
          </div>
          <div className='text-xs text-blue-500 mt-0.5'>Click the plot to place · snaps onto a truss · Esc when done</div>
        </div>
      )}
    </div>
  )
}
