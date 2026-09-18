import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, FileText, Layers, Download, AlertTriangle, ExternalLink, Loader2 } from 'lucide-react'
import type { Project } from '../../types'
import {
  buildPlotPDF, buildPatchPDF, buildEquipmentPDF, buildCablePDF, buildPowerPDF, buildGroupsPDF, savePdf,
} from '../../lib/pdfExport'
import type { BuiltPdf, PlotPage } from '../../lib/pdfExport'
import { DEFAULT_PLOT_OPTIONS, PAPER_LABELS, STANDARD_SCALES } from '../../lib/plotVector'
import type { PlotOptions, PaperSize, Orientation } from '../../lib/plotVector'
import { useProjectStore } from '../../store/projectStore'
import { cn } from '../../lib/utils'

type Tab = 'plot' | 'patch' | 'equipment' | 'cable' | 'power' | 'groups'

interface Props {
  project: Project
  onClose: () => void
}

const TAB_BLURB: Record<Exclude<Tab, 'plot'>, string> = {
  patch: 'Every fixture sorted by channel, with patch addresses, circuit assignments, mode and notes. A4 portrait.',
  equipment: 'Fixtures grouped by model with quantities, weight and power draw, followed by placed devices. A4 portrait.',
  cable: 'Cable schedule by type: run-by-run lengths with from/to nodes, plus the stock lengths to pull. A4 portrait.',
  power: 'Load summary, per-distro breakdown with circuit utilisation and phase balance for 3Ø distros. A4 portrait.',
  groups: 'Fixture groups with member lists, patch addresses, power draw and weight totals. A4 portrait.',
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className='flex items-start gap-2 cursor-pointer py-0.5' title={hint}>
      <input type='checkbox' checked={checked} onChange={(e) => onChange(e.target.checked)} className='mt-0.5 rounded accent-blue-600' />
      <span className='text-xs text-gray-700 leading-tight'>{label}</span>
    </label>
  )
}

function SegButton<T extends string | number>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void
}) {
  return (
    <div className='flex flex-wrap gap-1'>
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={cn('text-xs px-2 py-1 rounded border transition-colors',
            value === o.value ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-400')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function ExportModal({ project, onClose }: Props) {
  const gridSize = useProjectStore((s) => s.gridSize)

  const [tab, setTab] = useState<Tab>('plot')
  const [opts, setOpts] = useState<PlotOptions>(DEFAULT_PLOT_OPTIONS)
  const [perLayer, setPerLayer] = useState(false)
  const [selectedLayers, setSelectedLayers] = useState<Set<string>>(
    () => new Set(project.layers.filter((l) => l.visible).map((l) => l.id)),
  )

  const previewRef = useRef<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [building, setBuilding] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const setOpt = <K extends keyof PlotOptions>(key: K, value: PlotOptions[K]) =>
    setOpts((o) => ({ ...o, [key]: value }))

  const toggleLayer = (id: string) => {
    setSelectedLayers((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const orderedLayers = useMemo(() => [...project.layers].sort((a, b) => a.order - b.order), [project.layers])
  const layerIds = useMemo(
    () => orderedLayers.filter((l) => selectedLayers.has(l.id)).map((l) => l.id),
    [orderedLayers, selectedLayers],
  )

  const build = useCallback((): BuiltPdf => {
    switch (tab) {
      case 'plot': {
        const pages: PlotPage[] = perLayer
          ? orderedLayers.filter((l) => selectedLayers.has(l.id)).map((l) => ({ label: l.name, layerIds: [l.id] }))
          : [{ layerIds }]
        return buildPlotPDF(project, { options: opts, pages: pages.length ? pages : [{ layerIds: [] }], gridSize })
      }
      case 'patch': return buildPatchPDF(project)
      case 'equipment': return buildEquipmentPDF(project)
      case 'cable': return buildCablePDF(project)
      case 'power': return buildPowerPDF(project)
      case 'groups': return buildGroupsPDF(project)
    }
  }, [tab, project, opts, perLayer, orderedLayers, selectedLayers, layerIds, gridSize])

  // Live preview — the PDF itself is the preview, so what you see is what saves.
  useEffect(() => {
    let cancelled = false
    const flag = setTimeout(() => { if (!cancelled) setBuilding(true) }, 0)
    const timer = setTimeout(() => {
      try {
        const built = build()
        const url = built.doc.output('bloburl').toString()
        if (cancelled) { URL.revokeObjectURL(url); return }
        if (previewRef.current) URL.revokeObjectURL(previewRef.current)
        previewRef.current = url
        setPreviewUrl(url)
        setError(null)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not render this document.')
      } finally {
        if (!cancelled) setBuilding(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(flag); clearTimeout(timer) }
  }, [build])

  // Release the last preview when the modal goes away.
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current) }, [])

  const handleDownload = () => {
    try {
      savePdf(build())
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.')
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'plot', label: 'Plot', icon: <Layers size={13} /> },
    { id: 'patch', label: 'Patch Sheet', icon: <FileText size={13} /> },
    { id: 'equipment', label: 'Equipment', icon: <FileText size={13} /> },
    { id: 'cable', label: 'Cables', icon: <FileText size={13} /> },
    { id: 'power', label: 'Power', icon: <FileText size={13} /> },
    { id: 'groups', label: 'Groups', icon: <FileText size={13} /> },
  ]

  const nothingSelected = tab === 'plot' && selectedLayers.size === 0

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4' onClick={onClose}>
      <div
        className='bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[86vh] flex flex-col overflow-hidden'
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className='flex items-center justify-between px-5 py-3 border-b border-gray-200 shrink-0'>
          <div className='flex items-center gap-2'>
            <Download size={16} className='text-blue-600' />
            <span className='font-semibold text-gray-800'>Export</span>
            <span className='text-xs text-gray-400'>{project.info.name}</span>
          </div>
          <button onClick={onClose} className='text-gray-400 hover:text-gray-600 transition-colors'>
            <X size={16} />
          </button>
        </div>

        {/* Tab bar */}
        <div className='flex border-b border-gray-200 px-3 pt-2 gap-1 shrink-0 overflow-x-auto'>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t transition-colors border-b-2 whitespace-nowrap',
                tab === t.id ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700')}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        <div className='flex flex-1 min-h-0'>
          {/* Options */}
          <div className='w-72 shrink-0 border-r border-gray-200 overflow-y-auto p-4 flex flex-col gap-4'>
            {tab === 'plot' ? (
              <>
                <div>
                  <div className='text-xs font-semibold text-gray-600 mb-1.5'>Paper</div>
                  <SegButton<PaperSize>
                    options={(Object.keys(PAPER_LABELS) as PaperSize[]).map((p) => ({ value: p, label: PAPER_LABELS[p] }))}
                    value={opts.paper}
                    onChange={(v) => setOpt('paper', v)}
                  />
                  <div className='mt-1.5'>
                    <SegButton<Orientation>
                      options={[{ value: 'landscape', label: 'Landscape' }, { value: 'portrait', label: 'Portrait' }]}
                      value={opts.orientation}
                      onChange={(v) => setOpt('orientation', v)}
                    />
                  </div>
                </div>

                <div>
                  <div className='text-xs font-semibold text-gray-600 mb-1.5'>Drawing scale</div>
                  <SegButton<string>
                    options={[
                      { value: 'fit', label: 'Best fit' },
                      ...STANDARD_SCALES.map((s) => ({ value: String(s), label: `1:${s}` })),
                    ]}
                    value={opts.scale === 'fit' ? 'fit' : String(opts.scale)}
                    onChange={(v) => setOpt('scale', v === 'fit' ? 'fit' : Number(v))}
                  />
                  <div className='text-xs text-gray-400 mt-1.5 leading-snug'>
                    Best fit picks the largest standard scale the drawing fits at.
                  </div>
                </div>

                <div>
                  <div className='text-xs font-semibold text-gray-600 mb-1.5'>Layers</div>
                  <div className='flex flex-col gap-1'>
                    {orderedLayers.map((layer) => (
                      <label key={layer.id} className='flex items-center gap-2 cursor-pointer'>
                        <input
                          type='checkbox'
                          checked={selectedLayers.has(layer.id)}
                          onChange={() => toggleLayer(layer.id)}
                          className='rounded accent-blue-600'
                        />
                        <span className='w-2.5 h-2.5 rounded-full shrink-0' style={{ background: layer.color }} />
                        <span className='text-xs text-gray-700'>{layer.name}</span>
                      </label>
                    ))}
                  </div>
                  <div className='mt-2'>
                    <Toggle label='One page per layer' checked={perLayer} onChange={setPerLayer} />
                  </div>
                </div>

                <div>
                  <div className='text-xs font-semibold text-gray-600 mb-1.5'>Show on drawing</div>
                  <Toggle label='Channel numbers' checked={opts.showChannels} onChange={(v) => setOpt('showChannels', v)} />
                  <Toggle label='DMX addresses' checked={opts.showAddresses} onChange={(v) => setOpt('showAddresses', v)} />
                  <Toggle label='Fixture labels' checked={opts.showFixtureLabels} onChange={(v) => setOpt('showFixtureLabels', v)} />
                  <Toggle label='Cable labels & lengths' checked={opts.showCableLabels} onChange={(v) => setOpt('showCableLabels', v)} />
                  <Toggle label='Background image' checked={opts.showBackground} onChange={(v) => setOpt('showBackground', v)} />
                  <Toggle label='Grid' checked={opts.showGrid} onChange={(v) => setOpt('showGrid', v)} />
                  <Toggle label='Key column' checked={opts.showLegend} onChange={(v) => setOpt('showLegend', v)} hint='Symbol key, cable key and scale bar' />
                  <Toggle label='Colour by layer' checked={opts.colorByLayer} onChange={(v) => setOpt('colorByLayer', v)} />
                </div>
              </>
            ) : (
              <div className='text-xs text-gray-600 leading-relaxed'>{TAB_BLURB[tab]}</div>
            )}
          </div>

          {/* Preview */}
          <div className='flex-1 min-w-0 bg-gray-100 relative'>
            {previewUrl && !error && (
              <iframe
                key={previewUrl}
                src={previewUrl}
                title='PDF preview'
                className='w-full h-full border-0'
              />
            )}
            {error && (
              <div className='absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-8'>
                <AlertTriangle size={22} className='text-amber-500' />
                <div className='text-sm font-medium text-gray-700'>Could not build this document</div>
                <div className='text-xs text-gray-500'>{error}</div>
              </div>
            )}
            {nothingSelected && !error && (
              <div className='absolute inset-0 flex items-center justify-center bg-gray-100/90 text-xs text-gray-500'>
                Select at least one layer.
              </div>
            )}
            {building && (
              <div className='absolute top-3 right-3 flex items-center gap-1.5 bg-white/90 rounded-full px-3 py-1 shadow-sm text-xs text-gray-500'>
                <Loader2 size={12} className='animate-spin' /> Rendering…
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className='px-5 py-3 border-t border-gray-200 flex items-center justify-between gap-2 shrink-0'>
          <div className='text-xs text-gray-400'>
            {tab === 'plot'
              ? 'Drawn as vectors at a true scale — sharp at any zoom or print size.'
              : 'Preview is the exact file that will be saved.'}
          </div>
          <div className='flex items-center gap-2'>
            {previewUrl && (
              <a
                href={previewUrl}
                target='_blank'
                rel='noreferrer'
                className='flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors'
              >
                <ExternalLink size={13} /> Open
              </a>
            )}
            <button onClick={onClose} className='px-4 py-2 text-sm text-gray-600 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors'>
              Cancel
            </button>
            <button
              onClick={handleDownload}
              disabled={nothingSelected}
              className={cn('flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                nothingSelected ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700')}
            >
              <Download size={14} /> Download PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
