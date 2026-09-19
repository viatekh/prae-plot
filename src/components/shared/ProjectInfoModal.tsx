import { useState } from 'react'
import { X, Upload } from 'lucide-react'
import { useProjectStore } from '../../store/projectStore'
import type { ProjectInfo, DrawingMode } from '../../types'
import { DrawingModePicker } from './DrawingModePicker'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className='block text-xs font-medium text-gray-600 mb-1'>{label}</label>
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
      className='w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
    />
  )
}

function LogoUpload({ label, value, onChange }: { label: string; value?: string; onChange: (v: string | undefined) => void }) {
  const handleFile = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/svg+xml,image/webp'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (e) => onChange(e.target?.result as string)
      reader.readAsDataURL(file)
    }
    input.click()
  }

  return (
    <div>
      <label className='block text-xs font-medium text-gray-600 mb-1'>{label}</label>
      <div className='flex items-center gap-2'>
        {value ? (
          <>
            <img src={value} alt='logo' className='h-10 max-w-24 object-contain border border-gray-200 rounded p-1 bg-white' />
            <button onClick={() => onChange(undefined)} className='text-xs text-red-400 hover:text-red-600'>Remove</button>
          </>
        ) : (
          <button
            onClick={handleFile}
            className='flex items-center gap-1.5 text-xs text-gray-500 border border-dashed border-gray-300 rounded px-3 py-2 hover:bg-gray-50 transition-colors'
          >
            <Upload size={12} /> Upload logo
          </button>
        )}
        {value && <button onClick={handleFile} className='text-xs text-blue-500 hover:text-blue-700'>Change</button>}
      </div>
    </div>
  )
}

export default function ProjectInfoModal() {
  const { project, projectInfoModalOpen } = useProjectStore()
  if (!projectInfoModalOpen || !project) return null
  // Mounting the form only while the dialog is open seeds it from the project
  // once, instead of re-seeding it on every unrelated store update.
  return <ProjectInfoForm initial={project.info} initialMode={project.drawingMode ?? 'scaled'} />
}

function ProjectInfoForm({ initial, initialMode }: { initial: ProjectInfo; initialMode: DrawingMode }) {
  const { setProjectInfoModalOpen, updateProjectInfo, setDrawingMode } = useProjectStore()
  const [form, setForm] = useState<ProjectInfo>({ ...initial })
  const [mode, setMode] = useState<DrawingMode>(initialMode)

  const upd = (field: keyof ProjectInfo) => (value: string | undefined) =>
    setForm((f) => ({ ...f, [field]: value }))

  const handleSave = () => {
    updateProjectInfo(form)
    setDrawingMode(mode)
    setProjectInfoModalOpen(false)
  }

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40' onClick={() => setProjectInfoModalOpen(false)}>
      <div className='bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto' onClick={(e) => e.stopPropagation()}>
        <div className='flex items-center justify-between px-6 py-4 border-b border-gray-200'>
          <h2 className='text-lg font-semibold text-gray-800'>Project Information</h2>
          <button onClick={() => setProjectInfoModalOpen(false)} className='text-gray-400 hover:text-gray-600 transition-colors'>
            <X size={20} />
          </button>
        </div>

        <div className='p-6 grid grid-cols-2 gap-4'>
          <Field label='Project Name *'>
            <Input value={form.name} onChange={upd('name') as (v: string) => void} placeholder='Festival Main Stage' />
          </Field>
          <Field label='Venue'>
            <Input value={form.venue} onChange={upd('venue') as (v: string) => void} placeholder='Venue name' />
          </Field>
          <Field label='Venue Address'>
            <Input value={form.venueAddress} onChange={upd('venueAddress') as (v: string) => void} placeholder='City, Country' />
          </Field>
          <Field label='Project Date'>
            <Input type='date' value={form.projectDate} onChange={upd('projectDate') as (v: string) => void} />
          </Field>
          <Field label='Lighting Designer'>
            <Input value={form.lightingDesigner} onChange={upd('lightingDesigner') as (v: string) => void} />
          </Field>
          <Field label='Technical Director'>
            <Input value={form.technicalDirector} onChange={upd('technicalDirector') as (v: string) => void} />
          </Field>
          <Field label='Drawing Author'>
            <Input value={form.drawingAuthor} onChange={upd('drawingAuthor') as (v: string) => void} />
          </Field>
          <Field label='Company Name'>
            <Input value={form.companyName} onChange={upd('companyName') as (v: string) => void} />
          </Field>
          <Field label='Client Name'>
            <Input value={form.clientName ?? ''} onChange={upd('clientName') as (v: string) => void} placeholder='Optional' />
          </Field>

          <div className='col-span-2 border-t border-gray-200 pt-4'>
            <DrawingModePicker value={mode} onChange={setMode} />
          </div>

          <div className='col-span-2 border-t border-gray-200 pt-4 grid grid-cols-2 gap-4'>
            <LogoUpload label='Company Logo' value={form.companyLogo} onChange={(v) => setForm((f) => f ? { ...f, companyLogo: v } : f)} />
            <LogoUpload label='Client Logo (optional)' value={form.clientLogo} onChange={(v) => setForm((f) => f ? { ...f, clientLogo: v } : f)} />
          </div>
        </div>

        <div className='flex justify-end gap-3 px-6 pb-6'>
          <button onClick={() => setProjectInfoModalOpen(false)} className='px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors'>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!form.name.trim()}
            className='px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors font-medium'
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
