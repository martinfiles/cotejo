import type { Rule } from '../types'
import { evidence, finding, nameOf } from './shared'

export const missingLine: Rule = {
  id: 'missing-line',
  signal: 'discrepancy',
  description: 'Una línea está en un documento y no en el otro.',
  check({ albaranes, links, match }) {
    // Con líneas sueltas a los dos lados puede ser el mismo producto con otro
    // nombre: antes de reclamar nada, hay que saberlo.
    const maybeRenamed = match.onlyAlbaran.length > 0 && match.onlyFactura.length > 0
    const signal = maybeRenamed ? 'missing-knowledge' : missingLine.signal
    // Si falta un albarán que la factura cita, lo facturado sin pareja puede
    // estar en él. Y lo que trae un albarán que la factura no cita puede no
    // ser de esta factura. Mientras no se aclare, no es una discrepancia.
    const maybeElsewhere = links.missing.length > 0
    const several = albaranes.length > 1
    return [
      ...match.onlyFactura.map((line) =>
        finding(missingLine, {
          signal: maybeElsewhere ? 'missing-document' : signal,
          lineKey: line.key,
          message: `${line.description}: está en la factura y no en ${several ? 'ningún albarán' : 'el albarán'}.`,
          impactEur: line.total.value,
          evidence: evidence('factura', line, 'total'),
        }),
      ),
      ...match.onlyAlbaran.map((line) =>
        finding(missingLine, {
          signal: links.uncited.includes(line.source) ? 'missing-document' : signal,
          lineKey: line.key,
          message: `${line.description}: está en ${nameOf(albaranes[line.source]!, albaranes)} y no en la factura.`,
          // Entregado y sin cobrar: va a favor, por eso es negativo.
          impactEur: line.total.value === null ? null : -line.total.value,
          evidence: evidence('albaran', line, 'total'),
        }),
      ),
    ]
  },
}
