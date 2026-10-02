import { resolutionsFor } from './decide/options'
import { decide } from './decide/policy'
import { draftQuestion } from './decide/question'
import { extract, type Extraction } from './extract/extract'
import { match } from './match/match'
import { currentTraceId, span, withTags } from './obs/langfuse'
import { runRules } from './rules'
import type { Decision, DocType, Fact, Finding, MatchResult } from './types'

// El flujo entero de un caso: extraer los dos documentos, cruzar líneas,
// pasar las reglas y decidir. Una traza de Langfuse por caso, un span por
// etapa.

export type CaseResult = {
  id: string
  albaran: Extraction
  factura: Extraction
  // Los hechos del proveedor que se han aplicado a este caso.
  facts: Fact[]
  match: MatchResult
  findings: Finding[]
  decision: Decision
  // Extracciones más pregunta. Si vienen de caché, es lo que costaron y
  // tardaron cuando se llamó al modelo.
  costUsd: number
  latencyMs: number
  traceId: string | null
}

type Options = {
  // Todos los hechos conocidos; aquí se filtran los vigentes del proveedor.
  facts: Fact[]
  // Falla en vez de llamar al modelo si algo no está en caché.
  cacheOnly?: boolean
}

export function processCase(input: { id: string; albaran: string; factura: string }, opts: Options): Promise<CaseResult> {
  return span('caso', async (trace) => {
    trace.update({ input })

    const read = (docType: DocType) =>
      withTags([docType], () =>
        span(`extraer ${docType}`, async (s) => {
          const extraction = await extract(input[docType], docType, { cacheOnly: opts.cacheOnly })
          const { doc, cached, model, costUsd, latencyMs } = extraction
          s.update({ input: input[docType], output: doc, metadata: { docType, cached, model, costUsd, latencyMs } })
          return extraction
        }),
      )
    const [albaran, factura] = await Promise.all([read('albaran'), read('factura')])

    const supplierTaxId = factura.doc.supplierTaxId ?? albaran.doc.supplierTaxId
    const facts = opts.facts.filter((f) => !f.revokedAt && f.supplierTaxId === supplierTaxId)

    return withTags([`proveedor:${factura.doc.supplier}`], async () => {
      const ctx = await span('cruzar', async (s) => {
        const result = match(albaran.doc, factura.doc, facts)
        s.update({
          metadata: { hechos: facts.length },
          output: { pares: result.pairs.length, soloAlbaran: result.onlyAlbaran.length, soloFactura: result.onlyFactura.length },
        })
        return { albaran: albaran.doc, factura: factura.doc, match: result, facts }
      })

      const findings = await span('reglas', async (s) => {
        const result = runRules(ctx)
        s.update({ output: result.map(({ ruleId, signal, lineKey, impactEur, message }) => ({ ruleId, signal, lineKey, impactEur, message })) })
        return result
      })

      const { decision, question } = await span('decidir', async (s) => {
        const routing = decide(findings)
        const options = resolutionsFor(routing, findings, ctx)
        const question =
          routing.outcome === 'ask'
            ? await draftQuestion({ ...routing, options }, findings, factura.doc.supplier, { cacheOnly: opts.cacheOnly })
            : null
        const decision: Decision = { ...routing, options, question: question?.text ?? null }
        s.update({ output: decision })
        return { decision, question }
      })

      trace.update({ output: { outcome: decision.outcome, reason: decision.reason, overchargeEur: decision.overchargeEur } })
      return {
        id: input.id,
        albaran,
        factura,
        facts,
        match: ctx.match,
        findings,
        decision,
        costUsd: albaran.costUsd + factura.costUsd + (question?.costUsd ?? 0),
        latencyMs: Math.max(albaran.latencyMs, factura.latencyMs) + (question?.latencyMs ?? 0),
        traceId: currentTraceId(),
      }
    })
  })
}
