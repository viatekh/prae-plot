import { useState } from 'react'
import { X, FileText, Layers, Download } from 'lucide-react'
import type { Project } from '../../types'
import { exportPlotPDF, exportPatchPDF, exportEquipmentPDF, exportCablePDF, exportPowerPDF, exportGroupsPDF } from '../../lib/pdfExport'
import { getPlotDataURL } from '../canvas/PlotCanvas'
import { cn } from '../../lib/utils'

interface Props {
  project: Project
  onClose: () => void
}

export default function ExportModal({ project, onClose }: Props) {
  const [tab, setTab] = useState<'plot' | 'patch' | 'equipment' | 'cable' | 'power' | 'groups'>('plot')
  const [selectedLayers, setSelectedLayers] = useState<Set<string>>(
    new Set(project.layers.map((l) => l.id))
  )
  const [perLayer, setPerLayer] = useState(false)
  const [exporting, setExporting] = useState(false)

  const toggleLayer = (id: string) => {
    setSelectedLayers((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      if (tab === 'plot') {
        if (perLayer) {
          for (const layer of project.layers.filter((l) => selectedLayers.has(l.id))) {
            const dataURL = getPlotDataURL()
            if (dataURL) await exportPlotPDF(project, dataURL, [layer.id], layer.name)
          }
        } else {
          const dataURL = getPlotDataURL()
          if (!dataURL) { alert('Switch to Plot mode first, then export.'); return }
          await exportPlotPDF(project, dataURL, [...selectedLayers])
        }
      } else if (tab === 'patch') {
        await exportPatchPDF(project)
      } else if (tab === 'equipment') {
        await exportEquipmentPDF(project)
      } else if (tab === 'cable') {
        await exportCablePDF(project)
      } else if (tab === 'power') {
        await exportPowerPDF(project)
      } else if (tab === 'groups') {
        await exportGroupsPDF(project)
      }
    } finally {
      setExporting(false)
      onClose()
    }
  }

  const tabs = [
    { id: 'plot',      label: 'Plot',        icon: <Layers size={13} /> },
    { id: 'patch',     label: 'Patch Sheet', icon: <FileText size={13} /> },
    { id: 'equipment', label: 'Equipment',   icon: <FileText size={13} /> },
    { id: 'cable',     label: 'Cables',      icon: <FileText size={13} /> },
    { id: 'power',     label: 'Power',       icon: <FileText size={13} /> },
    { id: 'groups',    label: 'Groups',      icon: <FileText size={13} /> },
  ] as const

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50' onClick={onClose}>
      <div className='bg-white rounded-xl shadow-2xl w-96 flex flex-col overflow-hidden' onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className='flex items-center justify-between px-5 py-4 border-b border-gray-200'>
          <div className='flex items-center gap-2'>
            <Download size={16} className='text-blue-600' />
            <span className='font-semibold text-gray-800'>Export</span>
          </div>
          <button onClick={onClose} className='text-gray-400 hover:text-gray-600 transition-colors'>
            <X size={16} />
          </button>
        </div>

        {/* Tab bar */}
        <div className='flex border-b border-gray-200 px-3 pt-2 gap-1'>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t transition-colors border-b-2',
                tab === t.id ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700')}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        <div className='p-5 flex flex-col gap-4'>
          {tab === 'plot' && (
            <>
              <div>
                <div className='text-xs font-semibold text-gray-600 mb-2'>Layers to include</div>
                <div className='flex flex-col gap-1.5'>
                  {project.layers.map((layer) => (
                    <label key={layer.id} className='flex items-center gap-2.5 cursor-pointer'>
                      <input
                        type='checkbox'
                        checked={selectedLayers.has(layer.id)}
                        onChange={() => toggleLayer(layer.id)}
                        className='rounded'
                      />
                      <span className='w-2.5 h-2.5 rounded-full shrink-0' style={{ background: layer.color }} />
                      <span className='text-sm text-gray-700'>{layer.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <label className='flex items-center gap-2.5 cursor-pointer'>
                <input type='checkbox' checked={perLayer} onChange={(e) => setPerLayer(e.target.checked)} />
                <span className='text-sm text-gray-700'>Export each layer as a separate PDF</span>
              </label>
              <div className='text-xs text-gray-400'>A3 landscape, 2× pixel ratio. Switch to Plot mode before exporting.</div>
            </>
          )}
          {tab === 'patch' && (
            <div className='text-sm text-gray-600'>
              Exports all fixtures sorted by ID, with patch addresses, circuit assignments, mode and notes.<br />
              <span className='text-xs text-gray-400 mt-1 block'>A4 portrait</span>
            </div>
          )}
          {tab === 'equipment' && (
            <div className='text-sm text-gray-600'>
              Groups fixtures by model with quantities, total weight and power draw.<br />
              <span className='text-xs text-gray-400 mt-1 block'>A4 portrait</span>
            </div>
          )}
          {tab === 'cable' && (
            <div className='text-sm text-gray-600'>
              Cable schedule by type with run-by-run lengths, from/to nodes, and optimal length breakdown.<br />
              <span className='text-xs text-gray-400 mt-1 block'>A4 portrait</span>
            </div>
          )}
          {tab === 'power' && (
            <div className='text-sm text-gray-600'>
              Power summary, per-distro load breakdown with circuit-by-circuit utilisation, and phase balance tables for 3Ø distros.<br />
              <span className='text-xs text-gray-400 mt-1 block'>A4 portrait</span>
            </div>
          )}
          {tab === 'groups' && (
            <div className='text-sm text-gray-600'>
              Fixture groups with member lists, per-fixture patch addresses, power draw and weight totals.<br />
              <span className='text-xs text-gray-400 mt-1 block'>A4 portrait</span>
            </div>
          )}
        </div>

        <div className='px-5 py-4 border-t border-gray-200 flex justify-end gap-2'>
          <button onClick={onClose} className='px-4 py-2 text-sm text-gray-600 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors'>Cancel</button>
          <button
            onClick={handleExport}
            disabled={exporting || (tab === 'plot' && selectedLayers.size === 0)}
            className={cn('flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
              exporting || (tab === 'plot' && selectedLayers.size === 0)
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700')}
          >
            <Download size={14} />
            {exporting ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>
      </div>
    </div>
  )
}
