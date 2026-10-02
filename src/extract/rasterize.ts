import { extname } from 'node:path'
import * as mupdf from 'mupdf'
import { config } from '../config'

export type PageImage = {
  data: Uint8Array
  mediaType: 'image/png' | 'image/jpeg'
  width: number
  height: number
}

// El modelo y los recortes de la interfaz trabajan sobre esta misma imagen,
// así las cajas que devuelve el modelo valen tal cual para recortar.
export function toPageImage(path: string, bytes: Uint8Array): PageImage {
  const ext = extname(path).toLowerCase()
  if (ext === '.pdf') {
    // Solo la primera página: los documentos de varias páginas quedan fuera.
    const page = mupdf.Document.openDocument(bytes, 'application/pdf').loadPage(0)
    const [x0, y0, x1, y1] = page.getBounds()
    const scale = config.raster.longEdgePx / Math.max(x1 - x0, y1 - y0)
    const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false)
    return { data: pixmap.asPNG(), mediaType: 'image/png', width: pixmap.getWidth(), height: pixmap.getHeight() }
  }

  const mediaType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : null
  if (!mediaType) throw new Error(`Formato no soportado: ${path}`)
  const image = new mupdf.Image(bytes)
  return { data: bytes, mediaType, width: image.getWidth(), height: image.getHeight() }
}
