export function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function formatVersion(v: number): string {
  const major = Math.floor(v / 10)
  const minor = v % 10
  return `V${major}.${minor}`
}

export function nextVersion(v: number): number {
  return v + 1
}

export function formatMeters(m: number): string {
  return `${m.toFixed(2)}m`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function downloadJSON(data: object, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadText(text: string, filename: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function loadJSONFile(): Promise<object> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return reject(new Error('No file selected'))
      const text = await file.text()
      resolve(JSON.parse(text))
    }
    input.click()
  })
}

export function loadImageFile(): Promise<{ src: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return reject(new Error('No file selected'))
      const reader = new FileReader()
      reader.onload = (e) => {
        const src = e.target?.result as string
        const img = new Image()
        img.onload = () => resolve({ src, width: img.width, height: img.height })
        img.onerror = reject
        img.src = src
      }
      reader.readAsDataURL(file)
    }
    input.click()
  })
}

export function pxToMeters(px: number, basePxPerMeter: number): number {
  return px / basePxPerMeter
}

export function metersToPx(m: number, basePxPerMeter: number): number {
  return m * basePxPerMeter
}

// Power helpers
export function wattsFromAmpsVolts(amps: number, volts: number): number {
  return amps * volts
}

export function loadPercentage(loadW: number, ratingA: number, voltageV: number): number {
  const capacityW = ratingA * voltageV
  return (loadW / capacityW) * 100
}

/**
 * Length of a cable run in metres: the manual override when set, otherwise the
 * sum of the drawn segments (start → waypoints → end).
 */
export function cableLength(c: {
  x: number; y: number; x2: number; y2: number
  waypoints?: { x: number; y: number }[]
  manualLength?: number
}): number {
  if (c.manualLength != null) return c.manualLength
  const pts = [{ x: c.x, y: c.y }, ...(c.waypoints ?? []), { x: c.x2, y: c.y2 }]
  let len = 0
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  return len
}
