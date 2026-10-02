import { config } from '../config'
import type { Rule } from '../types'
import { close, eur, evidence, finding, round2, unitFactor } from './shared'

export const unitPriceMismatch: Rule = {
  id: 'unit-price-mismatch',
  signal: 'discrepancy',
  description: 'El precio unitario de la factura no es el del albarán.',
  check({ match, facts }) {
    return match.pairs.flatMap(({ albaran, factura }) => {
      const factor = unitFactor(albaran, factura, facts)
      const agreed = albaran.unitPrice.value
      const invoiced = factura.unitPrice.value
      // Un albarán sin valorar no trae precios: no hay con qué comparar.
      if (factor === null || agreed === null || invoiced === null) return []
      // El precio del albarán, llevado a la unidad de la factura.
      const agreedPerUnit = agreed / factor
      if (close(agreedPerUnit, invoiced, config.rules.priceToleranceEur)) return []

      const quantity = factura.quantity.value
      return finding(unitPriceMismatch, {
        lineKey: factura.key,
        message: `${factura.description}: el albarán dice ${eur(agreedPerUnit)} por ${factura.unit ?? 'unidad'} y la factura ${eur(invoiced)}.`,
        impactEur: quantity === null ? null : round2((invoiced - agreedPerUnit) * quantity * (1 - (factura.discount ?? 0) / 100)),
        evidence: [evidence('albaran', albaran, 'unitPrice'), evidence('factura', factura, 'unitPrice')],
      })
    })
  },
}
