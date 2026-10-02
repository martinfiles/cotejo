import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { chromium, type Browser } from 'playwright'
import type { DatasetCase, DocType, TruthLine } from '../src/types'
import { cases, type SeedCase } from './orders'
import { renderHtml, type DocData } from './template'

const OUT = 'seed/out'
const DATASET = 'evals/dataset.jsonl'

const round2 = (n: number) => Math.round(n * 100) / 100

function buildDoc(c: SeedCase, caseIndex: number, docType: DocType): DocData {
  const tweaks = c[docType] ?? {}

  const lines = c.lines.flatMap(([product, quantity], i) => {
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
      total: round2(printedQuantity * unitPrice),
      stamped: tweaks.stamp?.line === n ? tweaks.stamp.field : null,
    }]
  })

  const base = round2(lines.reduce((sum, l) => sum + l.total, 0))
  const vat = round2(lines.reduce((sum, l) => sum + (l.total * l.vatRate) / 100, 0) + (tweaks.vatDelta ?? 0))
  const total = round2(base + vat + (tweaks.totalDelta ?? 0))

  // Números y fechas salen del índice del caso, no del reloj.
  const day = String(caseIndex + 1).padStart(2, '0')
  const albaranNumber = `ALB-26-${4100 + caseIndex}`
  return {
    docType,
    supplier: c.supplier,
    number: docType === 'albaran' ? albaranNumber : `FAC-26-${880 + caseIndex}`,
    date: docType === 'albaran' ? `${day}/09/2026` : '30/09/2026',
    albaranRef: docType === 'factura' ? albaranNumber : null,
    lines,
    base,
    vat,
    total,
    photo: tweaks.photo ?? null,
    handwritten: tweaks.handwritten ?? false,
    stainOnTotal: tweaks.stainOnTotal ?? false,
  }
}

async function renderFile(browser: Browser, doc: DocData, dir: string) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1400 }, deviceScaleFactor: 1.5 })
  await page.setContent(renderHtml(doc))
  const path = `${dir}/${doc.docType}.${doc.photo ? 'jpg' : 'pdf'}`
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
  const albaran = buildDoc(c, i, 'albaran')
  const factura = buildDoc(c, i, 'factura')
  dataset.push({
    id: c.id,
    albaran: await renderFile(browser, albaran, dir),
    factura: await renderFile(browser, factura, dir),
    lines: { albaran: truth(albaran), factura: truth(factura) },
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
