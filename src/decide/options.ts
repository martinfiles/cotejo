import { eur, num } from '../rules/shared'
import type { Decision, Finding, Resolution, RuleContext } from '../types'

// Qué puede hacer el humano con un caso. Lo decide el código, no el modelo:
// el efecto de un botón tiene que ser el mismo se redacte como se redacte la
// pregunta.

const inFactura = (f: Finding) => f.evidence.some((e) => e.doc === 'factura')

export function resolutionsFor(
  routing: Pick<Decision, 'outcome' | 'reason' | 'overchargeEur'>,
  findings: Finding[],
  ctx: RuleContext,
): Resolution[] {
  if (routing.outcome === 'pass') return []

  const supplierTaxId = ctx.factura.supplierTaxId ?? ctx.albaran.supplierTaxId
  const options: Resolution[] = []

  if (routing.reason === 'missing_knowledge' && supplierTaxId) {
    for (const f of findings.filter((f) => f.ruleId === 'unit-incompatible')) {
      const pair = ctx.match.pairs.find((p) => p.factura.key === f.lineKey)
      if (!pair?.albaran.unit || !pair.factura.unit) continue
      const { albaran, factura } = pair
      options.push({
        kind: 'learn',
        label: `Enseñar cuántos ${factura.unit} tiene 1 ${albaran.unit}`,
        factorPrompt: `¿Cuántos ${factura.unit} tiene 1 ${albaran.unit} de ${factura.description}?`,
        // El factor lo pone el humano al resolver; aquí va lo demás.
        fact: {
          supplierTaxId, kind: 'unit-equivalence',
          product: factura.code ?? factura.description, from: albaran.unit!, to: factura.unit!, factor: 0,
        },
      })
    }
    // Solo se propone un alias cuando no hay duda de qué línea sería cuál.
    const [a, ...moreA] = ctx.match.onlyAlbaran
    const [f, ...moreF] = ctx.match.onlyFactura
    if (a && f && moreA.length === 0 && moreF.length === 0) {
      options.push({
        kind: 'learn',
        label: `Sí, "${a.description}" es "${f.description}"`,
        fact: { supplierTaxId, kind: 'product-alias', albaran: a.description, factura: f.description },
      })
    }
  }

  // Si el albarán y la factura dan cantidades distintas y el documento es
  // ambiguo, la pregunta de fondo es qué se recibió de verdad.
  const quantity = findings.find((f) => f.ruleId === 'quantity-mismatch')
  const [delivered, invoiced] = quantity?.evidence ?? []
  const askWhatArrived =
    routing.reason === 'document_ambiguous' && delivered?.value != null && invoiced?.value != null

  if (routing.overchargeEur > 0) {
    options.push({
      kind: 'claim',
      label: askWhatArrived
        ? `Recibí ${num(delivered!.value!)}: reclamar ${eur(routing.overchargeEur)}`
        : `Reclamar ${eur(routing.overchargeEur)} al proveedor`,
    })
  }
  options.push({
    kind: 'accept',
    label: askWhatArrived ? `Recibí ${num(invoiced!.value!)}: la factura está bien` : 'Dar la factura por buena',
  })

  // Una factura que no cuadra, que no se lee o que se deja algo sin cobrar
  // está mal emitida: se pide de nuevo, no se acepta el número sin más.
  const badInvoice =
    routing.reason === 'undercharge' ||
    findings.some((f) => (f.signal === 'inconsistency' || f.signal === 'read-doubt') && inFactura(f))
  if (badInvoice) options.push({ kind: 'rectify', label: 'Pedir factura rectificativa' })

  return options
}
