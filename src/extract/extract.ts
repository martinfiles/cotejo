import { readFile } from 'node:fs/promises'
import { anthropic, type AnthropicLanguageModelOptions } from '@ai-sdk/anthropic'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { readCache, sha256, writeCache } from '../cache'
import { config, costUsd, type Usage } from '../config'
import type { BBox, DocType, ExtractedDoc } from '../types'
import { SYSTEM, userText } from './prompt'
import { toPageImage, type PageImage } from './rasterize'
import { ModelDocSchema, type ModelDoc } from './schema'

export type Extraction = {
  doc: ExtractedDoc
  fileHash: string
  model: string
  usage: Usage
  costUsd: number
  // Lo que tardó la llamada original, aunque este resultado venga de caché.
  latencyMs: number
  cached: boolean
}

type CacheEntry = { fingerprint: string; model: string; usage: Usage; latencyMs: number; doc: ExtractedDoc }

// La caché va por hash del fichero. Además se guarda con qué modelo, prompt
// y esquema se extrajo: si cambia cualquiera de los tres, la entrada deja de
// valer en vez de devolver un resultado viejo sin avisar.
const fingerprint = (docType: DocType) =>
  sha256([config.models.extract, config.extract.effort, SYSTEM, userText(docType, 0, 0), JSON.stringify(z.toJSONSchema(ModelDocSchema))].join('\n'))

// El modelo da [x1, y1, x2, y2] en píxeles; el resto del código usa
// fracciones de la página. Una caja vale si tiene cuatro números, tamaño, y
// cabe en la imagen.
function toBox(list: number[] | null, image: PageImage): BBox | null {
  if (list?.length !== 4) return null
  const [x1, y1, x2, y2] = list as [number, number, number, number]
  const inPage = x1 >= 0 && y1 >= 0 && x2 <= image.width && y2 <= image.height
  if (x2 <= x1 || y2 <= y1 || !inPage) return null
  return { x: x1 / image.width, y: y1 / image.height, w: (x2 - x1) / image.width, h: (y2 - y1) / image.height }
}

function requiredBox(list: number[], image: PageImage, what: string): BBox {
  const box = toBox(list, image)
  if (!box) throw new Error(`El modelo devolvió una caja inválida para ${what}: [${list}]`)
  return box
}

// La caja de un campo solo se conserva si además su centro cae dentro de su
// línea. Si no, queda a null y quien la use cae a la caja de la línea.
function fieldBox(list: number[] | null, image: PageImage, line: BBox): BBox | null {
  const box = toBox(list, image)
  if (!box) return null
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const inLine = cx >= line.x && cx <= line.x + line.w && cy >= line.y && cy <= line.y + line.h
  return inLine ? box : null
}

function normalize(raw: ModelDoc, docType: DocType, image: PageImage): ExtractedDoc {
  const prefix = docType === 'albaran' ? 'A' : 'F'
  return {
    ...raw,
    docType,
    lines: raw.lines.map((line, i) => {
      const key = `${prefix}${i + 1}`
      const bbox = requiredBox(line.bbox, image, `la línea ${key}`)
      return {
        ...line,
        key,
        bbox,
        quantity: { ...line.quantity, bbox: fieldBox(line.quantity.bbox, image, bbox) },
        unitPrice: { ...line.unitPrice, bbox: fieldBox(line.unitPrice.bbox, image, bbox) },
        total: { ...line.total, bbox: fieldBox(line.total.bbox, image, bbox) },
      }
    }),
    totals: { ...raw.totals, bbox: requiredBox(raw.totals.bbox, image, 'los totales') },
  }
}

export async function extract(
  path: string,
  docType: DocType,
  opts: { cacheOnly?: boolean; refresh?: boolean } = {},
): Promise<Extraction> {
  const bytes = await readFile(path)
  const fileHash = sha256(bytes)
  const expected = fingerprint(docType)

  const entry = opts.refresh ? null : await readCache<CacheEntry>('extract', fileHash)
  if (entry?.fingerprint === expected) {
    const { model, usage, latencyMs, doc } = entry
    return { doc, fileHash, model, usage, costUsd: costUsd(model, usage), latencyMs, cached: true }
  }
  if (opts.cacheOnly) {
    throw new Error(`No hay extracción en caché para ${path} con el modelo y el prompt actuales.`)
  }

  const image = toPageImage(path, bytes)
  const model = config.models.extract
  const started = Date.now()
  const result = await generateText({
    model: anthropic(model),
    maxOutputTokens: config.extract.maxOutputTokens,
    output: Output.object({ schema: ModelDocSchema }),
    providerOptions: { anthropic: { effort: config.extract.effort } satisfies AnthropicLanguageModelOptions },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'file', mediaType: image.mediaType, data: image.data },
          { type: 'text', text: userText(docType, image.width, image.height) },
        ],
      },
    ],
  })
  const latencyMs = Date.now() - started

  const usage = { inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0 }
  const doc = normalize(result.output, docType, image)
  await writeCache('extract', fileHash, { fingerprint: expected, model, usage, latencyMs, doc } satisfies CacheEntry)
  return { doc, fileHash, model, usage, costUsd: costUsd(model, usage), latencyMs, cached: false }
}
