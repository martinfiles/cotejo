import { config } from '../config'
import type { Rule } from '../types'
import { close, evidence, finding, num, round2, unitFactor } from './shared'

export const quantityMismatch: Rule = {
  id: 'quantity-mismatch',
  signal: 'discrepancy',
  description: 'La cantidad facturada no es la entregada.',
  check({ albaranes, match, facts }) {
    return match.pairs.flatMap(({ albaran, factura }) => {
      const factor = unitFactor(albaran, factura, facts)
      const delivered = albaran.quantity.value
      const invoiced = factura.quantity.value
      // Sin poder convertir unidades o sin alguna de las dos lecturas no hay
      // nada que comparar: de eso avisan otras reglas.
      if (factor === null || delivered === null || invoiced === null) return []
      if (close(delivered * factor, invoiced, config.rules.quantityTolerance)) return []

      // Si se ha convertido de unidad, se dice a cuánto equivale.
      const converted = factor === 1 ? '' : ` (${num(delivered * factor)} ${factura.unit})`
      // Si lo entregado llegó en varias líneas, se dice cuánto en cada albarán.
      const split = albaran.parts
        ?.map((p) => `${num(p.quantity.value ?? 0)} en ${albaranes[p.source]?.number}`)
        .join(' y ')
      const said = split ? `los albaranes suman ${num(delivered)} ${albaran.unit ?? ''} (${split})` : `el albarán dice ${num(delivered)} ${albaran.unit ?? ''}`
      const price = factura.unitPrice.value
      const net = price === null ? null : price * (1 - (factura.discount ?? 0) / 100)
      return finding(quantityMismatch, {
        lineKey: factura.key,
        message: `${factura.description}: ${said}${converted} y la factura ${num(invoiced)} ${factura.unit ?? ''}.`,
        impactEur: net === null ? null : round2((invoiced - delivered * factor) * net),
        evidence: [...evidence('albaran', albaran, 'quantity'), ...evidence('factura', factura, 'quantity')],
      })
    })
  },
}
