import type { Report } from './run'

// El informe en Markdown. Los números salen todos del eval que se acaba de
// correr; aquí solo se ordenan y se explican.

const pct = (s: { n: number; of: number; pct: number | null }) => (s.of ? `${s.pct} % (${s.n} de ${s.of})` : '—')
const usd = (n: number | null) => (n === null ? '—' : `${n.toFixed(4)} USD`)
const ms = (n: number | null) => (n === null ? '—' : `${(n / 1000).toFixed(1)} s`)
const fmt = (n: number | null) => (n === null ? '—' : `${n} %`)

export function renderReport(r: Report) {
  const [without, withFacts] = r.states as [Report['states'][number], Report['states'][number]]
  const sameState = withFacts.facts === 0

  const routingRow = (label: string, s: Report['states'][number]['headline']) =>
    `| ${label} | ${pct(s.autonomous)} | ${pct(s.ask)} | ${pct(s.escalate)} | ${pct(s.decisionCorrect)} | ${pct(s.reasonCorrect)} |`

  const rules = (s: Report['states'][number]) =>
    s.rules.map((x) => `| ${x.rule} | ${x.expected} | ${x.tp} | ${x.fp} | ${x.fn} | ${fmt(x.precision)} | ${fmt(x.recall)} |`).join('\n')

  const byAlbaranes = (s: Report['states'][number]) =>
    s.byAlbaranes
      .map((x) => `| ${x.label} | ${x.cases} | ${pct(x.autonomous)} | ${pct(x.ask)} | ${pct(x.escalate)} | ${pct(x.decisionCorrect)} | ${pct(x.reasonCorrect)} |`)
      .join('\n')

  const failures = (s: Report['states'][number]) =>
    s.failures.length
      ? s.failures.map((f) => `- \`${f.caseId}\`: esperaba ${f.expected}, salió ${f.got}`).join('\n')
      : 'Ninguno.'

  const caseRows = (records: Report['records']) =>
    records
      .map((x) => `| ${x.caseId} | ${x.state} | ${x.correction?.effect ?? ''} | ${x.expected.decision} ${x.expected.reason ?? ''} | ${x.got.outcome} ${x.got.reason} | ${x.got.outcome === x.expected.decision ? 'sí' : 'no'} |`)
      .join('\n')

  return `# Informe del eval

Ejecutado el ${r.runAt}${r.cacheOnly ? ', solo desde caché' : ', llamando al modelo para lo que faltaba en caché'}.

Dataset: ${r.dataset.seed} casos del seed (${r.dataset.holdout} holdout y ${r.dataset.boundary} en la frontera del umbral) y ${r.dataset.corrections} de correcciones a mano. Hechos aprendidos vigentes: ${withFacts.facts}.

**Esto son señales, no estadística.** Son casos sintéticos y pocos, y el esperado lo escribió el mismo generador que los documentos: un acierto alto dice que el sistema coincide con mis supuestos, no con la realidad. Cada regla se mide sobre el número de casos que aparece en su tabla.

## Cabecera: casos resueltos solos

Lo que mejora al aprender es la autonomía, no la corrección. El acierto de decisión tiene que ser alto en los dos estados: sin un hecho, preguntar es la respuesta correcta.

| Estado | Resueltos solos (pass) | Preguntados (ask) | Escalados | Acierto de decisión | Acierto de motivo |
|---|---|---|---|---|---|
${routingRow(without.label, without.headline)}
${routingRow(withFacts.label, withFacts.headline)}

Techo de autonomía en este dataset: ${pct(r.ceiling)} de los casos pasarían solos si se supiera todo lo que necesitan.
${sameState ? '\nNo hay hechos aprendidos: los dos estados coinciden.\n' : ''}
Excluye los casos de frontera y las correcciones, que van aparte.

## Holdout: casos que nadie ha corregido a mano

Comparten proveedor y problema con los casos que se resuelven en la demo. La mejora aquí es el único número que demuestra que lo aprendido generaliza.

| Estado | Resueltos solos | Escalados | Acierto de decisión |
|---|---|---|---|
| ${without.label} | ${pct(without.holdout.autonomous)} | ${pct(without.holdout.escalate)} | ${pct(without.holdout.decisionCorrect)} |
| ${withFacts.label} | ${pct(withFacts.holdout.autonomous)} | ${pct(withFacts.holdout.escalate)} | ${pct(withFacts.holdout.decisionCorrect)} |

Un holdout que pasa a escalado no es un fallo: es una discrepancia real que solo se veía sabiendo el hecho.

## Por número de albaranes

Los casos de la cabecera según cuántos albaranes llegan con la factura. Con dos o más hay que comprobar que son los que la factura cita y sumar las entregas antes de comparar.

### ${without.label}

| Albaranes | Casos | Resueltos solos | Preguntados | Escalados | Acierto de decisión | Acierto de motivo |
|---|---|---|---|---|---|---|
${byAlbaranes(without)}
${sameState ? '' : `
### ${withFacts.label}

| Albaranes | Casos | Resueltos solos | Preguntados | Escalados | Acierto de decisión | Acierto de motivo |
|---|---|---|---|---|---|---|
${byAlbaranes(withFacts)}
`}
## Precisión y recall por regla

Un finding cuenta como acierto si coinciden la regla y el producto. "Esperados" es el número de veces que la regla debía saltar: con tan pocos, un solo fallo mueve mucho el porcentaje.

### ${without.label}

| Regla | Esperados | Aciertos | Falsos positivos | No detectados | Precisión | Recall |
|---|---|---|---|---|---|---|
${rules(without)}
${sameState ? '' : `
### ${withFacts.label}

| Regla | Esperados | Aciertos | Falsos positivos | No detectados | Precisión | Recall |
|---|---|---|---|---|---|---|
${rules(withFacts)}
`}
## Alineamiento de líneas

Líneas esperadas que el resolvedor del eval no pudo asignar a ninguna línea extraída: ${without.unresolvedLines.length}${without.unresolvedLines.length ? `\n\n${without.unresolvedLines.map((l) => `- ${l}`).join('\n')}` : '.'}

## Casos que fallan

### ${without.label}

${failures(without)}
${sameState ? '' : `
### ${withFacts.label}

${failures(withFacts)}
`}
## Frontera del umbral

Fuera de la cabecera. Muestran qué pasa justo alrededor del umbral de escalado.

| Caso | Estado | | Esperado | Obtenido | Coincide |
|---|---|---|---|---|---|
${caseRows(r.boundary)}

## Correcciones a mano

Fuera de la cabecera: son etiquetas puestas por una persona al responder, más ruidosas que las del seed. Solo las que enseñan un hecho cambian el comportamiento del pipeline.

${r.corrections.length ? `| Caso | Estado | Respuesta | Esperado | Obtenido | Coincide |\n|---|---|---|---|---|---|\n${caseRows(r.corrections)}` : 'Todavía no hay ninguna.'}

## Coste y latencia

Lo que costó y tardó cada llamada al modelo cuando se hizo, aunque hoy venga de caché (${pct(r.cost.fromCache)} de los documentos en esta ejecución).

| Documento | Documentos | Modelo | Coste medio | Latencia media | Latencia p95 |
|---|---|---|---|---|---|
${r.cost.byType.map((t) => `| ${t.docType} | ${t.documents} | ${t.models.join(', ')} | ${usd(t.meanCostUsd)} | ${ms(t.meanLatencyMs)} | ${ms(t.p95LatencyMs)} |`).join('\n')}

- Coste medio por documento: ${usd(r.cost.perDocumentUsd)}
- Coste medio por caso, con la pregunta: ${usd(r.cost.perCaseUsd)}
- Coste de redactar las preguntas, en total: ${usd(r.cost.questionsUsd)}
- Coste total del dataset: ${usd(r.cost.totalUsd)}
- Latencia p95 por documento: ${ms(r.cost.p95DocumentLatencyMs)}; por caso: ${ms(r.cost.p95CaseLatencyMs)}
`
}
