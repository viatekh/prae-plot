import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import type { GDTFFixtureType, GDTFMode, FixtureSymbolType } from '../types'
import { generateId } from './utils'

function inferSymbol(name: string, shortName: string): FixtureSymbolType {
  const s = `${name} ${shortName}`.toLowerCase()
  if (s.includes('wash') || s.includes('ledwash')) return 'wash'
  if (s.includes('spot') || s.includes('profile') || s.includes('ellipsoidal')) return 'spot'
  if (s.includes('beam')) return 'beam'
  if (s.includes('par')) return 'par'
  if (s.includes('strobe') || s.includes('atomic') || s.includes('flash')) return 'strobe'
  if (s.includes('flood') || s.includes('floodlight') || s.includes('cyc')) return 'flood'
  if (s.includes('pixel') || s.includes('tube') || s.includes('batten') || s.includes('strip') || s.includes('bar')) return 'pixel'
  return 'other'
}

export async function parseGDTFFile(file: File | ArrayBuffer): Promise<GDTFFixtureType> {
  const buffer = file instanceof File ? await file.arrayBuffer() : file
  const zip = await JSZip.loadAsync(buffer)

  const descEntry = zip.file('description.xml')
  if (!descEntry) throw new Error('Invalid GDTF: missing description.xml')

  const xml = await descEntry.async('string')
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
  const doc = parser.parse(xml)

  const ft = doc?.GDTF?.FixtureType
  if (!ft) throw new Error('Invalid GDTF: no FixtureType element')

  const name: string = ft['@_Name'] ?? ft['@_LongName'] ?? ''
  const shortName: string = ft['@_ShortName'] ?? name
  const manufacturer: string = ft['@_Manufacturer'] ?? ''
  const id: string = ft['@_FixtureTypeID'] ?? generateId()

  // DMX Modes
  const rawModes = ft?.DMXModes?.DMXMode ?? []
  const modesArr = Array.isArray(rawModes) ? rawModes : [rawModes]
  const modes: GDTFMode[] = modesArr.map((m: Record<string, unknown>) => {
    const modeName = (m['@_Name'] as string) ?? 'Default'
    // Count channels from DMXChannels
    const dmxModeRec = m as Record<string, Record<string, unknown>>
    const channels = (dmxModeRec?.DMXChannels?.DMXChannel as unknown[]) ?? []
    const channelsArr = Array.isArray(channels) ? channels : [channels]
    // Each DMXChannel may span multiple offsets
    let count = 0
    for (const ch of channelsArr) {
      const offset = (ch as Record<string, unknown>)['@_Offset'] as string | undefined
      if (offset) {
        const parts = offset.split(',')
        count += parts.length
      } else {
        count += 1
      }
    }
    return { name: modeName, channelCount: count || channelsArr.length }
  })

  // Physical properties — check multiple locations in spec variants
  let weight: number | undefined
  let powerConsumption: number | undefined

  function tryParse(v: unknown): number | undefined {
    if (v === undefined || v === null) return undefined
    const n = parseFloat(String(v))
    return isNaN(n) || n <= 0 ? undefined : n
  }

  // GDTF ≥1.1: PhysicalDescriptions/Properties[@Weight, @PowerConsumption]
  const physDesc = ft?.PhysicalDescriptions
  if (physDesc) {
    const props = physDesc?.Properties
    if (props && typeof props === 'object') {
      const p = props as Record<string, unknown>
      weight = tryParse(p['@_Weight']) ?? tryParse(p['Weight'])
      powerConsumption = tryParse(p['@_PowerConsumption']) ?? tryParse(p['PowerConsumption'])
    }
    // Also try directly on PhysicalDescriptions
    const pd = physDesc as Record<string, unknown>
    if (weight === undefined) weight = tryParse(pd['@_Weight']) ?? tryParse(pd['Weight'])
    if (powerConsumption === undefined) powerConsumption = tryParse(pd['@_PowerConsumption']) ?? tryParse(pd['PowerConsumption'])
  }
  // Fallback: directly on FixtureType element
  if (weight === undefined) weight = tryParse((ft as Record<string, unknown>)['@_Weight'])
  if (powerConsumption === undefined) powerConsumption = tryParse((ft as Record<string, unknown>)['@_PowerConsumption'])

  // Beam angle and colour temperature from Geometries
  let beamAngle: number | undefined
  let colorTemperature: number | undefined

  function scanBeam(obj: unknown): void {
    if (!obj || typeof obj !== 'object') return
    const o = obj as Record<string, unknown>
    const ba = o['@_BeamAngle']
    const ct = o['@_ColorTemperature']
    if (ba !== undefined && beamAngle === undefined) {
      const v = parseFloat(String(ba))
      if (!isNaN(v) && v > 0) beamAngle = v
    }
    if (ct !== undefined && colorTemperature === undefined) {
      const v = parseFloat(String(ct))
      if (!isNaN(v) && v > 0) colorTemperature = v
    }
    for (const key of Object.keys(o)) {
      if (typeof o[key] === 'object') scanBeam(o[key])
    }
  }
  if (ft?.Geometries) scanBeam(ft.Geometries)
  // Also check PhysicalDescriptions emitters / connectors
  if (ft?.PhysicalDescriptions) scanBeam(ft.PhysicalDescriptions)

  return {
    id,
    manufacturer,
    name,
    shortName,
    modes: modes.length > 0 ? modes : [{ name: 'Default', channelCount: 0 }],
    weight,
    powerConsumption,
    beamAngle,
    colorTemperature,
    symbol: inferSymbol(name, shortName),
  }
}

export function loadGDTFFromInput(): Promise<GDTFFixtureType> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.gdtf'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return reject(new Error('No file selected'))
      try {
        resolve(await parseGDTFFile(file))
      } catch (e) {
        reject(e)
      }
    }
    input.click()
  })
}
