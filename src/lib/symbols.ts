// Fixture symbol styling. The geometry itself lives in symbolGeometry.ts and is
// shared by the canvas and the PDF plot renderer.

import type { FixtureSymbolType } from '../types'

export const SYMBOL_RADIUS = 14 // px at base canvas scale

/** Nominal real-world radius of a fixture symbol, in metres. */
export const SYMBOL_RADIUS_M = 0.28

export interface SymbolColors {
  fill: string
  stroke: string
}

export const defaultSymbolColors: Record<FixtureSymbolType, SymbolColors> = {
  wash:   { fill: '#3b82f6', stroke: '#1d4ed8' },
  spot:   { fill: '#f59e0b', stroke: '#b45309' },
  beam:   { fill: '#8b5cf6', stroke: '#6d28d9' },
  par:    { fill: '#10b981', stroke: '#047857' },
  strobe: { fill: '#ef4444', stroke: '#b91c1c' },
  flood:  { fill: '#06b6d4', stroke: '#0e7490' },
  pixel:  { fill: '#ec4899', stroke: '#be185d' },
  other:  { fill: '#6b7280', stroke: '#374151' },
}

export function symbolColors(type: FixtureSymbolType): SymbolColors {
  return defaultSymbolColors[type] ?? defaultSymbolColors.other
}
