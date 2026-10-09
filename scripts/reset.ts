// Devuelve el proyecto al punto de partida de la demo: sin hechos aprendidos,
// el dataset solo con los casos del seed, y todos esos casos procesados desde
// caché y sin resolver. No llama al modelo ni a Langfuse.

import { readFile, writeFile } from 'node:fs/promises'
import { runCase } from '../src/cases'
import { clearStore } from '../src/store'
import type { DatasetCase } from '../src/types'

const DATASET = 'evals/dataset.jsonl'

const all: DatasetCase[] = (await readFile(DATASET, 'utf8')).trim().split('\n').map((l) => JSON.parse(l))
const seed = all.filter((c) => c.source === 'seed')
await writeFile(DATASET, seed.map((c) => JSON.stringify(c)).join('\n') + '\n')

await clearStore()
const counts: Record<string, number> = {}
for (const [i, c] of seed.entries()) {
  // Fechas escalonadas para que la cola salga siempre en el mismo orden.
  const createdAt = new Date(Date.UTC(2026, 9, 1, 8, i)).toISOString()
  const stored = await runCase(c.id, { albaranes: c.albaranes, factura: c.factura }, { cacheOnly: true, createdAt })
  counts[stored.decision.outcome] = (counts[stored.decision.outcome] ?? 0) + 1
}

console.log(`${seed.length} casos en data/, sin hechos aprendidos:`, counts)
if (all.length !== seed.length) console.log(`${all.length - seed.length} casos de correcciones quitados del dataset`)
