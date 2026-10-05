import { readFile } from 'node:fs/promises'
import { toPageImage, type PageImage } from '@cotejo/extract/rasterize'

// La misma imagen que vio el modelo, para recortar con sus cajas. Solo se
// sirven ficheros del seed y subidos: la ruta llega en la URL.
const ALLOWED = /^(seed\/out|data\/uploads)\/[\w./-]+$/

const images = new Map<string, PageImage>()

export async function pageImage(file: string): Promise<PageImage | null> {
  if (!ALLOWED.test(file) || file.includes('..')) return null
  const cached = images.get(file)
  if (cached) return cached
  const image = toPageImage(file, await readFile(file))
  images.set(file, image)
  return image
}

export const pageUrl = (file: string) => `/pagina?f=${encodeURIComponent(file)}`
