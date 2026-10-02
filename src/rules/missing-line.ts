import type { Rule } from '../types'
import { evidence, finding } from './shared'

export const missingLine: Rule = {
  id: 'missing-line',
  severity: 'high',
  signal: 'discrepancy',
  description: 'Una línea está en un documento y no en el otro.',
  check({ match }) {
    return [
      ...match.onlyFactura.map((line) =>
        finding(missingLine, {
          lineKey: line.key,
          message: `${line.description}: está en la factura y no en el albarán.`,
          impactEur: line.total.value,
          evidence: [evidence('factura', line, 'total')],
        }),
      ),
      ...match.onlyAlbaran.map((line) =>
        finding(missingLine, {
          lineKey: line.key,
          message: `${line.description}: está en el albarán y no en la factura.`,
          // Entregado y sin cobrar: va a favor, por eso es negativo.
          impactEur: line.total.value === null ? null : -line.total.value,
          evidence: [evidence('albaran', line, 'total')],
        }),
      ),
    ]
  },
}
