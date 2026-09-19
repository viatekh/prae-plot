import { Ruler, PenLine } from 'lucide-react'
import type { DrawingMode } from '../../types'
import { cn } from '../../lib/utils'

const MODES: { value: DrawingMode; icon: React.ReactNode; title: string; blurb: string }[] = [
  {
    value: 'scaled',
    icon: <Ruler size={16} />,
    title: 'Scaled drawing',
    blurb: 'Positions are metres. Sheets print at a true scale with a scale bar, and lengths are measured off the plot.',
  },
  {
    value: 'freeform',
    icon: <PenLine size={16} />,
    title: 'Freeform sketch',
    blurb: 'A schematic. Nothing is measured off the drawing and sheets print "not to scale". Cable lengths are typed in.',
  },
]

/** Shared by the new-project screen and project settings. */
export function DrawingModePicker({ value, onChange }: { value: DrawingMode; onChange: (v: DrawingMode) => void }) {
  return (
    <div>
      <div className='text-xs font-medium text-gray-600 mb-1.5'>Drawing mode</div>
      <div className='grid grid-cols-2 gap-2'>
        {MODES.map((m) => (
          <button
            key={m.value}
            type='button'
            onClick={() => onChange(m.value)}
            aria-pressed={value === m.value}
            className={cn('text-left rounded-lg border p-3 transition-colors',
              value === m.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300')}
          >
            <div className={cn('flex items-center gap-1.5 text-sm font-medium',
              value === m.value ? 'text-blue-700' : 'text-gray-700')}>
              {m.icon}{m.title}
            </div>
            <div className='text-xs text-gray-500 mt-1 leading-snug'>{m.blurb}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
