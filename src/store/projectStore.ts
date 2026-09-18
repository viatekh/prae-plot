import { create } from 'zustand'
import { generateId, formatVersion, nextVersion, downloadJSON } from '../lib/utils'
import type {
  Project,
  ProjectInfo,
  AnyElement,
  PlacedFixture,
  Distro,
  Circuit,
  Layer,
  ToolType,
  CableType,
  GDTFFixtureType,
  CanvasViewState,
  BackgroundImage,
  Device,
  FixtureGroup,
} from '../types'
import { DEFAULT_LAYERS, DEFAULT_VIEW_OPTIONS, SCHEMA_VERSION, isPowerCable } from '../types'
import type { ViewOptions } from '../types'

const MAX_HISTORY = 50
const VIEW_OPTIONS_KEY = 'prae-plot:view-options'
const COALESCE_MS = 700

// Tracks the last coalesced edit so a burst of them shares one undo step.
let lastEditKey: string | null = null
let lastEditAt = 0

function loadViewOptions(): ViewOptions {
  try {
    const raw = localStorage.getItem(VIEW_OPTIONS_KEY)
    if (raw) return { ...DEFAULT_VIEW_OPTIONS, ...(JSON.parse(raw) as Partial<ViewOptions>) }
  } catch { /* storage unavailable */ }
  return { ...DEFAULT_VIEW_OPTIONS }
}

function saveViewOptions(options: ViewOptions) {
  try { localStorage.setItem(VIEW_OPTIONS_KEY, JSON.stringify(options)) } catch { /* quota */ }
}
const AUTOSAVE_KEY = 'prae-plot:autosave'
const AUTOSAVE_TIME_KEY = 'prae-plot:autosave-time'

interface HistoryEntry {
  elements: AnyElement[]
  fixtures: PlacedFixture[]
  distros: Distro[]
  layers: Layer[]
}

interface ProjectStore {
  // ── Project data ──────────────────────────────────────────
  project: Project | null
  isDirty: boolean

  // ── History ───────────────────────────────────────────────
  past: HistoryEntry[]
  future: HistoryEntry[]

  // ── Canvas UI state ───────────────────────────────────────
  view: CanvasViewState
  viewOptions: ViewOptions

  // ── Tool state ────────────────────────────────────────────
  activeTool: ToolType
  selectedIds: string[]
  activeLayerId: string
  activeCableType: CableType
  autoAddress: boolean

  // ── GDTF library ──────────────────────────────────────────
  gdtfLibrary: GDTFFixtureType[]
  selectedFixtureType: GDTFFixtureType | null

  // ── UI panels ─────────────────────────────────────────────
  activeLeftPanel: 'fixtures' | 'power' | 'layers' | 'view' | 'cable' | 'groups' | 'devices' | null
  activeRightPanel: 'properties' | 'circuits' | 'documents'
  projectInfoModalOpen: boolean

  // ── Clipboard ─────────────────────────────────────────────
  clipboard: { elements: AnyElement[]; fixtures: PlacedFixture[] } | null

  // ── Canvas options ────────────────────────────────────────
  lastAutosave: string | null

  /** Element whose label the properties panel should focus next. */
  labelDraftId: string | null

  // ── Actions: project lifecycle ────────────────────────────
  createProject: (info: ProjectInfo) => void
  loadProject: (project: Project) => void
  saveProject: () => void
  updateProjectInfo: (updates: Partial<ProjectInfo>) => void
  setBackgroundImage: (img: BackgroundImage | undefined) => void
  updateBackgroundImage: (updates: Partial<BackgroundImage>) => void
  mergeProject: (imported: Project) => void
  autosave: () => void

  // ── Actions: elements ─────────────────────────────────────
  addElement: (el: AnyElement) => void
  updateElement: (id: string, updates: Partial<AnyElement>) => void
  deleteSelected: () => void

  // ── Actions: fixtures ─────────────────────────────────────
  addFixture: (f: PlacedFixture) => void
  updateFixture: (id: string, updates: Partial<PlacedFixture>) => void
  deleteFixture: (id: string) => void
  autoRepatch: (fixtureIds: string[], startUniverse?: number, startAddress?: number) => void

  // ── Actions: layers ───────────────────────────────────────
  addLayer: (layer: Omit<Layer, 'id' | 'order'>) => void
  updateLayer: (id: string, updates: Partial<Layer>) => void
  deleteLayer: (id: string) => void
  reorderLayers: (layers: Layer[]) => void
  /** Moves a layer one step up or down the stack, renumbering `order`. */
  moveLayer: (id: string, direction: 'up' | 'down') => void

  // ── Actions: distros/circuits ─────────────────────────────
  addDistro: (d: Omit<Distro, 'id'> & { circuits?: Distro['circuits'] }) => void
  updateDistro: (id: string, updates: Partial<Omit<Distro, 'circuits'>>) => void
  deleteDistro: (id: string) => void
  addCircuit: (distroId: string, c: Omit<Circuit, 'id'>) => void
  updateCircuit: (distroId: string, circuitId: string, updates: Partial<Circuit>) => void
  deleteCircuit: (distroId: string, circuitId: string) => void

  // ── Actions: undo/redo ────────────────────────────────────
  undo: () => void
  redo: () => void
  pushHistory: () => void
  pushHistoryCoalesced: (key: string) => void

  // ── Actions: clipboard ───────────────────────────────────
  copySelected: () => void
  pasteClipboard: () => void

  // ── Actions: UI state ─────────────────────────────────────
  setActiveTool: (tool: ToolType) => void
  setSelectedIds: (ids: string[]) => void
  setView: (view: Partial<CanvasViewState>) => void
  setViewOption: <K extends keyof ViewOptions>(key: K, value: ViewOptions[K]) => void
  setLabelDraftId: (id: string | null) => void
  setActiveLayerId: (id: string) => void
  setActiveCableType: (t: CableType) => void
  setAutoAddress: (v: boolean) => void
  setActiveLeftPanel: (p: 'fixtures' | 'power' | 'layers' | 'view' | 'cable' | 'groups' | 'devices' | null) => void
  setActiveRightPanel: (p: 'properties' | 'circuits' | 'documents') => void
  setProjectInfoModalOpen: (open: boolean) => void

  // ── Actions: devices ──────────────────────────────────────
  addDevice: (d: Omit<Device, 'id'>) => void
  updateDevice: (id: string, updates: Partial<Device>) => void
  deleteDevice: (id: string) => void

  // ── Actions: groups ───────────────────────────────────────
  addGroup: (g: Omit<FixtureGroup, 'id'>) => void
  updateGroup: (id: string, updates: Partial<FixtureGroup>) => void
  deleteGroup: (id: string) => void

  // ── Actions: GDTF library ─────────────────────────────────
  addToGDTFLibrary: (ft: GDTFFixtureType) => void
  updateGDTFFixtureType: (id: string, updates: Partial<GDTFFixtureType>) => void
  removeFromGDTFLibrary: (id: string) => void
  setSelectedFixtureType: (ft: GDTFFixtureType | null) => void
}

function newProject(info: ProjectInfo): Project {
  return {
    id: generateId(),
    info,
    version: 10,
    schemaVersion: SCHEMA_VERSION,
    layers: DEFAULT_LAYERS.map((l) => ({ ...l })),
    elements: [],
    fixtures: [],
    distros: [],
    devices: [],
    groups: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function snapshot(project: Project): HistoryEntry {
  return {
    elements: JSON.parse(JSON.stringify(project.elements)),
    fixtures: JSON.parse(JSON.stringify(project.fixtures)),
    distros: JSON.parse(JSON.stringify(project.distros)),
    layers: JSON.parse(JSON.stringify(project.layers)),
  }
}

// Ensure loaded projects have layers and bg image fields (backward compat)
function normaliseProject(p: Project): Project {
  const bg = p.backgroundImage
    ? { ...p.backgroundImage, visible: p.backgroundImage.visible ?? true, locked: p.backgroundImage.locked ?? false }
    : undefined
  // Text used to be sized in screen pixels; it is now centimetres of real
  // space so annotation scales with the drawing.
  const textNeedsRescale = (p.schemaVersion ?? 1) < 2
  const elements = p.elements.map((el) => {
    if (el.type === 'cable' && !(el as { waypoints?: unknown }).waypoints) {
      return { ...el, waypoints: [] }
    }
    if (el.type === 'text' && textNeedsRescale) {
      const te = el as import('../types').TextElement
      return { ...te, fontSize: Math.round((te.fontSize || 14) * 2.5) }
    }
    return el
  }) as AnyElement[]
  const fixtures = p.fixtures.map((f: PlacedFixture & { unitNumber?: number }) => ({
    ...f,
    channel: f.channel ?? f.unitNumber ?? 0,
    availableModes: f.availableModes ?? [],
  }))
  // Ensure all default layers exist (migrate old projects)
  let layers: Layer[] = p.layers?.length ? p.layers : DEFAULT_LAYERS.map((l) => ({ ...l }))
  for (const dl of DEFAULT_LAYERS) {
    if (!layers.some((l) => l.id === dl.id)) {
      layers = [...layers, { ...dl, order: layers.length }]
    }
  }
  return {
    ...p,
    schemaVersion: SCHEMA_VERSION,
    layers,
    backgroundImage: bg,
    elements,
    fixtures,
    devices: p.devices ?? [],
    groups: p.groups ?? [],
  }
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: null,
  isDirty: false,
  past: [],
  future: [],
  view: { scale: 1, x: 80, y: 80 },
  viewOptions: loadViewOptions(),
  activeTool: 'select',
  selectedIds: [],
  activeLayerId: 'lighting',
  activeCableType: 'dmx-5pin',
  autoAddress: true,
  gdtfLibrary: [],
  selectedFixtureType: null,
  activeLeftPanel: 'fixtures',
  activeRightPanel: 'properties',
  projectInfoModalOpen: false,
  clipboard: null,
  lastAutosave: null,
  labelDraftId: null,

  createProject: (info) => {
    set({ project: newProject(info), isDirty: false, past: [], future: [], selectedIds: [], activeLayerId: 'lighting' })
  },

  loadProject: (project) => {
    const normalised = normaliseProject(project)
    set({ project: normalised, isDirty: false, past: [], future: [], selectedIds: [], activeLayerId: normalised.layers[0]?.id ?? 'lighting' })
  },

  saveProject: () => {
    const { project } = get()
    if (!project) return
    const updated: Project = {
      ...project,
      version: nextVersion(project.version),
      updatedAt: new Date().toISOString(),
    }
    set({ project: updated, isDirty: false })
    downloadJSON(updated, `${updated.info.name.replace(/\s+/g, '_')}_${formatVersion(updated.version)}.json`)
  },

  updateProjectInfo: (updates) => {
    const { project } = get()
    if (!project) return
    set({ project: { ...project, info: { ...project.info, ...updates } }, isDirty: true })
  },

  setBackgroundImage: (img) => {
    const { project } = get()
    if (!project) return
    set({ project: { ...project, backgroundImage: img }, isDirty: true })
  },

  updateBackgroundImage: (updates) => {
    const { project } = get()
    if (!project || !project.backgroundImage) return
    set({ project: { ...project, backgroundImage: { ...project.backgroundImage, ...updates } }, isDirty: true })
  },

  mergeProject: (imported) => {
    const { project } = get()
    if (!project) return
    const maxCh = Math.max(0, ...project.fixtures.map((f) => f.channel))
    const newFixtures = imported.fixtures.map((f, i) => ({ ...f, id: generateId(), channel: maxCh + i + 1 }))
    const newElements = imported.elements.map((e) => ({ ...e, id: generateId() }))
    set({
      project: {
        ...project,
        fixtures: [...project.fixtures, ...newFixtures],
        elements: [...project.elements, ...newElements],
      },
      isDirty: true,
    })
  },

  autosave: () => {
    const { project } = get()
    if (!project) return
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project))
      const ts = new Date().toISOString()
      localStorage.setItem(AUTOSAVE_TIME_KEY, ts)
      set({ lastAutosave: ts })
    } catch { /* quota exceeded — the manual save still works */ }
  },

  pushHistory: () => {
    const { project, past } = get()
    if (!project) return
    lastEditKey = null
    const newPast = [...past, snapshot(project)].slice(-MAX_HISTORY)
    set({ past: newPast, future: [] })
  },

  /**
   * History for a stream of small edits to the same thing (dragging a slider,
   * typing in a field): the first one takes a snapshot, the rest ride along.
   */
  pushHistoryCoalesced: (key) => {
    const now = Date.now()
    if (lastEditKey === key && now - lastEditAt < COALESCE_MS) {
      lastEditAt = now
      return
    }
    const { project, past } = get()
    if (!project) return
    lastEditKey = key
    lastEditAt = now
    set({ past: [...past, snapshot(project)].slice(-MAX_HISTORY), future: [] })
  },

  addElement: (el) => {
    get().pushHistory()
    const { project } = get()
    if (!project) return

    // When a power cable connects fixture → distro, auto-assign the fixture to the
    // first free circuit on that distro (matching the cable type to power circuits)
    let fixtures = project.fixtures
    if (el.type === 'cable') {
      const ce = el as { startConnectedTo?: string; endConnectedTo?: string; cableType: string }
      if (isPowerCable(ce.cableType)) {
        // Find which end is fixture and which is distro
        const fixtureId = fixtures.find((f) => f.id === ce.startConnectedTo)?.id
          ?? fixtures.find((f) => f.id === ce.endConnectedTo)?.id
        const distroId = ce.startConnectedTo === fixtureId ? ce.endConnectedTo : ce.startConnectedTo
        const distro = project.distros.find((d) => d.id === distroId)
        const fixture = fixtures.find((f) => f.id === fixtureId)
        if (fixture && distro && !fixture.circuitId) {
          // Find first circuit with headroom
          const freeCircuit = distro.circuits.find((c) => {
            const load = fixtures.filter((f) => f.circuitId === c.id).reduce((s, f) => s + f.powerRating, 0)
            return load + fixture.powerRating <= c.rating * c.voltage
          }) ?? distro.circuits[0]
          if (freeCircuit) {
            fixtures = fixtures.map((f) => f.id === fixtureId ? { ...f, circuitId: freeCircuit.id } : f)
          }
        }
      }
    }

    // Auto-label cables: assign "C1", "C2", etc. if no label set
    let finalEl = el
    if (el.type === 'cable' && !(el as import('../types').CableElement).autoLabel) {
      const existingLabels = project.elements
        .filter((e) => e.type === 'cable')
        .map((e) => (e as import('../types').CableElement).autoLabel)
        .filter(Boolean)
      let n = 1
      while (existingLabels.includes(`C${n}`)) n++
      finalEl = { ...el, autoLabel: `C${n}` } as AnyElement
    }

    set({ project: { ...project, elements: [...project.elements, finalEl], fixtures }, isDirty: true })
  },

  updateElement: (id, updates) => {
    const { project } = get()
    if (!project) return
    get().pushHistoryCoalesced(`element:${id}:${Object.keys(updates).join(',')}`)
    set({
      project: {
        ...project,
        elements: project.elements.map((e) => (e.id === id ? ({ ...e, ...updates } as AnyElement) : e)),
      },
      isDirty: true,
    })
  },

  deleteSelected: () => {
    const { project, selectedIds } = get()
    if (!project || selectedIds.length === 0) return
    get().pushHistory()
    set({
      project: {
        ...project,
        elements: project.elements.filter((e) => !selectedIds.includes(e.id)),
        fixtures: project.fixtures.filter((f) => !selectedIds.includes(f.id)),
      },
      selectedIds: [],
      isDirty: true,
    })
  },

  addFixture: (f) => {
    get().pushHistory()
    const { project } = get()
    if (!project) return
    set({ project: { ...project, fixtures: [...project.fixtures, f] }, isDirty: true })
  },

  updateFixture: (id, updates) => {
    const { project } = get()
    if (!project) return
    get().pushHistoryCoalesced(`fixture:${id}:${Object.keys(updates).join(',')}`)
    set({
      project: {
        ...project,
        fixtures: project.fixtures.map((f) => (f.id === id ? { ...f, ...updates } : f)),
      },
      isDirty: true,
    })
  },

  deleteFixture: (id) => {
    get().pushHistory()
    const { project } = get()
    if (!project) return
    set({ project: { ...project, fixtures: project.fixtures.filter((f) => f.id !== id) }, isDirty: true })
  },

  addLayer: (layer) => {
    const { project } = get()
    if (!project) return
    const order = project.layers.length
    const newLayer: Layer = { ...layer, id: generateId(), order }
    set({ project: { ...project, layers: [...project.layers, newLayer] }, isDirty: true })
  },

  updateLayer: (id, updates) => {
    const { project } = get()
    if (!project) return
    set({
      project: { ...project, layers: project.layers.map((l) => (l.id === id ? { ...l, ...updates } : l)) },
      isDirty: true,
    })
  },

  deleteLayer: (id) => {
    const { project } = get()
    if (!project) return
    // Items keep existing; they just lose the layer that no longer exists.
    const clear = <T extends { layerId?: string }>(item: T): T =>
      item.layerId === id ? { ...item, layerId: undefined } : item
    set({
      project: {
        ...project,
        layers: project.layers.filter((l) => l.id !== id).map((l, i) => ({ ...l, order: i })),
        elements: project.elements.map(clear),
        fixtures: project.fixtures.map(clear),
        distros: project.distros.map(clear),
        devices: project.devices.map(clear),
      },
      activeLayerId: get().activeLayerId === id ? (project.layers.find((l) => l.id !== id)?.id ?? '') : get().activeLayerId,
      isDirty: true,
    })
  },

  moveLayer: (id, direction) => {
    const { project } = get()
    if (!project) return
    const sorted = [...project.layers].sort((a, b) => a.order - b.order)
    const idx = sorted.findIndex((l) => l.id === id)
    const target = idx + (direction === 'up' ? -1 : 1)
    if (idx === -1 || target < 0 || target >= sorted.length) return
    const [moved] = sorted.splice(idx, 1)
    sorted.splice(target, 0, moved)
    set({
      project: { ...project, layers: sorted.map((l, i) => ({ ...l, order: i })) },
      isDirty: true,
    })
  },

  reorderLayers: (layers) => {
    const { project } = get()
    if (!project) return
    set({ project: { ...project, layers }, isDirty: true })
  },

  addDistro: (d) => {
    const { project } = get()
    if (!project) return
    // Auto-assign next available letter ref (A, B, C … Z, AA, AB …)
    const usedRefs = new Set(project.distros.map((x) => x.ref).filter(Boolean))
    let nextRef = ''
    for (let i = 0; i < 702; i++) {
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      const candidate = i < 26
        ? letters[i]
        : letters[Math.floor(i / 26) - 1] + letters[i % 26]
      if (!usedRefs.has(candidate)) { nextRef = candidate; break }
    }
    const distro: Distro = {
      ...d,
      id: generateId(),
      ref: d.ref ?? nextRef,
      circuits: (d.circuits ?? []).map((c) => ({ ...c, id: generateId() })),
    }
    set({ project: { ...project, distros: [...project.distros, distro] }, isDirty: true })
  },

  updateDistro: (id, updates) => {
    const { project } = get()
    if (!project) return
    set({
      project: { ...project, distros: project.distros.map((d) => (d.id === id ? { ...d, ...updates } : d)) },
      isDirty: true,
    })
  },

  deleteDistro: (id) => {
    const { project } = get()
    if (!project) return
    set({ project: { ...project, distros: project.distros.filter((d) => d.id !== id) }, isDirty: true })
  },

  addCircuit: (distroId, c) => {
    const { project } = get()
    if (!project) return
    const circuit: Circuit = { ...c, id: generateId() }
    set({
      project: {
        ...project,
        distros: project.distros.map((d) =>
          d.id === distroId ? { ...d, circuits: [...d.circuits, circuit] } : d,
        ),
      },
      isDirty: true,
    })
  },

  updateCircuit: (distroId, circuitId, updates) => {
    const { project } = get()
    if (!project) return
    set({
      project: {
        ...project,
        distros: project.distros.map((d) =>
          d.id === distroId
            ? { ...d, circuits: d.circuits.map((c) => (c.id === circuitId ? { ...c, ...updates } : c)) }
            : d,
        ),
      },
      isDirty: true,
    })
  },

  deleteCircuit: (distroId, circuitId) => {
    const { project } = get()
    if (!project) return
    set({
      project: {
        ...project,
        distros: project.distros.map((d) =>
          d.id === distroId ? { ...d, circuits: d.circuits.filter((c) => c.id !== circuitId) } : d,
        ),
      },
      isDirty: true,
    })
  },

  // ── Devices ──────────────────────────────────────────────────
  addDevice: (d) => {
    const { project } = get()
    if (!project) return
    const device: Device = { ...d, id: generateId() }
    set({ project: { ...project, devices: [...project.devices, device] }, isDirty: true })
  },
  updateDevice: (id, updates) => {
    const { project } = get()
    if (!project) return
    set({ project: { ...project, devices: project.devices.map((d) => d.id === id ? { ...d, ...updates } : d) }, isDirty: true })
  },
  deleteDevice: (id) => {
    const { project } = get()
    if (!project) return
    set({ project: { ...project, devices: project.devices.filter((d) => d.id !== id) }, isDirty: true })
  },

  // ── Groups ────────────────────────────────────────────────────
  addGroup: (g) => {
    const { project } = get()
    if (!project) return
    const group: FixtureGroup = { ...g, id: generateId() }
    set({ project: { ...project, groups: [...project.groups, group] }, isDirty: true })
  },
  updateGroup: (id, updates) => {
    const { project } = get()
    if (!project) return
    set({ project: { ...project, groups: project.groups.map((g) => g.id === id ? { ...g, ...updates } : g) }, isDirty: true })
  },
  deleteGroup: (id) => {
    const { project } = get()
    if (!project) return
    set({ project: { ...project, groups: project.groups.filter((g) => g.id !== id) }, isDirty: true })
  },

  undo: () => {
    const { project, past, future } = get()
    if (!project || past.length === 0) return
    lastEditKey = null
    const prev = past[past.length - 1]
    const current = snapshot(project)
    set({
      past: past.slice(0, -1),
      future: [current, ...future].slice(0, MAX_HISTORY),
      project: { ...project, ...prev },
      isDirty: true,
    })
  },

  redo: () => {
    const { project, past, future } = get()
    if (!project || future.length === 0) return
    lastEditKey = null
    const next = future[0]
    const current = snapshot(project)
    set({
      future: future.slice(1),
      past: [...past, current].slice(-MAX_HISTORY),
      project: { ...project, ...next },
      isDirty: true,
    })
  },

  copySelected: () => {
    const { project, selectedIds } = get()
    if (!project || selectedIds.length === 0) return
    set({
      clipboard: {
        elements: project.elements.filter((e) => selectedIds.includes(e.id)),
        fixtures: project.fixtures.filter((f) => selectedIds.includes(f.id)),
      },
    })
  },

  pasteClipboard: () => {
    const { clipboard, project } = get()
    if (!clipboard || !project) return
    const newIds: string[] = []
    const newElements = clipboard.elements.map((el) => {
      const newId = generateId()
      newIds.push(newId)
      return { ...el, id: newId, x: el.x + 1, y: el.y + 1 }
    })
    const maxCh = Math.max(0, ...project.fixtures.map((f) => f.channel))
    let chOffset = 0
    const newFixtures = clipboard.fixtures.map((f) => {
      const newId = generateId()
      newIds.push(newId)
      return { ...f, id: newId, x: f.x + 1, y: f.y + 1, channel: maxCh + 1 + chOffset++ }
    })
    set({
      project: {
        ...project,
        elements: [...project.elements, ...newElements],
        fixtures: [...project.fixtures, ...newFixtures],
      },
      selectedIds: newIds,
      isDirty: true,
    })
  },

  autoRepatch: (fixtureIds, startUniverse?: number, startAddress?: number) => {
    const { project } = get()
    if (!project) return
    get().pushHistory()

    const selected = project.fixtures
      .filter((f) => fixtureIds.includes(f.id))
      .sort((a, b) => a.channel - b.channel)
    if (selected.length === 0) return

    const others = project.fixtures.filter((f) => !fixtureIds.includes(f.id))
    const patchMap = new Map<string, { universe: number; address: number }>()

    /** Ranges already taken in a universe, including what we assign as we go. */
    const taken = new Map<number, [number, number][]>()
    for (const f of others) {
      const width = Math.max(1, f.channelCount || 1)
      const list = taken.get(f.universe) ?? []
      list.push([f.address, f.address + width - 1])
      taken.set(f.universe, list)
    }
    const claim = (universe: number, start: number, width: number) => {
      const list = taken.get(universe) ?? []
      list.push([start, start + width - 1])
      taken.set(universe, list)
    }
    /** Lowest free address in `universe` that fits `width`, or null. */
    const firstFit = (universe: number, width: number, from = 1): number | null => {
      const ranges = [...(taken.get(universe) ?? [])].sort((a, b) => a[0] - b[0])
      let addr = from
      for (const [start, end] of ranges) {
        if (end < addr) continue
        if (addr + width - 1 < start) return addr
        addr = Math.max(addr, end + 1)
      }
      return addr + width - 1 <= 512 ? addr : null
    }

    if (startUniverse !== undefined && startAddress !== undefined) {
      // Explicit start: pack forward from there, rolling into the next universe.
      let universe = startUniverse
      let address = startAddress
      for (const f of selected) {
        const width = Math.max(1, f.channelCount || 1)
        if (address + width - 1 > 512) { universe++; address = 1 }
        patchMap.set(f.id, { universe, address })
        address += width
      }
    } else {
      // Default: repack each fixture inside the universe it is already on, so
      // re-addressing never moves a rig onto a different universe behind your
      // back. Only a universe with no room left spills into the next one.
      const byUniverse = new Map<number, typeof selected>()
      for (const f of selected) {
        const list = byUniverse.get(f.universe) ?? []
        list.push(f)
        byUniverse.set(f.universe, list)
      }
      for (const [universe, list] of [...byUniverse.entries()].sort((a, b) => a[0] - b[0])) {
        let cursor = 1
        for (const f of list) {
          const width = Math.max(1, f.channelCount || 1)
          let target = universe
          let address = firstFit(universe, width, cursor)
          while (address === null) {
            target += 1
            address = firstFit(target, width)
            if (target > 64) { address = 1; break }
          }
          patchMap.set(f.id, { universe: target, address: address ?? 1 })
          claim(target, address ?? 1, width)
          if (target === universe) cursor = (address ?? 1) + width
        }
      }
    }

    set({
      project: {
        ...project,
        fixtures: project.fixtures.map((f) => {
          const patch = patchMap.get(f.id)
          return patch ? { ...f, ...patch } : f
        }),
      },
      isDirty: true,
    })
  },

  setActiveTool: (tool) => {
    const extra: { activeLayerId?: string; activeLeftPanel?: 'fixtures' | 'power' | 'layers' | 'view' | 'cable' | 'groups' | 'devices' | null } = {}
    if (tool === 'cable') { extra.activeLayerId = 'cables'; extra.activeLeftPanel = 'cable' }
    // Auto-open fixture library when fixture tool activated
    if (tool === 'fixture' && get().activeLeftPanel !== 'fixtures') extra.activeLeftPanel = 'fixtures'
    set({ activeTool: tool, ...extra })
  },
  setSelectedIds: (ids) => set({ selectedIds: ids }),
  setView: (view) => set((s) => ({ view: { ...s.view, ...view } })),
  setViewOption: (key, value) =>
    set((s) => {
      const viewOptions = { ...s.viewOptions, [key]: value }
      saveViewOptions(viewOptions)
      return { viewOptions }
    }),
  setLabelDraftId: (id) => set({ labelDraftId: id }),
  setActiveLayerId: (id) => set({ activeLayerId: id }),
  setActiveCableType: (t) => set({ activeCableType: t }),
  setAutoAddress: (v) => set({ autoAddress: v }),
  setActiveLeftPanel: (p) => set({ activeLeftPanel: p }),
  setActiveRightPanel: (p) => set({ activeRightPanel: p }),
  setProjectInfoModalOpen: (open) => set({ projectInfoModalOpen: open }),

  updateGDTFFixtureType: (id, updates) =>
    useProjectStore.setState((s) => {
      const next = s.gdtfLibrary.map((f) => f.id === id ? { ...f, ...updates } : f)
      localStorage.setItem('praePlot_gdtfLibrary', JSON.stringify(next))
      return { gdtfLibrary: next }
    }),
  addToGDTFLibrary: (ft) =>
    set((s) => {
      const next = [...s.gdtfLibrary.filter((f) => f.id !== ft.id), ft]
      try { localStorage.setItem('prae-plot:gdtf-library', JSON.stringify(next)) } catch { /* quota */ }
      return { gdtfLibrary: next }
    }),
  removeFromGDTFLibrary: (id) =>
    set((s) => {
      const next = s.gdtfLibrary.filter((f) => f.id !== id)
      try { localStorage.setItem('prae-plot:gdtf-library', JSON.stringify(next)) } catch { /* quota */ }
      return { gdtfLibrary: next }
    }),
  setSelectedFixtureType: (ft) => set({ selectedFixtureType: ft }),
}))

// Dev-only handle so the app can be driven from the console or a browser test.
if (import.meta.env.DEV) {
  ;(window as unknown as { praePlotStore?: typeof useProjectStore }).praePlotStore = useProjectStore
}

// Hydrate GDTF library from localStorage on first load
try {
  const saved = localStorage.getItem('prae-plot:gdtf-library')
  if (saved) {
    const parsed = JSON.parse(saved)
    if (Array.isArray(parsed)) useProjectStore.setState({ gdtfLibrary: parsed })
  }
} catch { /* ignore */ }

// ── Autosave recovery ─────────────────────────────────────────
// The editor autosaves to localStorage; without this the snapshot was written
// but could never be read back.

export interface AutosaveSnapshot {
  project: Project
  savedAt: string | null
}

export function readAutosave(): AutosaveSnapshot | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    if (!raw) return null
    const project = JSON.parse(raw) as Project
    if (!project?.info || !Array.isArray(project.fixtures)) return null
    return { project, savedAt: localStorage.getItem(AUTOSAVE_TIME_KEY) }
  } catch {
    return null
  }
}

export function clearAutosave() {
  try {
    localStorage.removeItem(AUTOSAVE_KEY)
    localStorage.removeItem(AUTOSAVE_TIME_KEY)
  } catch { /* storage unavailable */ }
}

// ── Derived helpers ───────────────────────────────────────────

export function computeCircuitLoad(fixtures: PlacedFixture[], circuitId: string): number {
  return fixtures.filter((f) => f.circuitId === circuitId).reduce((sum, f) => sum + f.powerRating, 0)
}

export function circuitCapacityW(circuit: Circuit): number {
  return circuit.rating * circuit.voltage
}

/**
 * Returns total wattage drawn from a distro including all fixtures assigned to
 * its circuits PLUS the total draw of any downstream distros connected to it
 * via power cables (prevents double-counting: upstream sees downstream total).
 */
export function computeDistroLoad(
  distro: Distro,
  allDistros: Distro[],
  fixtures: PlacedFixture[],
  elements: { type: string; cableType?: string; startConnectedTo?: string; endConnectedTo?: string }[],
  visited = new Set<string>(),
): number {
  if (visited.has(distro.id)) return 0
  visited.add(distro.id)
  // Direct fixture load
  const directLoad = distro.circuits.reduce((sum, c) => sum + computeCircuitLoad(fixtures, c.id), 0)
  // Find downstream distros connected via power cables
  const downstreamIds = elements
    .filter((e) => e.type === 'cable' && isPowerCable(e.cableType ?? ''))
    .filter((e) => e.startConnectedTo === distro.id || e.endConnectedTo === distro.id)
    .map((e) => e.startConnectedTo === distro.id ? e.endConnectedTo : e.startConnectedTo)
    .filter((id): id is string => !!id && id !== distro.id)
  const downstreamLoad = downstreamIds.reduce((sum, id) => {
    const d = allDistros.find((x) => x.id === id)
    if (!d) return sum
    return sum + computeDistroLoad(d, allDistros, fixtures, elements, visited)
  }, 0)
  return directLoad + downstreamLoad
}

export function loadStatus(loadW: number, capacityW: number): 'ok' | 'warning' | 'overload' {
  const pct = (loadW / capacityW) * 100
  if (pct >= 100) return 'overload'
  if (pct >= 80) return 'warning'
  return 'ok'
}

// Format: "32/1 · A · 4"  (amperage/phases · distroRef · circuitIndex)
export function formatCircuitRef(distros: Distro[], circuitId?: string): string {
  if (!circuitId) return '—'
  for (const d of distros) {
    const idx = d.circuits.findIndex((c) => c.id === circuitId)
    if (idx === -1) continue
    const c = d.circuits[idx]
    const ref = d.ref || d.name.slice(0, 1).toUpperCase()
    return `${c.rating}/${d.phases} · ${ref} · ${idx + 1}`
  }
  return '—'
}

export function findAddressConflicts(fixtures: PlacedFixture[]): string[] {
  const conflicts: string[] = []
  for (let i = 0; i < fixtures.length; i++) {
    for (let j = i + 1; j < fixtures.length; j++) {
      const a = fixtures[i], b = fixtures[j]
      if (a.universe !== b.universe || a.channelCount === 0 || b.channelCount === 0) continue
      const aEnd = a.address + a.channelCount - 1
      const bEnd = b.address + b.channelCount - 1
      if (a.address <= bEnd && b.address <= aEnd) {
        conflicts.push(`CH${a.channel} and CH${b.channel} overlap on U${a.universe} (addr ${a.address}–${aEnd} / ${b.address}–${bEnd})`)
      }
    }
  }
  return conflicts
}
