import { readFile, writeFile } from 'node:fs/promises'
import { score } from './obs/langfuse'
import { processCase, type CaseResult } from './pipeline'
import { addFact, getCase, listCases, listFacts, revokeFact, saveCase, type StoredCase } from './store'
import { normalize } from './text'
import type { DatasetCase, Expected, Line, Outcome, Resolution } from './types'

// El ciclo de vida de un caso: se procesa, queda abierto si no pasa solo, y
// un humano lo resuelve. Aquí se cierra el bucle del proyecto: una respuesta
// que enseña algo del proveedor se guarda como hecho y vuelve a decidir los
// casos abiertos de ese proveedor. Toda respuesta deja un score en Langfuse y
// un caso de corrección en el dataset de evals.

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
    await addToDataset(before, option, await getCase(id))
  } else {
    const amountEur = option.kind === 'claim' ? before.decision.overchargeEur : null
    await saveCase({ ...before, resolution: { ...option, at: new Date().toISOString(), amountEur } })
    await addToDataset(before, option, null)
  }

  if (before.traceId) await score(before.traceId, 'resolucion_humana', option.kind, option.label)
}

// Deshacer un hecho mal aprendido: deja de aplicarse y se vuelven a decidir
// los casos que se habían apoyado en él, también los que pasaron solos.
export async function revoke(factId: string) {
  const fact = await revokeFact(factId)
  if (fact) await rerun((c) => c.facts.some((f) => f.id === factId))
}

// Qué debería haber decidido el sistema según lo que respondió el humano. Es
// una etiqueta más ruidosa que un hecho, pero es una etiqueta. Pedir otra
// factura también es intervenir: cuenta como escalar.
const LABEL: Record<Exclude<Resolution['kind'], 'learn'>, Outcome> = { accept: 'pass', claim: 'escalate', rectify: 'escalate' }

// Toda respuesta entra en el dataset como corrección, con el efecto que tuvo.
// Si enseñó un hecho, lleva sus dos esperados: lo que el sistema decidía antes
// de saberlo y lo que decide después, que el humano ha dado por bueno. Si no,
// lleva la decisión que el humano dio por buena. El eval las reporta aparte
// de las del seed.
async function addToDataset(before: StoredCase, option: Resolution, after: CaseResult | null) {
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
  const final = after ?? before
  const ids = productOf(final)
  const truth = (lines: Line[]) =>
    lines.map((l) => ({ productId: ids.get(l.key)!, code: l.code, description: l.description, quantity: l.quantity.value ?? 0 }))
  const labelled: Expected | null =
    option.kind === 'learn' ? null : { ...expected(before, ids), decision: LABEL[option.kind], reason: null }

  const entry: DatasetCase = {
    id: `correccion-${before.id}`,
    ...before.files,
    lines: { albaran: truth(final.albaran.doc.lines), factura: truth(final.factura.doc.lines) },
    requires: final.facts.map(({ id, learnedAt, fromCase, revokedAt, ...knowledge }) => knowledge),
    expected: labelled
      ? { withoutKnowledge: labelled, withKnowledge: labelled }
      : { withoutKnowledge: expected(before, ids), withKnowledge: expected(final, ids) },
    holdout: false,
    boundary: false,
    source: 'correction',
    correction: { effect: option.kind, label: option.label, fromCase: before.id, at: new Date().toISOString() },
    note: `Respuesta a mano al caso ${before.id}: "${option.label}".`,
  }
  // Un caso que se vuelve a resolver sustituye a su corrección anterior.
  const others = (await readFile(DATASET, 'utf8')).trim().split('\n').filter((l) => JSON.parse(l).id !== entry.id)
  await writeFile(DATASET, [...others, JSON.stringify(entry)].join('\n') + '\n')
}
