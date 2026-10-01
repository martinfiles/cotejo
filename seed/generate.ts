import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, type Browser } from 'playwright'
import type { DatasetCase, DocType } from '../src/types'
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
    const lineQuantity = set?.quantity ?? quantity / factor
    const unitPrice = set?.unitPrice ?? round2(product.unitPrice * factor)
    return [{
      code: product.code,
      description: as?.description ?? product.description,
      quantity: lineQuantity,
      unit: as?.unit ?? product.unit,
      unitPrice,
      vatRate: product.vatRate,
      total: round2(lineQuantity * unitPrice),
      stamped: tweaks.stamp?.line === n ? tweaks.stamp.field : null,
    }]
  })

  const base = round2(lines.reduce((sum, l) => sum + l.total, 0))
  const vat = round2(lines.reduce((sum, l) => sum + (l.total * l.vatRate) / 100, 0) + (tweaks.vatDelta ?? 0))
  const total = round2(base + vat + (tweaks.totalDelta ?? 0))

  // Números y fechas salen del índice del caso para que regenerar dé lo mismo.
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
    photo: tweaks.photo ?? false,
  }
}

async function renderFile(browser: Browser, doc: DocData, dir: string) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1400 }, deviceScaleFactor: 1.5 })
  await page.setContent(renderHtml(doc))
  const path = `${dir}/${doc.docType}.${doc.photo ? 'jpg' : 'pdf'}`
  if (doc.photo) await page.screenshot({ path, type: 'jpeg', quality: 60, fullPage: true })
  else await page.pdf({ path, format: 'A4', printBackground: true })
  await page.close()
  return path
}

const browser = await chromium.launch()
const dataset: DatasetCase[] = []

for (const [i, c] of cases.entries()) {
  const dir = `${OUT}/${c.id}`
  await mkdir(dir, { recursive: true })
  dataset.push({
    id: c.id,
    albaran: await renderFile(browser, buildDoc(c, i, 'albaran'), dir),
    factura: await renderFile(browser, buildDoc(c, i, 'factura'), dir),
    expected: c.expected,
    source: 'seed',
    note: c.note,
  })
}

await browser.close()
await mkdir('evals', { recursive: true })
await writeFile(DATASET, dataset.map((d) => JSON.stringify(d)).join('\n') + '\n')
console.log(`${dataset.length} casos en ${OUT}, dataset en ${DATASET}`)
