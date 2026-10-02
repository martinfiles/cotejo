import { appendFile, readFile } from 'node:fs/promises'
import { score } from './obs/langfuse'
import { processCase, type CaseResult } from './pipeline'
import { addFact, getCase, listCases, listFacts, revokeFact, saveCase, type StoredCase } from './store'
import { normalize } from './text'
import type { DatasetCase, Expected, Line } from './types'

// El ciclo de vida de un caso: se procesa, queda abierto si no pasa solo, y
// un humano lo resuelve. Aquí se cierra el bucle del proyecto: una respuesta
// que enseña algo del proveedor se guarda como hecho, vuelve a decidir los
// casos abiertos de ese proveedor, deja un score en Langfuse y un caso nuevo
// en el dataset de evals.

const DATASET = 'evals/dataset.jsonl'

type Files = { albaran: string; factura: string }

export async function runCase(id: string, files: Files, opts: { cacheOnly?: boolean; createdAt?: string } = {}) {
  const result = await processCase({ id, ...files }, { facts: await listFacts(), cacheOnly: opts.cacheOnly })
  const stored: StoredCase = { ...result, files, createdAt: opts.createdAt ?? new Date().toISOString(), resolution: null }
  await saveCase(stored)
  return stored
}

// Vuelve a decidir, con lo que se sabe ahora, los casos que cumplan la
// condición. Lo que un humano ya cerró no se toca.
async function rerun(affected: (c: StoredCase) => boolean) {
  for (const c of await listCases()) {
    if (!c.resolution && affected(c)) await runCase(c.id, c.files, { createdAt: c.createdAt })
  }
}

export async function resolveCase(id: string, optionIndex: number, factor?: number) {
  const before = await getCase(id)
  const option = before?.decision.options[optionIndex]
  if (!before || !option) throw new Error(`No existe esa opción en el caso ${id}`)

  if (option.kind === 'learn' && option.fact) {
    let knowledge = option.fact
    if (knowledge.kind === 'unit-equivalence') {
      if (!(factor && factor > 0)) throw new Error('Falta el factor de la equivalencia')
      knowledge = { ...knowledge, factor }
    }
    const fact = await addFact(knowledge, id)
    // Un hecho nuevo puede desbloquear los casos de ese proveedor que no pasaron solos.
    await rerun((c) => c.decision.outcome !== 'pass' && c.factura.doc.supplierTaxId === fact.supplierTaxId)
    const after = await getCase(id)
    if (after) await addToDataset(before, after)
  } else {
    const amountEur = option.kind === 'claim' ? before.decision.overchargeEur : null
    await saveCase({ ...before, resolution: { ...option, at: new Date().toISOString(), amountEur } })
  }

  if (before.traceId) await score(before.traceId, 'resolucion_humana', option.kind, option.label)
}

// Deshacer un hecho mal aprendido: deja de aplicarse y se vuelven a decidir
// los casos que se habían apoyado en él, también los que pasaron solos.
export async function revoke(factId: string) {
  const fact = await revokeFact(factId)
  if (fact) await rerun((c) => c.facts.some((f) => f.id === factId))
}

// El caso que enseñó algo entra en el dataset con sus dos esperados: lo que
// el sistema decidía antes de saberlo y lo que decide después, que es lo que
// el humano ha dado por bueno.
async function addToDataset(before: CaseResult & { files: Files }, after: CaseResult) {
  const existing = (await readFile(DATASET, 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as DatasetCase)
  if (existing.some((c) => c.albaran === before.files.albaran && c.factura === before.files.factura)) return

  // Sin catálogo, el producto de una línea es su código o su descripción. Las
  // dos líneas de un par comparten el de la factura.
  const own = (line: Line) => line.code ?? normalize(line.description)
  const productOf = (result: CaseResult) => {
    const ids = new Map<string, string>()
    for (const doc of [result.albaran.doc, result.factura.doc]) for (const line of doc.lines) ids.set(line.key, own(line))
    for (const pair of result.match.pairs) ids.set(pair.albaran.key, own(pair.factura))
    return ids
  }
  const expected = (result: CaseResult, ids: Map<string, string>): Expected => ({
    findings: result.findings.map((f) => ({ ruleId: f.ruleId, productId: f.lineKey ? (ids.get(f.lineKey) ?? null) : null })),
    decision: result.decision.outcome,
    reason: result.decision.reason,
  })
  const ids = productOf(after)
  const truth = (lines: Line[]) =>
    lines.map((l) => ({ productId: ids.get(l.key)!, code: l.code, description: l.description, quantity: l.quantity.value ?? 0 }))

  const entry: DatasetCase = {
    id: `correccion-${before.id}`,
    ...before.files,
    lines: { albaran: truth(after.albaran.doc.lines), factura: truth(after.factura.doc.lines) },
    requires: after.facts.map(({ id, learnedAt, fromCase, revokedAt, ...knowledge }) => knowledge),
    expected: { withoutKnowledge: expected(before, ids), withKnowledge: expected(after, ids) },
    holdout: false,
    boundary: false,
    source: 'correction',
    note: `Añadido al resolver a mano el caso ${before.id}.`,
  }
  await appendFile(DATASET, JSON.stringify(entry) + '\n')
}
