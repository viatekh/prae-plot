// Fixture symbol geometry — the single source of truth for how a fixture
// symbol looks. Both renderers consume it:
//   • the Konva canvas (src/components/canvas/PlotCanvas.tsx)
//   • the vector PDF plot renderer (src/lib/plotVector.ts)
//
// All coordinates are expressed in multiples of the symbol radius `r`, with the
// symbol centred on (0,0) and the beam pointing towards −y ("up"). Line weights
// are expressed in weight units: 1 = body line, 2 = housing outline.

import type { FixtureSymbolType } from '../types'

/** Which colour a primitive is painted with. */
export type FillRole =
  | 'none'    // no fill
  | 'body'    // white fixture body
  | 'accent'  // the symbol's stroke colour (orange when selected)
  | 'tint'    // the symbol's type colour, heavily lightened
  | 'type'    // the symbol's type colour, solid

export type SymbolPrimitive =
  | { k: 'circle'; cx?: number; cy?: number; r: number; fill?: FillRole; lw?: number }
  | { k: 'rect'; x: number; y: number; w: number; h: number; radius?: number; fill?: FillRole; lw?: number }
  | { k: 'path'; pts: number[]; closed?: boolean; fill?: FillRole; lw?: number }

/** Radial tick marks used by the wash symbol. */
function radialTicks(inner: number, outer: number, lw: number): SymbolPrimitive[] {
  return [0, 90, 180, 270].map((deg) => {
    const rad = (deg * Math.PI) / 180
    return {
      k: 'path' as const,
      pts: [Math.cos(rad) * inner, Math.sin(rad) * inner, Math.cos(rad) * outer, Math.sin(rad) * outer],
      lw,
    }
  })
}

/** Horizontal chords across a circle of radius 1 — the PAR reflector lines. */
function parChords(lw: number): SymbolPrimitive[] {
  return [-0.42, 0, 0.42].map((yOff) => {
    const half = Math.sqrt(Math.max(0, 1 - yOff * yOff)) * 0.85
    return { k: 'path' as const, pts: [-half, yOff, half, yOff], lw }
  })
}

const SYMBOL_SHAPES: Record<FixtureSymbolType, SymbolPrimitive[]> = {
  // Moving head wash — bullseye: housing ring, lens ring, hub, radial ticks
  wash: [
    { k: 'circle', r: 1, fill: 'body', lw: 2 },
    { k: 'circle', r: 0.52, fill: 'tint', lw: 1 },
    { k: 'circle', r: 0.18, fill: 'accent', lw: 0 },
    ...radialTicks(0.56, 0.92, 1),
  ],

  // Moving head spot — housing, gobo crosshair, beam triangle
  spot: [
    { k: 'circle', r: 1, fill: 'body', lw: 2 },
    { k: 'path', pts: [-0.7, 0, 0.7, 0], lw: 1 },
    { k: 'path', pts: [0, -0.7, 0, 0.7], lw: 1 },
    { k: 'path', pts: [-0.55, -0.85, 0, -1.85, 0.55, -0.85], closed: true, fill: 'tint', lw: 1 },
  ],

  // Moving head beam — tight housing, solid hub, narrow converging beam
  beam: [
    { k: 'circle', r: 0.62, fill: 'body', lw: 2 },
    { k: 'circle', r: 0.22, fill: 'accent', lw: 0 },
    { k: 'path', pts: [-0.42, -0.62, 0, -2.1, 0.42, -0.62], lw: 1 },
    { k: 'path', pts: [-0.42, -0.62, 0.42, -0.62], lw: 1 },
  ],

  // PAR can — housing with parabolic reflector lines
  par: [
    { k: 'circle', r: 1, fill: 'body', lw: 2 },
    ...parChords(1),
  ],

  // Strobe / blinder — wide flat body with flash bars
  strobe: [
    { k: 'rect', x: -1.15, y: -0.52, w: 2.3, h: 1.04, radius: 0.14, fill: 'body', lw: 2 },
    { k: 'path', pts: [-0.42, -0.28, -0.42, 0.28], lw: 2 },
    { k: 'path', pts: [0, -0.28, 0, 0.28], lw: 2 },
    { k: 'path', pts: [0.42, -0.28, 0.42, 0.28], lw: 2 },
  ],

  // Fresnel / flood — housing, lens ring, wide beam trapezoid
  flood: [
    { k: 'circle', r: 1, fill: 'body', lw: 2 },
    { k: 'circle', r: 0.48, fill: 'tint', lw: 1 },
    { k: 'path', pts: [-0.72, -0.9, -1.6, -2.1, 1.6, -2.1, 0.72, -0.9], lw: 1 },
  ],

  // LED pixel bar — slim body with evenly spaced emitters
  pixel: [
    { k: 'rect', x: -1.6, y: -0.48, w: 3.2, h: 0.96, radius: 0.14, fill: 'body', lw: 2 },
    { k: 'circle', cx: -1.05, r: 0.21, fill: 'type', lw: 0.5 },
    { k: 'circle', cx: -0.35, r: 0.21, fill: 'type', lw: 0.5 },
    { k: 'circle', cx: 0.35, r: 0.21, fill: 'type', lw: 0.5 },
    { k: 'circle', cx: 1.05, r: 0.21, fill: 'type', lw: 0.5 },
  ],

  // Anything else — housing with a cross
  other: [
    { k: 'circle', r: 1, fill: 'body', lw: 2 },
    { k: 'path', pts: [-0.55, -0.55, 0.55, 0.55], lw: 1 },
    { k: 'path', pts: [0.55, -0.55, -0.55, 0.55], lw: 1 },
  ],
}

export function symbolShapes(type: FixtureSymbolType): SymbolPrimitive[] {
  return SYMBOL_SHAPES[type] ?? SYMBOL_SHAPES.other
}

/**
 * Half-extent of a symbol in radius units, used for bounds and legend layout.
 * Covers the widest/tallest primitive including beam indicators.
 */
export function symbolExtent(type: FixtureSymbolType): { x: number; y: number } {
  let x = 1
  let y = 1
  for (const p of symbolShapes(type)) {
    if (p.k === 'circle') {
      x = Math.max(x, Math.abs(p.cx ?? 0) + p.r)
      y = Math.max(y, Math.abs(p.cy ?? 0) + p.r)
    } else if (p.k === 'rect') {
      x = Math.max(x, Math.abs(p.x), Math.abs(p.x + p.w))
      y = Math.max(y, Math.abs(p.y), Math.abs(p.y + p.h))
    } else {
      for (let i = 0; i < p.pts.length; i += 2) {
        x = Math.max(x, Math.abs(p.pts[i]))
        y = Math.max(y, Math.abs(p.pts[i + 1]))
      }
    }
  }
  return { x, y }
}

/**
 * Maps a geometry line-weight unit to a stroke width.
 * `base` scales the result into the target unit (canvas px, PDF mm, …).
 */
export function symbolLineWidth(w: number, base = 1): number {
  if (w <= 0) return 0
  return (w >= 2 ? 2 : w * 1.2) * base
}
