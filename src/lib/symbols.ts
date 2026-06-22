// Fixture symbol drawing helpers for Konva
// All sizes are in pixels (the canvas handles meter→px conversion)

import Konva from 'konva'
import type { FixtureSymbolType } from '../types'

export const SYMBOL_RADIUS = 14 // px at base scale

export interface SymbolColors {
  fill: string
  stroke: string
}

export const defaultSymbolColors: Record<FixtureSymbolType, SymbolColors> = {
  wash: { fill: '#3b82f6', stroke: '#1d4ed8' },
  spot: { fill: '#f59e0b', stroke: '#b45309' },
  beam: { fill: '#8b5cf6', stroke: '#6d28d9' },
  par: { fill: '#10b981', stroke: '#047857' },
  strobe: { fill: '#ef4444', stroke: '#b91c1c' },
  flood: { fill: '#06b6d4', stroke: '#0e7490' },
  pixel: { fill: '#ec4899', stroke: '#be185d' },
  other: { fill: '#6b7280', stroke: '#374151' },
}

// Returns a Konva.Group representing the fixture symbol
export function createFixtureSymbol(
  type: FixtureSymbolType,
  x: number,
  y: number,
  rotation: number,
  selected: boolean,
  label: string,
  channel: number,
): Konva.Group {
  const colors = defaultSymbolColors[type]
  const r = SYMBOL_RADIUS
  const strokeColor = selected ? '#f97316' : colors.stroke
  const strokeWidth = selected ? 2.5 : 1.5

  const group = new Konva.Group({ x, y, rotation })

  switch (type) {
    case 'wash': {
      // Outer circle
      group.add(new Konva.Circle({ radius: r, fill: colors.fill, stroke: strokeColor, strokeWidth }))
      // Inner circle (lens)
      group.add(new Konva.Circle({ radius: r * 0.5, fill: colors.stroke, stroke: strokeColor, strokeWidth: 1 }))
      // 4 dots
      const dotPositions = [0, 90, 180, 270]
      for (const angle of dotPositions) {
        const rad = (angle * Math.PI) / 180
        group.add(new Konva.Circle({
          x: Math.cos(rad) * r * 0.75,
          y: Math.sin(rad) * r * 0.75,
          radius: 2,
          fill: strokeColor,
        }))
      }
      break
    }
    case 'spot': {
      group.add(new Konva.Circle({ radius: r, fill: colors.fill, stroke: strokeColor, strokeWidth }))
      // Crosshair
      group.add(new Konva.Line({ points: [-r * 0.7, 0, r * 0.7, 0], stroke: strokeColor, strokeWidth: 1.5 }))
      group.add(new Konva.Line({ points: [0, -r * 0.7, 0, r * 0.7], stroke: strokeColor, strokeWidth: 1.5 }))
      // Arrow pointing "up" (in rotation direction)
      group.add(new Konva.Arrow({
        points: [0, r * 0.3, 0, -r * 0.9],
        stroke: strokeColor,
        fill: strokeColor,
        strokeWidth: 1.5,
        pointerLength: 4,
        pointerWidth: 4,
      }))
      break
    }
    case 'beam': {
      group.add(new Konva.Circle({ radius: r, fill: colors.fill, stroke: strokeColor, strokeWidth }))
      // Narrow cone lines
      group.add(new Konva.Line({ points: [0, 0, -r * 0.6, -r * 1.4], stroke: strokeColor, strokeWidth: 1.5 }))
      group.add(new Konva.Line({ points: [0, 0, r * 0.6, -r * 1.4], stroke: strokeColor, strokeWidth: 1.5 }))
      break
    }
    case 'par': {
      // Filled circle with outer ring
      group.add(new Konva.Circle({ radius: r, fill: colors.fill, stroke: strokeColor, strokeWidth }))
      group.add(new Konva.Circle({ radius: r * 0.6, fill: colors.stroke, stroke: strokeColor, strokeWidth: 1 }))
      break
    }
    case 'strobe': {
      // Rectangle with lightning bolt
      group.add(new Konva.Rect({ x: -r, y: -r * 0.6, width: r * 2, height: r * 1.2, fill: colors.fill, stroke: strokeColor, strokeWidth }))
      // Zigzag
      group.add(new Konva.Line({
        points: [-r * 0.3, -r * 0.4, 0, 0, -r * 0.2, 0, r * 0.3, r * 0.4],
        stroke: strokeColor,
        strokeWidth: 2,
      }))
      break
    }
    case 'flood': {
      // Wide trapezoid
      group.add(new Konva.Line({
        points: [-r * 0.5, r * 0.5, r * 0.5, r * 0.5, r, -r * 0.5, -r, -r * 0.5],
        closed: true,
        fill: colors.fill,
        stroke: strokeColor,
        strokeWidth,
      }))
      break
    }
    case 'pixel': {
      // 3x3 grid of dots
      group.add(new Konva.Rect({ x: -r, y: -r, width: r * 2, height: r * 2, fill: colors.fill, stroke: strokeColor, strokeWidth, cornerRadius: 2 }))
      const spacing = r * 0.55
      for (let row = -1; row <= 1; row++) {
        for (let col = -1; col <= 1; col++) {
          group.add(new Konva.Circle({
            x: col * spacing,
            y: row * spacing,
            radius: 2.5,
            fill: strokeColor,
          }))
        }
      }
      break
    }
    default: {
      // X in circle
      group.add(new Konva.Circle({ radius: r, fill: colors.fill, stroke: strokeColor, strokeWidth }))
      group.add(new Konva.Line({ points: [-r * 0.6, -r * 0.6, r * 0.6, r * 0.6], stroke: strokeColor, strokeWidth: 1.5 }))
      group.add(new Konva.Line({ points: [r * 0.6, -r * 0.6, -r * 0.6, r * 0.6], stroke: strokeColor, strokeWidth: 1.5 }))
    }
  }

  // Channel label (above symbol)
  if (channel > 0) {
    group.add(new Konva.Text({
      x: -20,
      y: -r - 16,
      width: 40,
      text: String(channel),
      fontSize: 10,
      fontFamily: 'monospace',
      fill: '#1f2937',
      align: 'center',
    }))
  }

  // Unit label (below symbol)
  if (label) {
    group.add(new Konva.Text({
      x: -24,
      y: r + 3,
      width: 48,
      text: label,
      fontSize: 9,
      fontFamily: 'monospace',
      fill: '#374151',
      align: 'center',
    }))
  }

  return group
}
