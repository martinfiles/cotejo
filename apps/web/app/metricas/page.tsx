import { readFile } from 'node:fs/promises'
import type { Report } from '../../../../evals/run'

export const dynamic = 'force-dynamic'

// Lee el último informe que dejó el eval. Aquí no se recalcula nada: para
// actualizar estas cifras hay que correr `npm run eval`.

type Share = { n: number; of: number; pct: number | null }
const pct = (s: Share) => (s.of ? `${s.pct} %` : '—')
const of = (s: Share) => (s.of ? `${s.n} de ${s.of}` : '')
const usd = (n: number | null) => (n === null ? '—' : `${n.toFixed(4)} USD`)
const sec = (n: number | null) => (n === null ? '—' : `${(n / 1000).toFixed(1)} s`)

async function load(name: string): Promise<Report | null> {
  try {
    return JSON.parse(await readFile(`evals/results/${name}.json`, 'utf8'))
  } catch {
    return null
  }
}

export default async function Metrics() {
  const report = await load('latest')
  if (!report) return <p>Todavía no hay informe. Corre <code>npm run eval</code>.</p>
  const [antes, despues] = await Promise.all([load('demo-antes'), load('demo-despues')])

  return (
    <>
      <h1>Métricas del último eval</h1>
      <p className="muted">
        {new Date(report.runAt).toLocaleString('es-ES')} · {report.dataset.seed} casos del seed y {report.dataset.corrections} correcciones · {report.states[1]!.facts} hechos aprendidos.
        Son señales sobre casos sintéticos, no estadística.
      </p>

      <h2>Casos resueltos solos</h2>
      <p>Lo que mejora al aprender es la autonomía, no la corrección.</p>
      <table>
        <thead>
          <tr><th>Estado</th><th className="num">Resueltos solos</th><th className="num">Preguntados</th><th className="num">Escalados</th><th className="num">Acierto de decisión</th><th className="num">Acierto de motivo</th></tr>
        </thead>
        <tbody>
          {report.states.map((s) => (
            <tr key={s.id}>
              <td>{s.label} ({s.facts})</td>
              <td className="num"><strong>{pct(s.headline.autonomous)}</strong> <span className="muted">{of(s.headline.autonomous)}</span></td>
              <td className="num">{pct(s.headline.ask)}</td>
              <td className="num">{pct(s.headline.escalate)}</td>
              <td className="num">{pct(s.headline.decisionCorrect)}</td>
              <td className="num">{pct(s.headline.reasonCorrect)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Techo del dataset: {pct(report.ceiling)} ({of(report.ceiling)}) pasarían solos sabiendo todo lo necesario.</p>

      <h2>Holdout: casos que nadie ha corregido</h2>
      <table>
        <thead><tr><th>Estado</th><th className="num">Resueltos solos</th><th className="num">Escalados</th><th className="num">Acierto de decisión</th></tr></thead>
        <tbody>
          {report.states.map((s) => (
            <tr key={s.id}>
              <td>{s.label}</td>
              <td className="num">{pct(s.holdout.autonomous)} <span className="muted">{of(s.holdout.autonomous)}</span></td>
              <td className="num">{pct(s.holdout.escalate)}</td>
              <td className="num">{pct(s.holdout.decisionCorrect)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {antes && despues && (
        <>
          <h2>La demo guardada: antes y después de aprender</h2>
          <table>
            <thead><tr><th>Informe</th><th className="num">Hechos</th><th className="num">Resueltos solos</th><th className="num">Holdout resueltos solos</th><th className="num">Acierto de decisión</th></tr></thead>
            <tbody>
              {[['Antes', antes], ['Después', despues]].map(([label, r]) => {
                const s = (r as Report).states[1]!
                return (
                  <tr key={label as string}>
                    <td>{label as string}</td>
                    <td className="num">{s.facts}</td>
                    <td className="num"><strong>{pct(s.headline.autonomous)}</strong> <span className="muted">{of(s.headline.autonomous)}</span></td>
                    <td className="num">{pct(s.holdout.autonomous)} <span className="muted">{of(s.holdout.autonomous)}</span></td>
                    <td className="num">{pct(s.headline.decisionCorrect)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      <h2>Precisión y recall por regla</h2>
      <p className="muted">Sin hechos aprendidos. "Esperados" es cuántas veces debía saltar la regla.</p>
      <table>
        <thead><tr><th>Regla</th><th className="num">Esperados</th><th className="num">Falsos positivos</th><th className="num">No detectados</th><th className="num">Precisión</th><th className="num">Recall</th></tr></thead>
        <tbody>
          {report.states[0]!.rules.map((r) => (
            <tr key={r.rule}>
              <td>{r.rule}</td>
              <td className="num">{r.expected}</td>
              <td className="num">{r.fp}</td>
              <td className="num">{r.fn}</td>
              <td className="num">{r.precision === null ? '—' : `${r.precision} %`}</td>
              <td className="num">{r.recall === null ? '—' : `${r.recall} %`}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Coste y latencia por documento</h2>
      <table>
        <thead><tr><th>Documento</th><th className="num">Documentos</th><th>Modelo</th><th className="num">Coste medio</th><th className="num">Latencia media</th><th className="num">Latencia p95</th></tr></thead>
        <tbody>
          {report.cost.byType.map((t) => (
            <tr key={t.docType}>
              <td>{t.docType === 'albaran' ? 'Albarán' : 'Factura'}</td>
              <td className="num">{t.documents}</td>
              <td>{t.models.join(', ')}</td>
              <td className="num">{usd(t.meanCostUsd)}</td>
              <td className="num">{sec(t.meanLatencyMs)}</td>
              <td className="num">{sec(t.p95LatencyMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Por caso, con la pregunta: {usd(report.cost.perCaseUsd)} · latencia p95 por caso {sec(report.cost.p95CaseLatencyMs)} · todo el dataset {usd(report.cost.totalUsd)}.
      </p>
    </>
  )
}
