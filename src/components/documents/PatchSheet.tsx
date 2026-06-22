import { useProjectStore, formatCircuitRef } from '../../store/projectStore'

function HeaderRow() {
  return (
    <tr className='bg-gray-800 text-white text-xs'>
      <th className='px-3 py-2 text-left w-14'>CH</th>
      <th className='px-3 py-2 text-left'>CIRCUIT</th>
      <th className='px-3 py-2 text-left'>NAME</th>
      <th className='px-3 py-2 text-left w-24'>PATCH</th>
      <th className='px-3 py-2 text-left w-32'>MODE</th>
      <th className='px-3 py-2 text-left w-16'>CH CNT</th>
      <th className='px-3 py-2 text-left w-20'>COLOUR</th>
      <th className='px-3 py-2 text-left'>NOTES</th>
    </tr>
  )
}

export default function PatchSheet() {
  const { project } = useProjectStore()
  if (!project) return null

  const fixtures = [...project.fixtures].sort((a, b) => a.channel - b.channel)
  const distros = project.distros

  return (
    <div className='overflow-x-auto'>
      <div className='text-sm font-semibold text-gray-700 mb-3'>Patch Sheet</div>
      <table className='w-full text-xs border-collapse'>
        <thead>
          <HeaderRow />
        </thead>
        <tbody>
          {fixtures.length === 0 && (
            <tr>
              <td colSpan={8} className='px-3 py-4 text-center text-gray-400'>No fixtures placed yet.</td>
            </tr>
          )}
          {fixtures.map((f, i) => (
            <tr key={f.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className='px-3 py-1.5 font-mono font-bold text-gray-800'>{f.channel || '—'}</td>
              <td className='px-3 py-1.5 text-gray-600 font-mono'>{formatCircuitRef(distros, f.circuitId)}</td>
              <td className='px-3 py-1.5 font-medium text-gray-800'>{f.manufacturer} {f.model}</td>
              <td className='px-3 py-1.5 font-mono text-gray-700'>{f.universe}.{String(f.address).padStart(3, '0')}</td>
              <td className='px-3 py-1.5 text-gray-600'>{f.mode}</td>
              <td className='px-3 py-1.5 text-gray-600'>{f.channelCount || '—'}</td>
              <td className='px-3 py-1.5 text-gray-600'>{f.color || '—'}</td>
              <td className='px-3 py-1.5 text-gray-500'>{f.notes || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className='mt-2 text-xs text-gray-400 text-right'>{fixtures.length} fixture{fixtures.length !== 1 ? 's' : ''}</div>
    </div>
  )
}
