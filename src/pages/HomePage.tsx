import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FolderOpen, Zap, History, X } from 'lucide-react'
import { useProjectStore, readAutosave, clearAutosave } from '../store/projectStore'
import { loadJSONFile } from '../lib/utils'
import type { ProjectInfo, Project, DrawingMode } from '../types'
import { DrawingModePicker } from '../components/shared/DrawingModePicker'

const EMPTY_INFO: ProjectInfo = {
  name: '',
  venue: '',
  venueAddress: '',
  projectDate: new Date().toISOString().slice(0, 10),
  lightingDesigner: '',
  technicalDirector: '',
  drawingAuthor: '',
  companyName: '',
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className='block text-xs font-medium text-gray-600 mb-1'>
        {label}{required && <span className='text-red-500 ml-0.5'>*</span>}
      </label>
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className='w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
    />
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  const { createProject, loadProject } = useProjectStore()
  const [info, setInfo] = useState<ProjectInfo>(EMPTY_INFO)
  const [creating, setCreating] = useState(false)
  const [mode, setMode] = useState<DrawingMode>('scaled')
  const [autosave, setAutosave] = useState(() => readAutosave())
  const [openError, setOpenError] = useState<string | null>(null)

  const upd = (field: keyof ProjectInfo) => (value: string) => setInfo((i) => ({ ...i, [field]: value }))

  const handleCreate = () => {
    if (!info.name.trim()) return
    createProject(info, mode)
    navigate('/editor')
  }

  const handleOpen = async () => {
    let data: object
    try {
      data = await loadJSONFile()
    } catch {
      return // cancelled, or unreadable file
    }
    const project = data as Project
    if (!project?.info || !Array.isArray(project.fixtures) || !Array.isArray(project.elements)) {
      setOpenError('That file is not a Prae Plot project.')
      return
    }
    setOpenError(null)
    loadProject(project)
    navigate('/editor')
  }

  const handleRestore = () => {
    if (!autosave) return
    loadProject(autosave.project)
    navigate('/editor')
  }

  return (
    <div className='min-h-screen bg-gray-50 flex items-center justify-center p-8'>
      <div className='w-full max-w-2xl'>
        {/* Logo / Brand */}
        <div className='flex items-center gap-3 mb-10'>
          <div className='w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center'>
            <Zap size={22} className='text-white' />
          </div>
          <div>
            <div className='text-2xl font-bold text-gray-900'>Prae Plot</div>
            <div className='text-sm text-gray-400'>Stage lighting plot editor</div>
          </div>
        </div>

        {creating ? (
          <div className='bg-white rounded-2xl shadow-sm border border-gray-200 p-8'>
            <h2 className='text-lg font-semibold text-gray-800 mb-6'>New Project</h2>
            <div className='grid grid-cols-2 gap-4'>
              <Field label='Project Name' required>
                <Input value={info.name} onChange={upd('name')} placeholder='Festival Main Stage' />
              </Field>
              <Field label='Company Name'>
                <Input value={info.companyName} onChange={upd('companyName')} placeholder='Your company' />
              </Field>
              <Field label='Venue'>
                <Input value={info.venue} onChange={upd('venue')} placeholder='Venue name' />
              </Field>
              <Field label='Venue Address'>
                <Input value={info.venueAddress} onChange={upd('venueAddress')} placeholder='City, Country' />
              </Field>
              <Field label='Project Date'>
                <Input type='date' value={info.projectDate} onChange={upd('projectDate')} />
              </Field>
              <Field label='Lighting Designer'>
                <Input value={info.lightingDesigner} onChange={upd('lightingDesigner')} />
              </Field>
              <Field label='Technical Director'>
                <Input value={info.technicalDirector} onChange={upd('technicalDirector')} />
              </Field>
              <Field label='Drawing Author'>
                <Input value={info.drawingAuthor} onChange={upd('drawingAuthor')} />
              </Field>
            </div>

            <div className='mt-6'>
              <DrawingModePicker value={mode} onChange={setMode} />
            </div>

            <div className='flex gap-3 mt-8'>
              <button
                onClick={handleCreate}
                disabled={!info.name.trim()}
                className='flex-1 bg-blue-600 text-white font-medium py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
              >
                Create Project
              </button>
              <button
                onClick={() => setCreating(false)}
                className='px-6 text-gray-500 hover:text-gray-700 transition-colors'
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className='flex flex-col gap-4'>
            {autosave && (
              <div className='flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3'>
                <History size={18} className='text-amber-600 shrink-0' />
                <div className='flex-1 min-w-0'>
                  <div className='text-sm font-medium text-gray-800 truncate'>
                    Unsaved work: {autosave.project.info.name || 'Untitled project'}
                  </div>
                  <div className='text-xs text-gray-500'>
                    Autosaved{autosave.savedAt ? ` ${new Date(autosave.savedAt).toLocaleString()}` : ''}
                    {' · '}{autosave.project.fixtures.length} fixtures
                  </div>
                </div>
                <button
                  onClick={handleRestore}
                  className='text-xs font-medium bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700 transition-colors shrink-0'
                >
                  Restore
                </button>
                <button
                  title='Discard autosave'
                  onClick={() => { clearAutosave(); setAutosave(null) }}
                  className='text-amber-400 hover:text-amber-700 transition-colors shrink-0'
                >
                  <X size={15} />
                </button>
              </div>
            )}

            {openError && (
              <div className='text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2'>{openError}</div>
            )}

            <div className='grid grid-cols-2 gap-4'>
            <button
              onClick={() => setCreating(true)}
              className='bg-white border border-gray-200 rounded-2xl p-8 flex flex-col items-center gap-3 hover:border-blue-300 hover:shadow-md transition-all group'
            >
              <div className='w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center group-hover:bg-blue-100 transition-colors'>
                <Plus size={24} className='text-blue-600' />
              </div>
              <div className='text-center'>
                <div className='font-semibold text-gray-800'>New Project</div>
                <div className='text-sm text-gray-400 mt-1'>Start a fresh plot</div>
              </div>
            </button>

            <button
              onClick={handleOpen}
              className='bg-white border border-gray-200 rounded-2xl p-8 flex flex-col items-center gap-3 hover:border-blue-300 hover:shadow-md transition-all group'
            >
              <div className='w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center group-hover:bg-gray-100 transition-colors'>
                <FolderOpen size={24} className='text-gray-500' />
              </div>
              <div className='text-center'>
                <div className='font-semibold text-gray-800'>Open Project</div>
                <div className='text-sm text-gray-400 mt-1'>Load a .json file</div>
              </div>
            </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
