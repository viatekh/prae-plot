import { useNavigate } from 'react-router-dom'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import {
  Save, ChevronLeft, Download, FolderOpen, LayoutTemplate, BookOpen,
  MousePointer2, Hand, Square, Pentagon, Circle, Type, Zap, Bolt,
  Cable, Layers, Settings, Image, Minus, Users, Monitor,
} from 'lucide-react'
import { useProjectStore } from '../store/projectStore'
import { formatVersion, loadImageFile } from '../lib/utils'
// Loaded on demand — it pulls in jsPDF, which is most of the bundle.
const ExportModal = lazy(() => import('../components/shared/ExportModal'))
import type { Project } from '../types'
import PlotCanvas from '../components/canvas/PlotCanvas'
import FixtureLibrary from '../components/panels/FixtureLibrary'
import LayersPanel from '../components/panels/LayersPanel'
import PropertiesPanel from '../components/panels/PropertiesPanel'
import CircuitPanel from '../components/panels/CircuitPanel'
import CablePanel from '../components/panels/CablePanel'
import SettingsPanel from '../components/panels/SettingsPanel'
import GroupsPanel from '../components/panels/GroupsPanel'
import DevicesPanel from '../components/panels/DevicesPanel'
import PatchSheet from '../components/documents/PatchSheet'
import EquipmentReport from '../components/documents/EquipmentReport'
import CableReport from '../components/documents/CableReport'
import PowerReport from '../components/documents/PowerReport'
import NetworkTopology from '../components/documents/NetworkTopology'
import DMXTopology from '../components/documents/DMXTopology'
import ProjectInfoModal from '../components/shared/ProjectInfoModal'
import { cn } from '../lib/utils'
import type { ToolType } from '../types'

// ── Resize handle ─────────────────────────────────────────────
function ResizeHandle({ onStart, onDelta }: { onStart: () => void; onDelta: (delta: number) => void }) {
  return (
    <div
      className='w-1 shrink-0 cursor-col-resize bg-gray-200 hover:bg-blue-400 transition-colors select-none'
      onMouseDown={(e) => {
        e.preventDefault()
        onStart()
        const startX = e.clientX
        const onMove = (ev: MouseEvent) => onDelta(ev.clientX - startX)
        const onUp = () => {
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
      }}
    />
  )
}

// ── Thin divider for the icon strip ──────────────────────────
function Divider() {
  return <div className='w-7 h-px bg-gray-200 mx-auto my-0.5 shrink-0' />
}

// ── Single icon strip button ──────────────────────────────────
function StripBtn({
  icon, label, active, onClick, danger,
}: {
  icon: React.ReactNode; label: string; active?: boolean; onClick: () => void; danger?: boolean
}) {
  return (
    <button
      title={label}
      onClick={onClick}
      className={cn(
        'flex items-center justify-center w-9 h-9 rounded transition-colors shrink-0',
        danger ? 'text-orange-500 hover:bg-orange-50' :
        active  ? 'bg-blue-600 text-white'
                : 'text-gray-500 hover:bg-gray-100',
      )}
    >
      {icon}
    </button>
  )
}

export default function EditorPage() {
  const navigate = useNavigate()
  const {
    project, isDirty, saveProject, view,
    activeTool, setActiveTool,
    activeLeftPanel, setActiveLeftPanel,
    mergeProject, lastAutosave,
    setBackgroundImage, setProjectInfoModalOpen,
  } = useProjectStore()

  const [appMode, setAppMode] = useState<'plot' | 'documents'>('plot')
  const [docTab, setDocTab] = useState<'patch' | 'equipment' | 'cable' | 'power' | 'network' | 'dmx'>('patch')
  const [showExport, setShowExport] = useState(false)

  const [leftDrawerW, setLeftDrawerW] = useState(240)
  const [rightW, setRightW] = useState(280)
  const leftDrawerBase = useRef(240)
  const rightBase = useRef(280)

  // Autosave: on a timer, when the tab is hidden, and before the page unloads.
  useEffect(() => {
    const autosaveIfDirty = () => {
      if (useProjectStore.getState().isDirty) useProjectStore.getState().autosave()
    }
    const id = setInterval(autosaveIfDirty, 30_000)
    const onHide = () => { if (document.visibilityState === 'hidden') autosaveIfDirty() }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      autosaveIfDirty()
      if (useProjectStore.getState().isDirty) e.preventDefault()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [])

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const imported = JSON.parse(await file.text()) as Project
        if (!Array.isArray(imported.fixtures) || !Array.isArray(imported.elements)) throw new Error('not a project')
        mergeProject(imported)
      } catch { alert('Could not import: invalid project file.') }
    }
    input.click()
  }

  const handleBgImage = async () => {
    try {
      const { src, width, height } = await loadImageFile()
      const targetW = 20
      const targetH = (height / width) * targetW
      setBackgroundImage({ src, x: 0, y: 0, width: targetW, height: targetH, rotation: 0, opacity: 0.4, visible: true, locked: false })
    } catch { /* cancelled */ }
  }

  if (!project) { navigate('/'); return null }

  // Panel toggles — clicking active panel closes it
  const togglePanel = (id: typeof activeLeftPanel) => {
    setActiveLeftPanel(activeLeftPanel === id ? null : id)
  }

  // Tool buttons — activate tool; some also open a panel
  const tool = (id: ToolType) => {
    setActiveTool(id)
    // cable tool auto-opens cable panel (done in store), others close it
    if (id !== 'cable' && activeLeftPanel === 'cable') setActiveLeftPanel(null)
  }

  return (
    <div className='flex flex-col h-screen overflow-hidden bg-gray-100'>
      <ProjectInfoModal />
      {showExport && (
        <Suspense fallback={null}>
          <ExportModal project={project} onClose={() => setShowExport(false)} />
        </Suspense>
      )}

      {/* ── Top bar ──────────────────────────────────────────── */}
      <header className='h-11 bg-gray-900 flex items-center px-3 gap-2 shrink-0'>
        <button onClick={() => navigate('/')} className='text-gray-400 hover:text-white transition-colors'>
          <ChevronLeft size={18} />
        </button>

        <button
          onClick={() => setProjectInfoModalOpen(true)}
          className='flex items-center gap-2 mr-1 hover:bg-gray-800 px-2 py-1 rounded transition-colors group'
          title='Edit project settings'
        >
          <Zap size={15} className='text-blue-400' />
          <span className='text-white text-sm font-semibold truncate max-w-44'>{project.info.name}</span>
          <Settings size={11} className='text-gray-600 group-hover:text-gray-400 transition-colors shrink-0' />
        </button>
        <span className='text-gray-500 text-xs truncate max-w-28 hidden md:block'>{project.info.venue}</span>

        <div className='flex bg-gray-800 rounded overflow-hidden mx-2'>
          <button
            onClick={() => setAppMode('plot')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
              appMode === 'plot' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white')}
          >
            <LayoutTemplate size={12} /> Plot
          </button>
          <button
            onClick={() => setAppMode('documents')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
              appMode === 'documents' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white')}
          >
            <BookOpen size={12} /> Documents
          </button>
        </div>

        <div className='flex-1' />

        <span className='text-gray-500 text-xs font-mono'>{formatVersion(project.version)}{isDirty ? ' *' : ''}</span>

        <button onClick={handleImport} title='Import fixtures from another project'
          className='flex items-center gap-1.5 text-xs text-gray-300 hover:text-white px-2 py-1 rounded hover:bg-gray-700 transition-colors'>
          <FolderOpen size={13} /><span className='hidden md:inline'>Import</span>
        </button>

        <button onClick={() => setShowExport(true)}
          className='flex items-center gap-1.5 text-xs text-gray-300 hover:text-white px-2 py-1 rounded hover:bg-gray-700 transition-colors'>
          <Download size={13} /><span className='hidden md:inline'>Export</span>
        </button>

        <button onClick={saveProject}
          className={cn('flex items-center gap-1.5 text-xs px-3 py-1.5 rounded font-medium transition-colors',
            isDirty ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-gray-400 hover:text-white hover:bg-gray-700')}>
          <Save size={13} /><span className='hidden sm:inline'>Save</span>
        </button>
      </header>

      {/* ── Documents mode ─────────────────────────────────────── */}
      {appMode === 'documents' && (
        <div className='flex flex-col flex-1 overflow-hidden bg-white'>
          <div className='flex border-b border-gray-200 px-4 shrink-0'>
            {(['patch', 'equipment', 'cable', 'power', 'network', 'dmx'] as const).map((t) => (
              <button key={t} onClick={() => setDocTab(t)}
                className={cn('px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                  docTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700')}>
                {t === 'patch' ? 'Patch Sheet' : t === 'equipment' ? 'Equipment' : t === 'cable' ? 'Cables' : t === 'power' ? 'Power' : t === 'network' ? 'Network' : 'DMX Map'}
              </button>
            ))}
            <div className='flex-1' />
            <span className='self-center text-xs text-gray-400 pr-3'>
              Generated {new Date().toLocaleString()}
            </span>
            <button onClick={() => setShowExport(true)}
              className='my-1.5 flex items-center gap-1.5 text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition-colors'>
              <Download size={12} /> Export PDF
            </button>
          </div>
          <div className='flex-1 overflow-auto p-6'>
            {docTab === 'patch'     && <PatchSheet />}
            {docTab === 'equipment' && <EquipmentReport />}
            {docTab === 'cable'     && <CableReport />}
            {docTab === 'power'     && <PowerReport />}
            {docTab === 'network'   && <NetworkTopology />}
            {docTab === 'dmx'       && <DMXTopology />}
          </div>
        </div>
      )}

      {/* ── Plot mode ──────────────────────────────────────────── */}
      {appMode === 'plot' && (
        <div className='flex flex-1 overflow-hidden'>

          {/* ── Left icon strip ──────────────────────────────── */}
          <div className='w-12 bg-white border-r border-gray-200 flex flex-col items-center py-1.5 gap-0.5 shrink-0 overflow-y-auto'>

            {/* Settings */}
            <StripBtn icon={<Settings size={16} />} label='Settings' active={activeLeftPanel === 'settings'} onClick={() => togglePanel('settings')} />

            <Divider />

            {/* Drawing tools */}
            <StripBtn icon={<MousePointer2 size={16} />} label='Select (V)' active={activeTool === 'select'} onClick={() => tool('select')} />
            <StripBtn icon={<Hand size={16} />}          label='Pan (H)'    active={activeTool === 'pan'}    onClick={() => tool('pan')} />
            <StripBtn icon={<Square size={16} />}        label='Rectangle (R)' active={activeTool === 'rect'}    onClick={() => tool('rect')} />
            <StripBtn icon={<Pentagon size={16} />}      label='Polygon (P)'   active={activeTool === 'polygon'} onClick={() => tool('polygon')} />
            <StripBtn icon={<Circle size={16} />}        label='Circle / Ellipse (E)' active={activeTool === 'ellipse'} onClick={() => tool('ellipse')} />
            <StripBtn icon={<Minus size={16} />}         label='Truss / Bar (T)' active={activeTool === 'truss'} onClick={() => tool('truss')} />

            <Divider />

            {/* Panels / content tools */}
            <StripBtn icon={<Bolt size={16} />}    label='Fixtures' active={activeLeftPanel === 'fixtures' || activeTool === 'fixture'} onClick={() => { togglePanel('fixtures'); if (activeTool !== 'fixture') setActiveTool('fixture') }} />
            <StripBtn icon={<Zap size={16} />}     label='Power & Circuits' active={activeLeftPanel === 'power'} onClick={() => togglePanel('power')} />
            <StripBtn icon={<Cable size={16} />}   label='Cable (C)' active={activeTool === 'cable'} onClick={() => tool('cable')} />
            <StripBtn icon={<Monitor size={16} />} label='Devices (consoles, splitters…)' active={activeLeftPanel === 'devices'} onClick={() => togglePanel('devices')} />
            <StripBtn icon={<Users size={16} />}   label='Groups' active={activeLeftPanel === 'groups'} onClick={() => togglePanel('groups')} />
            <StripBtn icon={<Layers size={16} />}  label='Layers' active={activeLeftPanel === 'layers'} onClick={() => togglePanel('layers')} />

            <Divider />

            {/* Annotation & image */}
            <StripBtn icon={<Type size={16} />}  label='Text (X)' active={activeTool === 'text'} onClick={() => tool('text')} />
            <StripBtn icon={<Image size={16} />} label='Import background image' onClick={handleBgImage} />
          </div>

          {/* Left drawer (resizable) */}
          {activeLeftPanel && (
            <>
              <div style={{ width: leftDrawerW }} className='bg-white border-r border-gray-200 flex flex-col overflow-hidden shrink-0'>
                {activeLeftPanel === 'settings'  && <SettingsPanel />}
                {activeLeftPanel === 'fixtures'  && <FixtureLibrary />}
                {activeLeftPanel === 'power'     && <CircuitPanel />}
                {activeLeftPanel === 'cable'     && <CablePanel />}
                {activeLeftPanel === 'devices'   && <DevicesPanel />}
                {activeLeftPanel === 'groups'    && <GroupsPanel />}
                {activeLeftPanel === 'layers'    && <LayersPanel />}
              </div>
              <ResizeHandle
                onStart={() => { leftDrawerBase.current = leftDrawerW }}
                onDelta={(d) => setLeftDrawerW(Math.max(180, Math.min(480, leftDrawerBase.current + d)))}
              />
            </>
          )}

          {/* Canvas */}
          <PlotCanvas />

          {/* Right resize handle */}
          <ResizeHandle
            onStart={() => { rightBase.current = rightW }}
            onDelta={(d) => setRightW(Math.max(220, Math.min(520, rightBase.current - d)))}
          />

          {/* Right sidebar — ONLY Properties */}
          <div style={{ width: rightW }} className='bg-white border-l border-gray-200 flex flex-col overflow-hidden shrink-0'>
            <div className='px-3 py-2 border-b border-gray-200 shrink-0 flex items-center justify-between'>
              <span className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>Properties</span>
            </div>
            <div className='flex-1 overflow-y-auto'>
              <PropertiesPanel />
            </div>
            <div className='shrink-0 border-t border-gray-200 px-2 py-1 flex items-center gap-2 text-xs text-gray-400 flex-wrap'>
              <span className='font-mono'>{Math.round(view.scale * 100)}%</span>
              <span>{project.fixtures.length} fx</span>
              {project.fixtures.length > 0 && <>
                <span>{(project.fixtures.reduce((s, f) => s + f.powerRating, 0) / 1000).toFixed(1)}kW</span>
                <span>{project.fixtures.reduce((s, f) => s + f.weight, 0).toFixed(1)}kg</span>
              </>}
              {lastAutosave && <span className='text-green-400' title={`Autosaved ${new Date(lastAutosave).toLocaleTimeString()}`}>✓</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
