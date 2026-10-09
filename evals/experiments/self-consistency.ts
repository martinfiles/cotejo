// Experimento: ¿cuánto cambia la lectura de un mismo documento entre dos
// llamadas al modelo? La primera lectura es la de la caché; la segunda se
// hace aquí, sin caché. La discrepancia entre las dos es una medida de
// incertidumbre que no depende de lo que el modelo diga de sí mismo.
//
// No forma parte del pipeline. Cada ejecución vuelve a llamar al modelo.

import { readFile, writeFile } from 'node:fs/promises'
import { costUsd } from '../../src/config'
import { extract, readDocument } from '../../src/extract/extract'
import type { Amount, DatasetCase, DocType, ExtractedDoc } from '../../src/types'

const OUT = 'evals/experiments/self-consistency'
const CONCURRENCY = 3

type Value = string | number | null
type Diff = { file: string; field: string; first: Value; second: Value }
type ConfidenceShift = { file: string; field: string; first: number; second: number }

// Todos los valores leídos de un documento, con un nombre estable por campo.
function values(doc: ExtractedDoc) {
  const out = new Map<string, Value>([
    ['supplier', doc.supplier],
    ['supplierTaxId', doc.supplierTaxId],
    ['number', doc.number],
    ['date', doc.date],
    ['refs', JSON.stringify(doc.refs)],
    ['lines.length', doc.lines.length],
    ['totals.base', doc.totals.base.value],
    ['totals.vat', doc.totals.vat.value],
    ['totals.total', doc.totals.total.value],
  ])
  for (const line of doc.lines) {
    out.set(`${line.key}.code`, line.code)
    out.set(`${line.key}.description`, line.description)
    out.set(`${line.key}.quantity`, line.quantity.value)
    out.set(`${line.key}.unit`, line.unit)
    out.set(`${line.key}.unitPrice`, line.unitPrice.value)
    out.set(`${line.key}.vatRate`, line.vatRate)
    out.set(`${line.key}.discount`, line.discount)
    out.set(`${line.key}.total`, line.total.value)
  }
  return out
}

function confidences(doc: ExtractedDoc) {
  const out = new Map<string, Amount>([
    ['totals.base', doc.totals.base],
    ['totals.vat', doc.totals.vat],
    ['totals.total', doc.totals.total],
  ])
  for (const line of doc.lines) {
    out.set(`${line.key}.quantity`, line.quantity)
    out.set(`${line.key}.unitPrice`, line.unitPrice)
    out.set(`${line.key}.total`, line.total)
  }
  return out
}

// "F3.unitPrice" y "A1.unitPrice" cuentan los dos como "unitPrice".
const kindOf = (field: string) => field.replace(/^[AF]\d+\./, '')

const cases: DatasetCase[] = (await readFile('evals/dataset.jsonl', 'utf8')).trim().split('\n').map((l) => JSON.parse(l))
const jobs = cases.flatMap((c) => [...c.albaranes.map((file) => [file, 'albaran']), [c.factura, 'factura']] as [string, DocType][])
const documents = jobs.length

const diffs: Diff[] = []
const shifts: ConfidenceShift[] = []
let fields = 0
let amounts = 0
let cost = 0

async function worker() {
  for (let job; (job = jobs.shift()); ) {
    const [file, docType] = job
    const first = (await extract(file, docType, { cacheOnly: true })).doc
    const second = await readDocument(file, docType, await readFile(file))
    cost += costUsd(second.model, second.usage)

    const a = values(first)
    const b = values(second.doc)
    for (const field of new Set([...a.keys(), ...b.keys()])) {
      fields++
      const [x, y] = [a.get(field) ?? null, b.get(field) ?? null]
      if (x !== y) diffs.push({ file, field, first: x, second: y })
    }

    const ca = confidences(first)
    const cb = confidences(second.doc)
    for (const [field, x] of ca) {
      const y = cb.get(field)
      if (!y) continue
      amounts++
      if (x.confidence !== y.confidence) shifts.push({ file, field, first: x.confidence, second: y.confidence })
    }
    console.log(file)
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))

const count = <T>(items: T[], key: (item: T) => string) =>
  Object.entries(items.reduce<Record<string, number>>((acc, item) => ({ ...acc, [key(item)]: (acc[key(item)] ?? 0) + 1 }), {}))
    .sort((x, y) => y[1] - x[1])

const pct = (n: number, of: number) => `${((100 * n) / of).toFixed(1)} %`
const delta = (s: ConfidenceShift) => Math.abs(s.first - s.second)
const bigShifts = shifts.filter((s) => delta(s) >= 0.1).sort((x, y) => delta(y) - delta(x))

const report = {
  runAt: new Date().toISOString(),
  documents,
  fieldsCompared: fields,
  fieldsDiffering: diffs.length,
  documentsWithDiffs: new Set(diffs.map((d) => d.file)).size,
  amountsCompared: amounts,
  confidencesDiffering: shifts.length,
  confidencesDifferingBy10: bigShifts.length,
  costUsd: Number(cost.toFixed(4)),
  diffs,
  shifts,
}
await writeFile(`${OUT}.json`, JSON.stringify(report, null, 2) + '\n')

const md = `# Autoconsistencia de la extracción

Ejecutado el ${report.runAt}. Segunda lectura de los ${report.documents} documentos del seed, sin caché, comparada campo a campo con la primera (la que está en \`cache/extract\`). Mismo modelo, mismo prompt y mismo esquema en las dos; el modelo no admite fijar la temperatura.

Con ${cases.length} casos sintéticos esto es una señal, no una estadística.

## Valores

- Campos comparados: ${fields}
- Campos que difieren entre las dos lecturas: ${diffs.length} (${pct(diffs.length, fields)})
- Documentos con alguna diferencia: ${report.documentsWithDiffs} de ${report.documents}

${diffs.length ? `| Campo | Diferencias |\n|---|---|\n${count(diffs, (d) => kindOf(d.field)).map(([k, n]) => `| ${k} | ${n} |`).join('\n')}

| Documento | Campo | Primera lectura | Segunda lectura |
|---|---|---|---|
${diffs.map((d) => `| ${d.file} | ${d.field} | ${JSON.stringify(d.first)} | ${JSON.stringify(d.second)} |`).join('\n')}` : 'Ninguna diferencia.'}

## Confianza declarada

- Importes comparados: ${amounts}
- Con confianza distinta entre las dos lecturas: ${shifts.length} (${pct(shifts.length, amounts)})
- Con una diferencia de 0,1 o más: ${bigShifts.length} (${pct(bigShifts.length, amounts)})

${bigShifts.length ? `| Documento | Campo | Primera | Segunda |\n|---|---|---|---|\n${bigShifts.map((s) => `| ${s.file} | ${s.field} | ${s.first} | ${s.second} |`).join('\n')}` : ''}

## Coste

La segunda lectura costó ${report.costUsd} USD.
`
await writeFile(`${OUT}.md`, md)
console.log(`\n${diffs.length} de ${fields} campos difieren; informe en ${OUT}.md`)
