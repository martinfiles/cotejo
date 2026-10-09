import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { chromium, type Browser } from 'playwright'
import type { DatasetCase, DocType, TruthLine } from '../src/types'
import { cases, type SeedCase, type Tweaks } from './orders'
import { renderHtml, type DocData } from './template'

const OUT = 'seed/out'
const DATASET = 'evals/dataset.jsonl'

const round2 = (n: number) => Math.round(n * 100) / 100

type Header = Pick<DocData, 'number' | 'date' | 'cites'>
// Las líneas de un documento. `section` es el rótulo del grupo en una factura
// agrupada por albarán.
type Entry = { line: SeedCase['lines'][number]; section: string | null }

const plain = (lines: SeedCase['lines']): Entry[] => lines.map((line) => ({ line, section: null }))

function buildDoc(c: SeedCase, docType: DocType, entries: Entry[], tweaks: Tweaks, header: Header): DocData {
  const lines = entries.flatMap(({ line: [product, quantity], section }, i) => {
    const n = i + 1
    if (tweaks.drop === n) return []
    const as = docType === 'albaran' ? product.albaranAs : undefined
    const factor = as?.factor ?? 1
    const set = tweaks.set?.line === n ? tweaks.set : undefined
    const corrected = tweaks.correctedByHand?.line === n ? tweaks.correctedByHand.quantity : null
    const printedQuantity = set?.quantity ?? quantity / factor
    const unitPrice = set?.unitPrice ?? round2(product.unitPrice * factor)
    return [{
      productId: product.id,
      code: product.code,
      description: as?.description ?? product.description,
      quantity: corrected ?? printedQuantity,
      crossedOut: corrected === null ? null : printedQuantity,
      unit: as?.unit ?? product.unit,
      unitPrice,
      vatRate: product.vatRate,
      discount: product.discount ?? 0,
      total: round2(printedQuantity * unitPrice * (1 - (product.discount ?? 0) / 100)),
      stamped: tweaks.stamp?.line === n ? tweaks.stamp.field : null,
      section,
    }]
  })

  if (tweaks.reversed) lines.reverse()

  const base = round2(lines.reduce((sum, l) => sum + l.total, 0))
  const vat = round2(lines.reduce((sum, l) => sum + (l.total * l.vatRate) / 100, 0) + (tweaks.vatDelta ?? 0))
  const total = round2(base + vat + (tweaks.totalDelta ?? 0))

  return {
    docType,
    supplier: c.supplier,
    ...header,
    lines,
    base,
    vat,
    total,
    photo: tweaks.photo ?? null,
    handwritten: tweaks.handwritten ?? false,
    stainOnTotal: tweaks.stainOnTotal ?? false,
    scaleFormat: tweaks.scaleFormat ?? false,
    cramped: tweaks.cramped ?? false,
  }
}

// Los albaranes del caso y su factura. Números y fechas salen del índice del
// caso, no del reloj.
function buildCase(c: SeedCase, caseIndex: number) {
  const order = `PED-26-${700 + caseIndex}`
  // Un caso sin entregas declaradas es un solo albarán con el pedido entero.
  const deliveries = (c.deliveries ?? [{ lines: c.lines, albaran: c.albaran }]).map((d, k) => ({
    ...d,
    file: c.deliveries ? `albaran-${k + 1}` : 'albaran',
    number: c.deliveries ? `ALB-26-${4300 + caseIndex * 10 + k}` : `ALB-26-${4100 + caseIndex}`,
    // Una entrega por semana.
    date: `${String(c.deliveries ? 2 + 7 * k + (caseIndex % 5) : caseIndex + 1).padStart(2, '0')}/09/2026`,
  }))
  const invoiced = deliveries.filter((d) => !d.uninvoiced)

  // El reparto está escrito a mano: lo que cobran las entregas tiene que
  // sumar el pedido.
  const sum = (lines: SeedCase['lines']) => {
    const byProduct: Record<string, number> = {}
    for (const [product, quantity] of lines) byProduct[product.id] = (byProduct[product.id] ?? 0) + quantity
    return JSON.stringify(Object.entries(byProduct).sort())
  }
  if (sum(invoiced.flatMap((d) => d.lines)) !== sum(c.lines)) throw new Error(`${c.id}: las entregas no suman el pedido`)

  const cites = c.cites ?? 'list'
  const albaranes = deliveries
    .filter((d) => !d.absent)
    .map((d) => ({
      file: d.file,
      doc: buildDoc(c, 'albaran', plain(d.lines), d.albaran ?? {}, {
        number: d.number,
        date: d.date,
        cites: cites === 'order' ? [`Pedido ${d.order ?? order}`] : [],
      }),
    }))

  const numbers = invoiced.map((d) => d.number).join(', ')
  const factura = buildDoc(
    c,
    'factura',
    cites === 'sections'
      ? invoiced.flatMap((d) => d.lines.map((line) => ({ line, section: `Albarán ${d.number} · ${d.date}` })))
      : plain(c.lines),
    c.factura ?? {},
    {
      number: `FAC-26-${880 + caseIndex}`,
      date: '30/09/2026',
      cites: {
        sections: [],
        list: [`${invoiced.length > 1 ? 'Albaranes' : 'Albarán'} ${numbers}`],
        dates: [`Entregas del ${invoiced.map((d) => d.date).join(' y ')}`],
        order: [`Pedido ${order}`],
      }[cites],
    },
  )
  return { albaranes, factura }
}

async function renderFile(browser: Browser, doc: DocData, dir: string, name: string) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1400 }, deviceScaleFactor: 1.5 })
  await page.setContent(renderHtml(doc))
  const path = `${dir}/${name}.${doc.photo ? 'jpg' : 'pdf'}`
  if (doc.photo) {
    await page.screenshot({ path, type: 'jpeg', quality: doc.photo === 'poor' ? 30 : 60, fullPage: true })
  } else {
    // Chromium escribe la hora de creación en el PDF. Se fija para que
    // regenerar dé los mismos bytes y el hash del fichero no cambie. La
    // sustitución conserva la longitud, así que la tabla xref sigue valiendo.
    const pdf = (await page.pdf({ format: 'A4', printBackground: true }))
      .toString('latin1')
      .replace(/\/(CreationDate|ModDate) \(D:\d{14}/g, '/$1 (D:20260901000000')
    await writeFile(path, pdf, 'latin1')
  }
  await page.close()
  return path
}

const truth = (doc: DocData): TruthLine[] =>
  doc.lines.map(({ productId, code, description, quantity }) => ({ productId, code, description, quantity }))

if (existsSync(OUT) && !process.argv.includes('--force')) {
  console.error(
    `${OUT} ya existe. Regenerar sobrescribe los documentos y ${DATASET}, ` +
      'incluidos los casos añadidos por correcciones.\n' +
      'Para continuar: npm run seed -- --force',
  )
  process.exit(1)
}

await rm(OUT, { recursive: true, force: true })
const browser = await chromium.launch()
const dataset: DatasetCase[] = []

for (const [i, c] of cases.entries()) {
  const dir = `${OUT}/${c.id}`
  await mkdir(dir, { recursive: true })
  const { albaranes, factura } = buildCase(c, i)
  const files: string[] = []
  for (const a of albaranes) files.push(await renderFile(browser, a.doc, dir, a.file))
  dataset.push({
    id: c.id,
    albaranes: files,
    factura: await renderFile(browser, factura, dir, 'factura'),
    lines: { albaran: albaranes.flatMap((a) => truth(a.doc)), factura: truth(factura) },
    requires: c.lines.flatMap(([product]) => product.requires ?? []),
    expected: { withoutKnowledge: c.withoutKnowledge ?? c.expected, withKnowledge: c.expected },
    holdout: c.holdout ?? false,
    boundary: c.boundary ?? false,
    source: 'seed',
    note: c.note,
  })
}

await browser.close()
await mkdir('evals', { recursive: true })
await writeFile(DATASET, dataset.map((d) => JSON.stringify(d)).join('\n') + '\n')
console.log(`${dataset.length} casos en ${OUT}, dataset en ${DATASET}`)
