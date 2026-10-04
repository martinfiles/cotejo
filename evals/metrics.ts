import type { CaseResult } from '../src/pipeline'
import { normalize, sameCode } from '../src/text'
import type { DatasetCase, Expected, ExtractedDoc, Fact, Knowledge, Outcome, TruthLine } from '../src/types'

// Cálculo de métricas, sin ficheros ni modelo. run.ts ejecuta y este fichero cuenta.

// --- Resolver líneas extraídas a productos ---------------------------------
// Propio de los evals y deliberadamente generoso: por código, y si no hay, por
// descripción normalizada más cantidad. No usa el matcher de producción
// porque el matcher es lo que se está midiendo.
export function resolveLines(doc: ExtractedDoc, truth: TruthLine[]) {
  const free = [...truth]
  const byKey = new Map<string, string>()
  for (const line of doc.lines) {
    const i = free.findIndex((t) =>
      t.code && line.code
        ? sameCode(t.code, line.code)
        : normalize(t.description) === normalize(line.description) && t.quantity === line.quantity.value,
    )
    if (i === -1) continue
    byKey.set(line.key, free[i]!.productId)
    free.splice(i, 1)
  }
  return { byKey, unresolved: free }
}

// ¿Están vigentes todos los hechos que el caso necesita? El factor no se
// compara: un factor mal enseñado debe verse como fallo del caso.
const sameKnowledge = (k: Knowledge, f: Fact) =>
  k.supplierTaxId === f.supplierTaxId &&
  (k.kind === 'unit-equivalence'
    ? f.kind === 'unit-equivalence' && sameCode(k.product, f.product) && normalize(k.from) === normalize(f.from) && normalize(k.to) === normalize(f.to)
    : f.kind === 'product-alias' && normalize(k.albaran) === normalize(f.albaran) && normalize(k.factura) === normalize(f.factura))

export const knows = (requires: Knowledge[], facts: Fact[]) => requires.every((k) => facts.some((f) => sameKnowledge(k, f)))

// --- Un caso evaluado ---------------------------------------------------------

export type CaseRecord = {
  caseId: string
  state: string
  group: 'headline' | 'boundary' | 'correction'
  holdout: boolean
  correction: DatasetCase['correction'] | null
  expected: Expected
  got: { outcome: Outcome; reason: string; findings: string[] }
  expectedFindings: string[]
  unresolvedLines: string[]
  docs: { docType: string; model: string; costUsd: number; latencyMs: number; cached: boolean }[]
  questionCostUsd: number
  costUsd: number
  latencyMs: number
}

const key = (ruleId: string, productId: string | null) => `${ruleId}:${productId ?? '-'}`

export function record(c: DatasetCase, state: string, facts: Fact[], r: CaseResult): CaseRecord {
  const expected = knows(c.requires, facts) ? c.expected.withKnowledge : c.expected.withoutKnowledge
  const a = resolveLines(r.albaran.doc, c.lines.albaran)
  const f = resolveLines(r.factura.doc, c.lines.factura)
  const product = new Map([...a.byKey, ...f.byKey])
  const extraction = r.albaran.costUsd + r.factura.costUsd
  return {
    caseId: c.id,
    state,
    group: c.source === 'correction' ? 'correction' : c.boundary ? 'boundary' : 'headline',
    holdout: c.holdout,
    correction: c.correction ?? null,
    expected,
    got: {
      outcome: r.decision.outcome,
      reason: r.decision.reason,
      // Una línea que el resolvedor no supo asignar aparece con su clave entre interrogaciones.
      findings: [...new Set(r.findings.map((x) => key(x.ruleId, x.lineKey ? (product.get(x.lineKey) ?? `?${x.lineKey}?`) : null)))].sort(),
    },
    expectedFindings: [...new Set(expected.findings.map((x) => key(x.ruleId, x.productId)))].sort(),
    unresolvedLines: [...a.unresolved.map((t) => `albarán ${t.productId}`), ...f.unresolved.map((t) => `factura ${t.productId}`)],
    docs: [r.albaran, r.factura].map((e) => ({ docType: e.doc.docType, model: e.model, costUsd: e.costUsd, latencyMs: e.latencyMs, cached: e.cached })),
    questionCostUsd: Math.max(r.costUsd - extraction, 0),
    costUsd: r.costUsd,
    latencyMs: r.latencyMs,
  }
}

// --- Agregados ---------------------------------------------------------------

const share = (n: number, of: number) => ({ n, of, pct: of ? Math.round((1000 * n) / of) / 10 : null })

export function routing(records: CaseRecord[]) {
  const of = records.length
  const count = (o: Outcome) => records.filter((r) => r.got.outcome === o).length
  const withReason = records.filter((r) => r.expected.reason !== null)
  return {
    cases: of,
    // La métrica de cabecera: cuántos casos se resuelven sin molestar a nadie.
    autonomous: share(count('pass'), of),
    ask: share(count('ask'), of),
    escalate: share(count('escalate'), of),
    decisionCorrect: share(records.filter((r) => r.got.outcome === r.expected.decision).length, of),
    reasonCorrect: share(withReason.filter((r) => r.got.reason === r.expected.reason).length, withReason.length),
  }
}

export function perRule(records: CaseRecord[]) {
  const rules = new Map<string, { expected: number; tp: number; fp: number; fn: number }>()
  const at = (rule: string) => rules.get(rule) ?? rules.set(rule, { expected: 0, tp: 0, fp: 0, fn: 0 }).get(rule)!
  for (const r of records) {
    const got = new Set(r.got.findings)
    const want = new Set(r.expectedFindings)
    for (const k of want) {
      const s = at(k.split(':')[0]!)
      s.expected++
      got.has(k) ? s.tp++ : s.fn++
    }
    for (const k of got) if (!want.has(k)) at(k.split(':')[0]!).fp++
  }
  return [...rules.entries()]
    .map(([rule, s]) => ({
      rule,
      ...s,
      precision: s.tp + s.fp ? Math.round((1000 * s.tp) / (s.tp + s.fp)) / 10 : null,
      recall: s.expected ? Math.round((1000 * s.tp) / s.expected) / 10 : null,
    }))
    .sort((x, y) => x.rule.localeCompare(y.rule))
}

const p95 = (values: number[]) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)]!
}
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)

// Coste y latencia de lo que costó llamar al modelo, venga hoy de caché o no.
export function costs(records: CaseRecord[]) {
  const docs = records.flatMap((r) => r.docs)
  const byType = ['albaran', 'factura'].map((docType) => {
    const d = docs.filter((x) => x.docType === docType)
    return {
      docType,
      documents: d.length,
      models: [...new Set(d.map((x) => x.model))],
      meanCostUsd: mean(d.map((x) => x.costUsd)),
      meanLatencyMs: mean(d.map((x) => x.latencyMs)),
      p95LatencyMs: p95(d.map((x) => x.latencyMs)),
    }
  })
  return {
    byType,
    perDocumentUsd: mean(docs.map((x) => x.costUsd)),
    perCaseUsd: mean(records.map((r) => r.costUsd)),
    questionsUsd: records.reduce((s, r) => s + r.questionCostUsd, 0),
    totalUsd: records.reduce((s, r) => s + r.costUsd, 0),
    p95DocumentLatencyMs: p95(docs.map((x) => x.latencyMs)),
    p95CaseLatencyMs: p95(records.map((r) => r.latencyMs)),
    fromCache: share(docs.filter((x) => x.cached).length, docs.length),
  }
}
