import { useState } from 'react'
import { Plus, Trash2, Users } from 'lucide-react'
import { useProjectStore } from '../../store/projectStore'

const GROUP_COLORS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#a855f7','#06b6d4','#f97316','#84cc16']

export default function GroupsPanel() {
  const { project, addGroup, updateGroup, deleteGroup, selectedIds, setSelectedIds } = useProjectStore()
  const [newName, setNewName] = useState('')

  if (!project) return null
  const { groups, fixtures } = project

  const handleCreate = () => {
    const name = newName.trim() || `Group ${groups.length + 1}`
    const fixtureIds = selectedIds.filter((id) => fixtures.some((f) => f.id === id))
    const color = GROUP_COLORS[groups.length % GROUP_COLORS.length]
    addGroup({ name, color, fixtureIds })
    setNewName('')
  }

  const handleAddSelected = (groupId: string) => {
    const g = groups.find((g) => g.id === groupId)
    if (!g) return
    const newIds = selectedIds.filter((id) => fixtures.some((f) => f.id === id) && !g.fixtureIds.includes(id))
    updateGroup(groupId, { fixtureIds: [...g.fixtureIds, ...newIds] })
  }

  const handleSelect = (groupId: string) => {
    const g = groups.find((g) => g.id === groupId)
    if (g) setSelectedIds(g.fixtureIds)
  }

  return (
    <div className='flex flex-col h-full overflow-hidden'>
      <div className='px-3 py-2.5 border-b border-gray-200 shrink-0'>
        <span className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>Groups</span>
      </div>

      {/* Create group */}
      <div className='p-2 border-b border-gray-100 flex gap-1.5'>
        <input
          type='text'
          placeholder='Group name…'
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          className='flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500'
        />
        <button
          onClick={handleCreate}
          className='flex items-center gap-1 text-xs bg-blue-600 text-white px-2 py-1.5 rounded hover:bg-blue-700 transition-colors'
          title='Create group (includes selected fixtures)'
        >
          <Plus size={12} />
        </button>
      </div>

      <div className='flex-1 overflow-y-auto p-2 flex flex-col gap-1.5'>
        {groups.length === 0 && (
          <div className='text-xs text-gray-400 text-center py-8'>
            No groups yet.<br />Select fixtures and press + to create one.
          </div>
        )}
        {groups.map((g) => {
          const members = fixtures.filter((f) => g.fixtureIds.includes(f.id))
          const totalW = members.reduce((s, f) => s + f.powerRating, 0)
          return (
            <div key={g.id} className='bg-white border border-gray-200 rounded-lg overflow-hidden'>
              <div className='flex items-center gap-2 px-2.5 py-2'>
                <span className='w-3 h-3 rounded-full shrink-0' style={{ background: g.color }} />
                <input
                  type='text'
                  value={g.name}
                  onChange={(e) => updateGroup(g.id, { name: e.target.value })}
                  className='flex-1 text-xs font-semibold text-gray-800 bg-transparent border-none outline-none'
                />
                <input
                  type='color'
                  value={g.color}
                  onChange={(e) => updateGroup(g.id, { color: e.target.value })}
                  className='w-5 h-5 rounded cursor-pointer border-0 p-0'
                />
              </div>
              <div className='px-2.5 pb-1 text-xs text-gray-500'>
                {members.length} fixture{members.length !== 1 ? 's' : ''}
                {totalW > 0 && ` · ${(totalW/1000).toFixed(2)} kW`}
              </div>
              {members.length > 0 && (
                <div className='px-2.5 pb-2 flex flex-wrap gap-1'>
                  {members.map((f) => (
                    <span key={f.id} className='text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono'>CH{f.channel}</span>
                  ))}
                </div>
              )}
              <div className='flex border-t border-gray-100'>
                <button
                  onClick={() => handleSelect(g.id)}
                  className='flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-blue-600 hover:bg-blue-50 transition-colors'
                  title='Select all fixtures in group'
                >
                  <Users size={11} /> Select
                </button>
                <button
                  onClick={() => handleAddSelected(g.id)}
                  className='flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors'
                  title='Add currently selected fixtures to this group'
                >
                  <Plus size={11} /> Add selected
                </button>
                <button
                  onClick={() => deleteGroup(g.id)}
                  className='px-2 flex items-center justify-center text-red-400 hover:bg-red-50 transition-colors'
                  title='Delete group'
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
