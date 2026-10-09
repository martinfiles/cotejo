import { resolutionsFor } from './decide/options'
import { decide } from './decide/policy'
import { draftQuestion } from './decide/question'
import { extract, type Extraction } from './extract/extract'
import { inCase, link } from './link/link'
import { match } from './match/match'
import { currentTraceId, span, withTags } from './obs/langfuse'
import { runRules } from './rules'
import type { Decision, DocType, Fact, Finding, LinkResult, MatchResult } from './types'

// El flujo entero de un caso: extraer la factura y sus albaranes, comprobar
// que son los que la factura cita, cruzar líneas, pasar las reglas y decidir. Una traza de Langfuse por caso, un span
// por etapa.

export type CaseResult = {
  id: string
  // En el orden en que llegaron con el caso.
  albaranes: Extraction[]
  factura: Extraction
  // Los hechos del proveedor que se han aplicado a este caso.
  facts: Fact[]
  links: LinkResult
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

export function processCase(input: { id: string; albaranes: string[]; factura: string }, opts: Options): Promise<CaseResult> {
  return span('caso', async (trace) => {
    trace.update({ input })

    const read = (path: string, docType: DocType, name: string) =>
      withTags([docType], () =>
        span(`extraer ${name}`, async (s) => {
          const extraction = await extract(path, docType, { cacheOnly: opts.cacheOnly })
          const { doc, cached, model, costUsd, latencyMs } = extraction
          s.update({ input: path, output: doc, metadata: { docType, cached, model, costUsd, latencyMs } })
          return extraction
        }),
      )
    const [factura, ...albaranes] = await Promise.all([
      read(input.factura, 'factura', 'factura'),
      ...input.albaranes.map(async (path, i) => {
        const extraction = await read(path, 'albaran', `albaran ${i + 1}`)
        return { ...extraction, doc: inCase(extraction.doc, i) }
      }),
    ])

    const supplierTaxId = factura.doc.supplierTaxId ?? albaranes[0]?.doc.supplierTaxId
    const facts = opts.facts.filter((f) => !f.revokedAt && f.supplierTaxId === supplierTaxId)

    return withTags([`proveedor:${factura.doc.supplier}`], async () => {
      const docs = albaranes.map((a) => a.doc)
      const links = await span('vincular', async (s) => {
        const result = link(docs, factura.doc)
        s.update({ output: result })
        return result
      })

      const ctx = await span('cruzar', async (s) => {
        const result = match(docs, factura.doc, facts)
        s.update({
          metadata: { hechos: facts.length },
          output: { pares: result.pairs.length, soloAlbaran: result.onlyAlbaran.length, soloFactura: result.onlyFactura.length },
        })
        return { albaranes: docs, factura: factura.doc, links, match: result, facts }
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
            ? await draftQuestion(routing.reason, findings, ctx.match, { cacheOnly: opts.cacheOnly })
            : null
        const decision: Decision = { ...routing, options, question: question?.text ?? null }
        // Si el modelo se inventó una cifra, queda dicho en la traza.
        s.update({
          output: decision,
          metadata: question ? { preguntaDePlantilla: question.fromTemplate, cifrasInventadas: question.invented } : undefined,
        })
        return { decision, question }
      })

      trace.update({ output: { outcome: decision.outcome, reason: decision.reason, overchargeEur: decision.overchargeEur } })
      return {
        id: input.id,
        albaranes,
        factura,
        facts,
        links,
        match: ctx.match,
        findings,
        decision,
        costUsd: [...albaranes, factura].reduce((sum, e) => sum + e.costUsd, 0) + (question?.costUsd ?? 0),
        // Los documentos se leen a la vez: cuenta el más lento.
        latencyMs: Math.max(...[...albaranes, factura].map((e) => e.latencyMs)) + (question?.latencyMs ?? 0),
        traceId: currentTraceId(),
      }
    })
  })
}
