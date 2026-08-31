/**
 * Client-side receipt compression. Targets < 150 KB so a treasurer on a 3G
 * connection in Ouagadougou can photograph a receipt without waiting.
 *
 * Canvas downscale + iterative JPEG quality reduction. No dependency needed
 * for the happy path; `browser-image-compression` is used as a fallback for
 * oversized or exotic source files (HEIC-converted, very large panoramas).
 */

export const MAX_RECEIPT_BYTES = 150 * 1024
const MAX_EDGE = 1024
const START_QUALITY = 0.7
const MIN_QUALITY = 0.35

export interface CompressResult {
  dataUrl: string
  bytes: number
  width: number
  height: number
  originalBytes: number
}

/** Rough byte size of a base64 data URL without re-encoding it. */
export function dataUrlBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(',')
  if (i < 0) return 0
  const b64 = dataUrl.slice(i + 1)
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - padding
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Image illisible"))
    }
    img.src = url
  })
}

function fit(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export async function compressReceipt(file: File): Promise<CompressResult> {
  const originalBytes = file.size
  let source: Blob = file

  // Anything enormous goes through the library first; it handles orientation
  // and huge inputs off the main thread via a worker.
  if (originalBytes > 8 * 1024 * 1024) {
    try {
      const { default: imageCompression } = await import('browser-image-compression')
      source = await imageCompression(file, {
        maxSizeMB: 0.14,
        maxWidthOrHeight: MAX_EDGE,
        useWebWorker: true,
        fileType: 'image/jpeg',
      })
    } catch {
      source = file // fall through to the canvas path
    }
  }

  const img = await loadImage(source)
  let { width, height } = fit(img.naturalWidth, img.naturalHeight, MAX_EDGE)

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponible sur cet appareil')

  let dataUrl = ''
  let bytes = Number.POSITIVE_INFINITY
  let quality = START_QUALITY

  // Drop quality first (cheap, keeps text legible), then dimensions.
  for (let pass = 0; pass < 8; pass++) {
    canvas.width = width
    canvas.height = height
    ctx.fillStyle = '#ffffff' // JPEG has no alpha; avoid black transparency
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)

    dataUrl = canvas.toDataURL('image/jpeg', quality)
    bytes = dataUrlBytes(dataUrl)
    if (bytes <= MAX_RECEIPT_BYTES) break

    if (quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality - 0.1)
    } else {
      const next = fit(width, height, Math.round(Math.max(width, height) * 0.8))
      width = next.width
      height = next.height
    }
  }

  return { dataUrl, bytes, width, height, originalBytes }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}
