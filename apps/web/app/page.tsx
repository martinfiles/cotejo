import { listCases, listFacts, type StoredCase } from '@cotejo/store'
import Link from 'next/link'
import { revokeAction } from './actions'
import { ago, eur, num, OUTCOME, REASON, RESOLUTION } from './labels'

export const dynamic = 'force-dynamic'

export default async function Queue() {
  const cases = await listCases()
  const facts = await listFacts()
  const pending = cases.filter((c) => c.decision.outcome !== 'pass' && !c.resolution)
  // Lo que escala va primero: es lo que tiene dinero detrás.
  pending.sort((a, b) => Number(b.decision.outcome === 'escalate') - Number(a.decision.outcome === 'escalate'))
  const resolved = cases.filter((c) => c.resolution)
  const passed = cases.filter((c) => c.decision.outcome === 'pass' && !c.resolution)

  return (
    <>
      <h1>Pendientes <span className="count">{pending.length}</span></h1>
      <CaseTable cases={pending} />

      <h2>Lo que ha aprendido</h2>
      {facts.length === 0 ? (
        <p className="muted">Todavía nada. Se aprende al responder una pregunta sobre un proveedor.</p>
      ) : (
        <ul className="facts">
          {facts.map((f) => (
            <li key={f.id} className={f.revokedAt ? 'revoked' : ''}>
              <strong>{f.kind === 'unit-equivalence' ? `1 ${f.from} de ${f.product} = ${num(f.factor)} ${f.to}` : `«${f.albaran}» es «${f.factura}»`}</strong>
              <span className="muted">
                {' '}· aprendido {ago(f.learnedAt)} en <Link href={`/casos/${f.fromCase}`}>{f.fromCase}</Link>
                {f.revokedAt ? ` · revocado ${ago(f.revokedAt)}` : ''}
              </span>
              {!f.revokedAt && (
                <form action={revokeAction}>
                  <input type="hidden" name="factId" value={f.id} />
                  <button type="submit" className="small">Revocar</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2>Resueltos a mano <span className="count">{resolved.length}</span></h2>
      <CaseTable cases={resolved} />

      <h2>Pasan solos <span className="count">{passed.length}</span></h2>
      <CaseTable cases={passed} />
    </>
  )
}

function CaseTable({ cases }: { cases: StoredCase[] }) {
  if (cases.length === 0) return <p className="muted">Ninguno.</p>
  return (
    <table className="queue">
      <tbody>
        {cases.map((c) => (
          <tr key={c.id}>
            <td><span className={`badge ${c.decision.outcome}`}>{OUTCOME[c.decision.outcome]}</span></td>
            <td><Link href={`/casos/${c.id}`}>{c.factura.doc.supplier}</Link><div className="muted small-text">{c.id}</div></td>
            <td>{c.resolution ? `${RESOLUTION[c.resolution.kind]}: «${c.resolution.label}»` : REASON[c.decision.reason]}</td>
            <td className="num money">{c.decision.overchargeEur > 0 ? eur(c.decision.overchargeEur) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
