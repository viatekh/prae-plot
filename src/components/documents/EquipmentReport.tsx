import { useProjectStore } from '../../store/projectStore'

interface Item { name: string; qty: number; weight: number; power: number; notes?: string }
interface Group { category: string; items: Item[] }

function CategorySection({ group }: { group: Group }) {
  const tw = group.items.reduce((s, i) => s + i.weight, 0)
  const tp = group.items.reduce((s, i) => s + i.power, 0)
  if (group.items.length === 0) return null
  return (
    <div className='mb-5'>
      <div className='bg-gray-800 text-white text-xs font-semibold px-3 py-1.5 rounded-t'>{group.category}</div>
      <table className='w-full text-xs border-collapse border border-gray-200 rounded-b overflow-hidden'>
        <thead>
          <tr className='bg-gray-100 text-gray-600'>
            <th className='px-3 py-1.5 text-left w-10'>#</th>
            <th className='px-3 py-1.5 text-left'>Name</th>
            <th className='px-3 py-1.5 text-right w-20'>Weight</th>
            <th className='px-3 py-1.5 text-right w-20'>Power</th>
          </tr>
        </thead>
        <tbody>
          {group.items.map((item, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className='px-3 py-1 text-gray-600'>{item.qty}</td>
              <td className='px-3 py-1 text-gray-800 font-medium'>
                {item.name}
                {item.notes && <span className='ml-1.5 text-gray-400 font-normal'>{item.notes}</span>}
              </td>
              <td className='px-3 py-1 text-right text-gray-600'>{item.weight > 0 ? `${item.weight.toFixed(1)} kg` : '—'}</td>
              <td className='px-3 py-1 text-right text-gray-600'>{item.power > 0 ? `${item.power.toFixed(0)} W` : '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className='bg-gray-100 font-semibold border-t border-gray-300'>
            <td colSpan={2} className='px-3 py-1.5 text-right text-gray-700 text-xs'>Subtotal</td>
            <td className='px-3 py-1.5 text-right text-gray-800'>{tw > 0 ? `${tw.toFixed(1)} kg` : '—'}</td>
            <td className='px-3 py-1.5 text-right text-gray-800'>{tp > 0 ? `${tp.toFixed(0)} W` : '—'}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export default function EquipmentReport() {
  const { project } = useProjectStore()
  if (!project) return null

  // Fixtures grouped by model
  const fixtureMap: Record<string, Item> = {}
  for (const f of project.fixtures) {
    const key = `${f.manufacturer} ${f.model}`
    if (!fixtureMap[key]) fixtureMap[key] = { name: key, qty: 0, weight: 0, power: 0 }
    fixtureMap[key].qty++
    fixtureMap[key].weight += f.weight
    fixtureMap[key].power += f.powerRating
  }

  // Distros
  const distroItems: Item[] = project.distros.map((d) => ({
    name: d.name,
    qty: 1,
    weight: 0,
    power: d.incomingRating * (d.phases === 3 ? 3 * 230 : 230),
    notes: `${d.incomingRating}A ${d.phases}Ø · ${d.circuits.length} circuits`,
  }))

  const groups: Group[] = [
    { category: 'Fixtures', items: Object.values(fixtureMap).sort((a, b) => b.qty - a.qty) },
    { category: 'Power Distribution', items: distroItems },
  ]

  const totalWeight = project.fixtures.reduce((s, f) => s + f.weight, 0)
  const totalPower  = project.fixtures.reduce((s, f) => s + f.powerRating, 0)

  return (
    <div>
      <div className='text-sm font-semibold text-gray-700 mb-4'>Equipment Report</div>

      {groups.every((g) => g.items.length === 0) && (
        <div className='text-center text-xs text-gray-400 py-8'>No equipment added yet.</div>
      )}

      {groups.map((g) => <CategorySection key={g.category} group={g} />)}

      {project.fixtures.length > 0 && (
        <div className='mt-2 border-t-2 border-gray-800 pt-2'>
          <table className='w-full text-xs'>
            <tbody>
              <tr className='font-bold text-gray-800'>
                <td className='px-3 py-1.5'>FIXTURE TOTAL</td>
                <td className='px-3 py-1.5 text-right'>{totalWeight.toFixed(1)} kg</td>
                <td className='px-3 py-1.5 text-right'>{totalPower.toFixed(0)} W</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
