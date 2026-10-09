// Corre el dataset entero por el pipeline en dos estados de conocimiento y
// escribe el informe que lee la pantalla de métricas.
//
//   npm run eval                  solo caché: sin red y sin gastar tokens
//   npm run eval -- --refresh     llama al modelo para lo que no esté en caché
//   npm run eval -- --name X      guarda además el informe como evals/results/X.*

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { processCase } from '../src/pipeline'
import { listFacts } from '../src/store'
import type { DatasetCase, Fact } from '../src/types'
import { costs, perRule, record, routing, type CaseRecord } from './metrics'
import { renderReport } from './report'

const OUT = 'evals/results'

const args = process.argv.slice(2)
const refresh = args.includes('--refresh')
const name = args.includes('--name') ? args[args.indexOf('--name') + 1] : null

const dataset: DatasetCase[] = (await readFile('evals/dataset.jsonl', 'utf8')).trim().split('\n').map((l) => JSON.parse(l))
const learned = (await listFacts()).filter((f) => !f.revokedAt)

// El mismo dataset dos veces: sin saber nada de los proveedores y con lo que
// se ha aprendido hasta ahora. Cada caso se compara con el esperado que le
// toca según tenga o no los hechos que necesita.
const states = [
  { id: 'sin-hechos', label: 'Sin hechos aprendidos', facts: [] as Fact[] },
  { id: 'con-hechos', label: `Con los hechos aprendidos hasta ahora`, facts: learned },
]

const records: CaseRecord[] = []
for (const state of states) {
  for (const c of dataset) {
    const result = await processCase({ id: c.id, albaranes: c.albaranes, factura: c.factura }, { facts: state.facts, cacheOnly: !refresh })
    records.push(record(c, state.id, state.facts, result))
  }
}

const report = {
  runAt: new Date().toISOString(),
  cacheOnly: !refresh,
  dataset: {
    seed: dataset.filter((c) => c.source === 'seed').length,
    corrections: dataset.filter((c) => c.source === 'correction').length,
    holdout: dataset.filter((c) => c.holdout).length,
    boundary: dataset.filter((c) => c.boundary).length,
  },
  facts: learned.map((f) => ({ ...f })),
  // Lo máximo que se puede resolver solo: casos de cabecera que pasan si se
  // sabe todo lo que necesitan.
  ceiling: (() => {
    const headline = dataset.filter((c) => c.source === 'seed' && !c.boundary)
    const n = headline.filter((c) => c.expected.withKnowledge.decision === 'pass').length
    return { n, of: headline.length, pct: Math.round((1000 * n) / headline.length) / 10 }
  })(),
  states: states.map((state) => {
    const all = records.filter((r) => r.state === state.id)
    const headline = all.filter((r) => r.group === 'headline')
    return {
      id: state.id,
      label: state.label,
      facts: state.facts.length,
      headline: routing(headline),
      holdout: routing(headline.filter((r) => r.holdout)),
      // Los mismos casos de cabecera, según cuántos albaranes trae cada uno.
      byAlbaranes: ['1', '2', '3 o más'].map((label, i) => ({
        label,
        ...routing(headline.filter((r) => Math.min(r.albaranes, 3) === i + 1)),
      })),
      rules: perRule(headline),
      corrections: routing(all.filter((r) => r.group === 'correction')),
      unresolvedLines: headline.flatMap((r) => r.unresolvedLines.map((l) => `${r.caseId}: ${l}`)),
      failures: headline
        .filter((r) => r.got.outcome !== r.expected.decision || (r.expected.reason && r.got.reason !== r.expected.reason))
        .map((r) => ({ caseId: r.caseId, expected: `${r.expected.decision} ${r.expected.reason}`, got: `${r.got.outcome} ${r.got.reason}` })),
    }
  }),
  boundary: records.filter((r) => r.group === 'boundary'),
  corrections: records.filter((r) => r.group === 'correction'),
  // Los documentos son los mismos en los dos estados: el coste se cuenta una vez.
  cost: costs(records.filter((r) => r.state === 'sin-hechos')),
  records,
}

export type Report = typeof report

await mkdir(OUT, { recursive: true })
const md = renderReport(report)
for (const file of ['latest', ...(name ? [name] : [])]) {
  await writeFile(`${OUT}/${file}.json`, JSON.stringify(report, null, 2) + '\n')
  await writeFile(`${OUT}/${file}.md`, md)
}

for (const s of report.states) {
  const h = s.headline
  console.log(`${s.label} (${s.facts} hechos): ${h.autonomous.pct} % resueltos solos, acierto de decisión ${h.decisionCorrect.pct} %, ${s.failures.length} fallos`)
}
console.log(`Informe en ${OUT}/latest.md${name ? ` y ${OUT}/${name}.md` : ''}`)
