import { config } from '../config'
import type { Rule } from '../types'
import { close, eur, finding, round2 } from './shared'

export const vatInconsistent: Rule = {
  id: 'vat-inconsistent',
  severity: 'medium',
  signal: 'inconsistency',
  description: 'La cuota de IVA de la factura no sale de los tipos de sus líneas.',
  check({ factura }) {
    const { vat, bbox } = factura.totals
    if (vat.value === null) return []

    let expected = 0
    for (const line of factura.lines) {
      // Con una línea sin tipo o sin importe no se puede recalcular la cuota.
      if (line.vatRate === null || line.total.value === null) return []
      expected += (line.total.value * line.vatRate) / 100
    }
    if (close(expected, vat.value, config.rules.amountToleranceEur)) return []

    return [finding(vatInconsistent, {
      lineKey: null,
      message: `Por los tipos de las líneas la cuota de IVA sería ${eur(expected)} y la factura dice ${eur(vat.value)}.`,
      impactEur: round2(vat.value - expected),
      evidence: [{ doc: 'factura', field: 'vat', value: vat.value, confidence: vat.confidence, bbox }],
    })]
  },
}
