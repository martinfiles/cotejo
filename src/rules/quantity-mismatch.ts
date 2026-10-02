import { config } from '../config'
import type { Rule } from '../types'
import { close, evidence, finding, num, round2, unitFactor } from './shared'

export const quantityMismatch: Rule = {
  id: 'quantity-mismatch',
  severity: 'medium',
  signal: 'discrepancy',
  description: 'La cantidad facturada no es la entregada.',
  check({ match, facts }) {
    return match.pairs.flatMap(({ albaran, factura }) => {
      const factor = unitFactor(albaran, factura, facts)
      const delivered = albaran.quantity.value
      const invoiced = factura.quantity.value
      // Sin poder convertir unidades o sin alguna de las dos lecturas no hay
      // nada que comparar: de eso avisan otras reglas.
      if (factor === null || delivered === null || invoiced === null) return []
      if (close(delivered * factor, invoiced, config.rules.quantityTolerance)) return []

      const price = factura.unitPrice.value
      const net = price === null ? null : price * (1 - (factura.discount ?? 0) / 100)
      return finding(quantityMismatch, {
        lineKey: factura.key,
        message: `${factura.description}: el albarán dice ${num(delivered)} ${albaran.unit ?? ''} y la factura ${num(invoiced)} ${factura.unit ?? ''}.`,
        impactEur: net === null ? null : round2((invoiced - delivered * factor) * net),
        evidence: [evidence('albaran', albaran, 'quantity'), evidence('factura', factura, 'quantity')],
      })
    })
  },
}
