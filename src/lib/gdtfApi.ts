// GDTF Share public API integration
// Note: GDTF Share may require a CORS proxy in production.
// If requests fail, use local .gdtf file import instead.

import type { GDTFFixtureType } from '../types'
import { parseGDTFFile } from './gdtf'

const API_BASE = 'https://gdtf-share.com/apis/public/index.php'

export interface GDTFShareResult {
  rid: string
  manufacturer: string
  fixture: string
  uuid: string
  // there are more fields but these are key
}

export async function searchGDTFShare(query: string): Promise<GDTFShareResult[]> {
  const params = new URLSearchParams({
    request: 'getFixtureList',
    search: query,
  })
  const res = await fetch(`${API_BASE}?${params}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`GDTF Share API error: ${res.status}`)
  const data = await res.json()
  // API returns an array or an object with results
  if (Array.isArray(data)) return data as GDTFShareResult[]
  if (data?.result) return data.result as GDTFShareResult[]
  return []
}

export async function downloadGDTFFromShare(rid: string): Promise<GDTFFixtureType> {
  const params = new URLSearchParams({
    request: 'downloadFile',
    rid,
  })
  const res = await fetch(`${API_BASE}?${params}`)
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  const buffer = await res.arrayBuffer()
  return parseGDTFFile(buffer)
}
