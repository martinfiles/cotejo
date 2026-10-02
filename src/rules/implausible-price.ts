import { config } from '../config'
import type { Rule } from '../types'
import { eur, evidence, finding, unitFactor } from './shared'

// Un proveedor sube un precio un 10 %, no lo multiplica por diez. Cuando el
// precio de la factura está a otra escala que el del albarán, lo más probable
// es una coma mal leída ("1.250" por 1,25), no una subida.
export const implausiblePrice: Rule = {
  id: 'implausible-price',
  severity: 'medium',
  signal: 'read-doubt',
  description: 'El precio de una línea está a otra escala que en el otro documento.',
  check({ match, facts }) {
    return match.pairs.flatMap(({ albaran, factura }) => {
      const factor = unitFactor(albaran, factura, facts)
      const a = albaran.unitPrice.value
      const f = factura.unitPrice.value
      if (factor === null || a === null || f === null) return []
      const aPerUnit = a / factor
      const plausible =
        aPerUnit > 0 && f > 0 && Math.max(aPerUnit, f) / Math.min(aPerUnit, f) <= config.rules.maxPriceRatio
      if (plausible) return []

      return finding(implausiblePrice, {
        lineKey: factura.key,
        message: `${factura.description}: ${eur(aPerUnit)} en el albarán y ${eur(f)} en la factura no parecen el mismo precio leído dos veces.`,
        impactEur: null,
        evidence: [evidence('albaran', albaran, 'unitPrice'), evidence('factura', factura, 'unitPrice')],
      })
    })
  },
}
