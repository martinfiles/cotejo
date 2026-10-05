import type { Rule } from '../types'
import { evidence, finding, unitFactor } from './shared'

export const unitIncompatible: Rule = {
  id: 'unit-incompatible',
  signal: 'missing-knowledge',
  description: 'Albarán y factura usan unidades distintas y no se sabe convertir una en otra.',
  check({ match, facts }) {
    return match.pairs.flatMap(({ albaran, factura }) => {
      if (unitFactor(albaran, factura, facts) !== null) return []
      return finding(unitIncompatible, {
        lineKey: factura.key,
        message: `${factura.description}: el albarán va en ${albaran.unit} y la factura en ${factura.unit}, y no se sabe cuántos ${factura.unit} tiene 1 ${albaran.unit} de este proveedor.`,
        impactEur: null,
        evidence: [evidence('albaran', albaran, 'quantity'), evidence('factura', factura, 'quantity')],
      })
    })
  },
}
