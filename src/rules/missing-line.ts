import type { Rule } from '../types'
import { evidence, finding } from './shared'

export const missingLine: Rule = {
  id: 'missing-line',
  signal: 'discrepancy',
  description: 'Una línea está en un documento y no en el otro.',
  check({ match }) {
    // Con líneas sueltas a los dos lados puede ser el mismo producto con otro
    // nombre: antes de reclamar nada, hay que saberlo.
    const maybeRenamed = match.onlyAlbaran.length > 0 && match.onlyFactura.length > 0
    const signal = maybeRenamed ? 'missing-knowledge' : missingLine.signal
    return [
      ...match.onlyFactura.map((line) =>
        finding(missingLine, {
          signal,
          lineKey: line.key,
          message: `${line.description}: está en la factura y no en el albarán.`,
          impactEur: line.total.value,
          evidence: [evidence('factura', line, 'total')],
        }),
      ),
      ...match.onlyAlbaran.map((line) =>
        finding(missingLine, {
          signal,
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
