import { useProjectStore } from '../../store/projectStore'
import { channelHookup, instrumentSchedule, patchByUniverse } from '../../lib/schedules'
import { cn } from '../../lib/utils'

// The three standard schedules. Each is the same rig sorted a different way;
// lib/schedules.ts builds the rows and the PDF export prints the same ones.

const TH = 'px-3 py-2 text-left font-semibold'
const TD = 'px-3 py-1.5'

function Empty() {
  return <div className='px-3 py-10 text-center text-sm text-gray-400'>No fixtures placed yet.</div>
}

function Title({ children, hint }: { children: React.ReactNode; hint: string }) {
  return (
    <div className='mb-3'>
      <div className='text-sm font-semibold text-gray-700'>{children}</div>
      <div className='text-xs text-gray-400'>{hint}</div>
    </div>
  )
}

function GroupHeading({ title, detail }: { title: string; detail: string }) {
  return (
    <div className='flex items-baseline justify-between border-b-2 border-gray-800 pb-1 mt-6 mb-0 first:mt-0'>
      <span className='text-xs font-bold uppercase tracking-widest text-gray-800'>{title}</span>
      <span className='text-xs text-gray-500'>{detail}</span>
    </div>
  )
}

const watts = (w: number) => (w >= 1000 ? `${(w / 1000).toFixed(1)} kW` : `${Math.round(w)} W`)
const dash = (v: string | number) => (v === '' || v === 0 || v === '—' ? <span className='text-gray-300'>—</span> : v)

/** Patch in address order, one block per universe. */
export default function PatchSheet() {
  const { project } = useProjectStore()
  if (!project) return null
  const universes = patchByUniverse(project)

  return (
    <div className='overflow-x-auto max-w-5xl'>
      <Title hint='Every fixture in address order, universe by universe. Overlapping addresses are flagged.'>Patch Sheet</Title>
      {universes.length === 0 && <Empty />}
      {universes.map((u) => {
        const clashes = u.rows.filter((r) => r.clash).length
        return (
          <div key={u.universe}>
            <GroupHeading
              title={`Universe ${u.universe}`}
              detail={`${u.used} of 512 used · ${512 - u.used} free${clashes ? ` · ${clashes} in conflict` : ''}`}
            />
            <table className='w-full text-xs border-collapse'>
              <thead>
                <tr className='text-gray-500 uppercase tracking-wider text-[10px] border-b border-gray-200'>
                  <th className={cn(TH, 'w-20')}>Address</th>
                  <th className={cn(TH, 'w-24')}>Range</th>
                  <th className={cn(TH, 'w-16')}>Chan</th>
                  <th className={TH}>Fixture</th>
                  <th className={cn(TH, 'w-32')}>Mode</th>
                  <th className={cn(TH, 'w-20')}>Footprint</th>
                  <th className={cn(TH, 'w-28')}>Position</th>
                  <th className={cn(TH, 'w-14')}>Unit</th>
                </tr>
              </thead>
              <tbody>
                {u.rows.map((r, i) => (
                  <tr key={r.id} className={cn(r.clash ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50')}>
                    <td className={cn(TD, 'font-mono font-bold', r.clash ? 'text-red-600' : 'text-gray-800')}>{r.patch}</td>
                    <td className={cn(TD, 'font-mono text-gray-500')}>
                      {r.footprint > 1 ? `${r.address}–${r.endAddress}` : r.address}
                      {r.clash && <span className='ml-1.5 text-[10px] font-bold text-red-600'>CLASH</span>}
                    </td>
                    <td className={cn(TD, 'font-mono text-gray-700')}>{dash(r.channel)}</td>
                    <td className={cn(TD, 'font-medium text-gray-800')}>{r.type}</td>
                    <td className={cn(TD, 'text-gray-600')}>{r.mode}</td>
                    <td className={cn(TD, 'text-gray-600')}>{r.footprint}</td>
                    <td className={cn(TD, 'text-gray-600')}>{dash(r.position)}</td>
                    <td className={cn(TD, 'text-gray-600')}>{dash(r.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

/** The rig in the order the desk sees it. */
export function ChannelHookup() {
  const { project } = useProjectStore()
  if (!project) return null
  const rows = channelHookup(project)

  return (
    <div className='overflow-x-auto max-w-5xl'>
      <Title hint='Every fixture in channel order — what each channel is, where it hangs and what it is for.'>Channel Hookup</Title>
      {rows.length === 0 ? <Empty /> : (
        <table className='w-full text-xs border-collapse'>
          <thead>
            <tr className='text-gray-500 uppercase tracking-wider text-[10px] border-b-2 border-gray-800'>
              <th className={cn(TH, 'w-16')}>Chan</th>
              <th className={cn(TH, 'w-20')}>Address</th>
              <th className={cn(TH, 'w-28')}>Position</th>
              <th className={cn(TH, 'w-14')}>Unit</th>
              <th className={TH}>Instrument</th>
              <th className={TH}>Purpose</th>
              <th className={cn(TH, 'w-20')}>Colour</th>
              <th className={cn(TH, 'w-28')}>Circuit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className={cn(TD, 'font-mono font-bold text-gray-900')}>{r.channel ? `(${r.channel})` : dash('')}</td>
                <td className={cn(TD, 'font-mono text-gray-700')}>{r.patch}</td>
                <td className={cn(TD, 'text-gray-600')}>{dash(r.position)}</td>
                <td className={cn(TD, 'text-gray-600')}>{dash(r.unit)}</td>
                <td className={cn(TD, 'font-medium text-gray-800')}>{r.type}</td>
                <td className={cn(TD, 'text-gray-600')}>{dash(r.purpose)}</td>
                <td className={cn(TD, 'text-gray-600')}>{dash(r.colour)}</td>
                <td className={cn(TD, 'font-mono text-gray-500')}>{dash(r.circuit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/** The rig in the order it is hung: position by position, unit by unit. */
export function InstrumentSchedule() {
  const { project } = useProjectStore()
  if (!project) return null
  const groups = instrumentSchedule(project)

  return (
    <div className='overflow-x-auto max-w-5xl'>
      <Title hint='Fixtures grouped by the truss they hang on, numbered along it. Drag a fixture onto a truss to assign it.'>
        Instrument Schedule
      </Title>
      {groups.length === 0 && <Empty />}
      {groups.map((g) => (
        <div key={g.name}>
          <GroupHeading
            title={g.trim != null ? `${g.name} · trim ${g.trim.toFixed(2)} m` : g.name}
            detail={`${g.rows.length} unit${g.rows.length !== 1 ? 's' : ''} · ${watts(g.watts)} · ${g.weight.toFixed(1)} kg`}
          />
          <table className='w-full text-xs border-collapse'>
            <thead>
              <tr className='text-gray-500 uppercase tracking-wider text-[10px] border-b border-gray-200'>
                <th className={cn(TH, 'w-14')}>Unit</th>
                <th className={TH}>Instrument</th>
                <th className={cn(TH, 'w-20')}>Load</th>
                <th className={TH}>Purpose</th>
                <th className={cn(TH, 'w-20')}>Colour</th>
                <th className={cn(TH, 'w-16')}>Chan</th>
                <th className={cn(TH, 'w-20')}>Address</th>
                <th className={cn(TH, 'w-28')}>Circuit</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r, i) => (
                <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className={cn(TD, 'font-mono font-bold text-gray-900')}>{dash(r.unit)}</td>
                  <td className={cn(TD, 'font-medium text-gray-800')}>{r.type}</td>
                  <td className={cn(TD, 'text-gray-600')}>{watts(r.watts)}</td>
                  <td className={cn(TD, 'text-gray-600')}>{dash(r.purpose)}</td>
                  <td className={cn(TD, 'text-gray-600')}>{dash(r.colour)}</td>
                  <td className={cn(TD, 'font-mono text-gray-700')}>{r.channel ? `(${r.channel})` : dash('')}</td>
                  <td className={cn(TD, 'font-mono text-gray-700')}>{r.patch}</td>
                  <td className={cn(TD, 'font-mono text-gray-500')}>{dash(r.circuit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
