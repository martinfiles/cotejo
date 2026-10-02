import { config } from '../config'
import type { Evidence, Finding, Rule } from '../types'
import { close, eur, finding, round2 } from './shared'

export const totalMismatch: Rule = {
  id: 'total-mismatch',
  severity: 'medium',
  signal: 'inconsistency',
  description: 'Los totales de la factura no salen de sus propias líneas.',
  check({ factura }) {
    const { base, vat, total, bbox } = factura.totals
    const at = (field: string, amount: { value: number | null; confidence: number }): Evidence => ({
      doc: 'factura', field, value: amount.value, confidence: amount.confidence, bbox,
    })
    const findings: Finding[] = []

    const lineTotals = factura.lines.map((line) => line.total.value)
    if (base.value !== null && lineTotals.every((t) => t !== null)) {
      const sum = lineTotals.reduce<number>((acc, t) => acc + (t ?? 0), 0)
      if (!close(sum, base.value, config.rules.amountToleranceEur)) {
        findings.push(finding(totalMismatch, {
          lineKey: null,
          message: `Las líneas de la factura suman ${eur(sum)} y la base imponible dice ${eur(base.value)}.`,
          impactEur: round2(base.value - sum),
          evidence: [at('base', base)],
        }))
      }
    }

    if (base.value !== null && vat.value !== null && total.value !== null) {
      const sum = base.value + vat.value
      if (!close(sum, total.value, config.rules.amountToleranceEur)) {
        findings.push(finding(totalMismatch, {
          lineKey: null,
          message: `Base más IVA son ${eur(sum)} y el total de la factura dice ${eur(total.value)}.`,
          impactEur: round2(total.value - sum),
          evidence: [at('total', total)],
        }))
      }
    }

    return findings
  },
}
