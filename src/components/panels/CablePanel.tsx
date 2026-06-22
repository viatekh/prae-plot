import { useProjectStore } from '../../store/projectStore'
import { CABLE_COLORS, CABLE_LABELS, CABLE_GROUPS } from '../../types'
import type { CableType } from '../../types'

export default function CablePanel() {
  const { activeCableType, setActiveCableType } = useProjectStore()

  return (
    <div className='flex flex-col h-full overflow-y-auto'>
      <div className='px-3 py-2.5 border-b border-gray-200 shrink-0'>
        <span className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>Cable Type</span>
      </div>

      <div className='p-2 text-xs text-gray-400 border-b border-gray-100'>
        Select before drawing. Click to start vertices, click fixture/distro to finish.
      </div>

      <div className='flex flex-col p-2 gap-3 overflow-y-auto flex-1'>
        {CABLE_GROUPS.map((grp) => (
          <div key={grp.label}>
            <div className='text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1 px-1'>{grp.label}</div>
            <div className='flex flex-col gap-0.5'>
              {grp.types.map((t: CableType) => (
                <button
                  key={t}
                  onClick={() => setActiveCableType(t)}
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded text-xs transition-colors text-left ${
                    activeCableType === t
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <span
                    className='w-2.5 h-2.5 rounded-full shrink-0 border border-black/10'
                    style={{ background: CABLE_COLORS[t] }}
                  />
                  <span>{CABLE_LABELS[t]}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
