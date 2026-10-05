import { getCase, listFacts } from '@cotejo/store'
import type { DocType, Finding, Line, Signal } from '@cotejo/types'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { resolveAction } from '../../actions'
import { Crop, DocPage } from '../../crop'
import { ago, BY, DOC, eur, num, OUTCOME, REASON, RESOLUTION, SIGNAL } from '../../labels'

export const dynamic = 'force-dynamic'

type Field = 'quantity' | 'unitPrice' | 'total'

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const c = await getCase(decodeURIComponent((await params).id))
  if (!c) notFound()
  const { decision, findings, match } = c
  const facts = await listFacts()

  // Qué celda de la tabla toca cada finding. Un finding de un par apunta a
  // la línea de la factura; su evidencia dice en qué documento y campo está.
  const partner = new Map<string, string>()
  for (const p of match.pairs) {
    partner.set(p.albaran.key, p.factura.key)
    partner.set(p.factura.key, p.albaran.key)
  }
  const flagged = new Map<string, Signal>()
  for (const f of findings) {
    if (!f.lineKey) continue
    for (const e of f.evidence) {
      const own = f.lineKey.startsWith(e.doc === 'albaran' ? 'A' : 'F') ? f.lineKey : partner.get(f.lineKey)
      if (own) flagged.set(`${own}.${e.field}`, f.signal)
    }
  }
  const cell = (line: Line | undefined, field: Field) => {
    if (!line) return <td />
    const signal = flagged.get(`${line.key}.${field}`)
    const value = line[field].value
    return (
      <td className={`num ${signal ? `flag ${signal}` : ''}`}>
        {field === 'quantity' ? `${num(value)} ${line.unit ?? ''}` : value === null ? 'ilegible' : eur(value)}
      </td>
    )
  }
  const rows: { albaran?: Line; factura?: Line; by?: keyof typeof BY }[] = [
    ...match.pairs.map((p) => ({ albaran: p.albaran, factura: p.factura, by: p.by })),
    ...match.onlyAlbaran.map((l) => ({ albaran: l })),
    ...match.onlyFactura.map((l) => ({ factura: l })),
  ]

  const boxesIn = (doc: DocType) => findings.flatMap((f) => f.evidence.filter((e) => e.doc === doc).map((e) => e.bbox))
  const file = (doc: DocType) => c.files[doc]

  return (
    <>
      <p className="crumbs"><Link href="/">← Cola</Link></p>
      <header className="case-head">
        <h1>{c.factura.doc.supplier}</h1>
        <p className="muted">
          Albarán {c.albaran.doc.number} · Factura {c.factura.doc.number} · {c.factura.doc.date} · caso {c.id}
        </p>
      </header>

      <section className={`decision ${decision.outcome}`}>
        <div className="decision-head">
          <span className={`badge ${decision.outcome}`}>{OUTCOME[decision.outcome]}</span>
          <span className="reason">{REASON[decision.reason]}</span>
          {decision.overchargeEur > 0 && <span className="money">{eur(decision.overchargeEur)} de más</span>}
        </div>
        {decision.question && <p className="question">{decision.question}</p>}

        {c.resolution ? (
          <p className="resolved">
            {RESOLUTION[c.resolution.kind]}: «{c.resolution.label}» {ago(c.resolution.at)}
            {c.resolution.amountEur ? ` · ${eur(c.resolution.amountEur)}` : ''}
          </p>
        ) : (
          decision.options.length > 0 && (
            <div className="options">
              {decision.options.map((o, i) => (
                <form key={i} action={resolveAction} className={`option ${o.kind}`}>
                  <input type="hidden" name="caseId" value={c.id} />
                  <input type="hidden" name="option" value={i} />
                  {o.factorPrompt && (
                    <label>
                      {o.factorPrompt}{' '}
                      <input name="factor" inputMode="decimal" required size={4} />
                    </label>
                  )}
                  <button type="submit">{o.factorPrompt ? 'Enseñar' : o.label}</button>
                </form>
              ))}
            </div>
          )
        )}

        {c.facts.length > 0 && (
          <p className="facts-used">
            Aplica lo aprendido:{' '}
            {c.facts.map((f) => {
              const current = facts.find((x) => x.id === f.id) ?? f
              return (
                <span key={f.id} className="fact-chip">
                  {f.kind === 'unit-equivalence' ? `1 ${f.from} = ${num(f.factor)} ${f.to}` : `${f.albaran} = ${f.factura}`}
                  {' · '}
                  {ago(current.learnedAt)} en {current.fromCase}
                </span>
              )
            })}
          </p>
        )}
      </section>

      {findings.length > 0 && (
        <section>
          <h2>Qué ha encontrado</h2>
          {findings.map((f, i) => (
            <FindingCard key={i} finding={f} files={c.files} />
          ))}
        </section>
      )}

      <section>
        <h2>Líneas cruzadas</h2>
        <table className="lines">
          <thead>
            <tr>
              <th colSpan={4}>Albarán</th>
              <th colSpan={4}>Factura</th>
              <th>Cruce</th>
            </tr>
            <tr>
              <th>Descripción</th><th className="num">Cantidad</th><th className="num">Precio</th><th className="num">Importe</th>
              <th>Descripción</th><th className="num">Cantidad</th><th className="num">Precio</th><th className="num">Importe</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="desc">{r.albaran?.description ?? <span className="muted">no está</span>}</td>
                {cell(r.albaran, 'quantity')}
                {cell(r.albaran, 'unitPrice')}
                {cell(r.albaran, 'total')}
                <td className="desc">
                  {r.factura?.description ?? <span className="muted">no está</span>}
                  {r.factura?.discount ? <span className="muted"> (−{num(r.factura.discount)} %)</span> : null}
                </td>
                {cell(r.factura, 'quantity')}
                {cell(r.factura, 'unitPrice')}
                {cell(r.factura, 'total')}
                <td className="muted">{r.by ? BY[r.by] : 'sin pareja'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Documentos</h2>
        <div className="docs">
          {(['albaran', 'factura'] as const).map((doc) => (
            <figure key={doc}>
              <figcaption>{DOC[doc]}</figcaption>
              <DocPage file={file(doc)} boxes={boxesIn(doc)} />
            </figure>
          ))}
        </div>
      </section>
    </>
  )
}

function FindingCard({ finding: f, files }: { finding: Finding; files: Record<DocType, string> }) {
  return (
    <article className={`finding ${f.signal}`}>
      <div className="finding-head">
        <span className={`tag ${f.signal}`}>{SIGNAL[f.signal]}</span>
        <span>{f.message}</span>
        {f.impactEur !== null && f.impactEur !== 0 && (
          <span className="money">{f.impactEur > 0 ? `${eur(f.impactEur)} de más` : `${eur(-f.impactEur)} a favor`}</span>
        )}
      </div>
      <div className="evidence">
        {f.evidence.map((e, i) => (
          <figure key={i}>
            <figcaption>
              {DOC[e.doc]}: <strong>{e.value === null ? 'no se lee' : e.field === 'quantity' ? num(e.value) : eur(e.value)}</strong>
            </figcaption>
            <Crop file={files[e.doc]} box={e.bbox} />
          </figure>
        ))}
      </div>
    </article>
  )
}
