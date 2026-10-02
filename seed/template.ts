import type { DocType } from '../src/types'
import type { Supplier, Tweaks } from './orders'

export type DocLine = {
  productId: string
  code: string | null
  description: string
  quantity: number
  unit: string
  unitPrice: number
  vatRate: number
  total: number
  stamped: NonNullable<Tweaks['stamp']>['field'] | null
  // Cantidad impresa que quedó tachada al corregirla a mano.
  crossedOut: number | null
}

export type DocData = {
  docType: DocType
  supplier: Supplier
  number: string
  date: string
  albaranRef: string | null
  lines: DocLine[]
  base: number
  vat: number
  total: number
  photo: Tweaks['photo'] | null
  handwritten: boolean
  stainOnTotal: boolean
}

const money = (n: number) =>
  n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qty = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 })

const STAMP = '<span class="stamp">RECIBIDO<br>CONFORME</span>'

function row(line: DocLine, withCodes: boolean, withVat: boolean) {
  const cell = (field: DocLine['stamped'], text: string) =>
    `<td class="num">${text}${line.stamped === field ? STAMP : ''}</td>`
  return `<tr>
    ${withCodes ? `<td>${line.code ?? ''}</td>` : ''}
    <td>${line.description}</td>
    ${cell('quantity', line.crossedOut === null ? qty(line.quantity) : `<s>${qty(line.crossedOut)}</s><span class="pen">${qty(line.quantity)}</span>`)}
    <td>${line.unit}</td>
    ${cell('unitPrice', money(line.unitPrice))}
    ${withVat ? `<td class="num">${line.vatRate}</td>` : ''}
    ${cell('total', money(line.total))}
  </tr>`
}

export function renderHtml(doc: DocData) {
  const isFactura = doc.docType === 'factura'
  const withCodes = doc.lines.some((l) => l.code)

  const totals = isFactura
    ? `<tr><td>Base imponible</td><td class="num">${money(doc.base)}</td></tr>
       <tr><td>Cuota IVA</td><td class="num">${money(doc.vat)}</td></tr>
       <tr class="grand"><td>Total factura</td><td class="num${doc.stainOnTotal ? ' stained' : ''}">${money(doc.total)} €${doc.stainOnTotal ? '<span class="stain"></span>' : ''}</td></tr>`
    : `<tr class="grand"><td>Total albarán (sin IVA)</td><td class="num">${money(doc.base)} €</td></tr>`

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 13px/1.4 Arial, Helvetica, sans-serif; color: #1a1a1a; }
  .sheet { width: 210mm; min-height: 297mm; padding: 18mm; background: #fff; }
  header { display: flex; justify-content: space-between; margin-bottom: 10mm; }
  header h1 { margin: 0 0 4px; font-size: 17px; }
  header p { margin: 0; color: #444; }
  .meta { text-align: right; }
  .meta h2 { margin: 0 0 4px; font-size: 22px; letter-spacing: 1px; }
  .client { margin-bottom: 8mm; padding: 8px 10px; border: 1px solid #bbb; width: 60%; }
  table { border-collapse: collapse; width: 100%; }
  .lines th { text-align: left; border-bottom: 2px solid #1a1a1a; padding: 6px 8px; font-size: 11px; text-transform: uppercase; }
  .lines td { border-bottom: 1px solid #ddd; padding: 7px 8px; position: relative; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .lines th.num { text-align: right; }
  .totals { width: 45%; margin: 8mm 0 0 auto; }
  .totals td { padding: 5px 8px; }
  .grand td { border-top: 2px solid #1a1a1a; font-weight: bold; font-size: 15px; }
  .stamp {
    position: absolute; right: -6px; top: -9px; padding: 5px 9px;
    border: 3px double #1d3f9c; border-radius: 6px;
    background: rgba(29, 63, 156, 0.82); color: #dfe6fb;
    font: bold 10px/1.15 Arial, sans-serif; text-align: center; letter-spacing: 1px;
    transform: rotate(-9deg);
  }

  /* Variante foto: la hoja sobre una mesa, torcida, con sombra y algo de desenfoque. */
  body.photo { background: #3b2f26; padding: 70px 90px 110px; perspective: 1500px; }
  body.photo .sheet {
    background: linear-gradient(115deg, #f7f4ea 0%, #f1ede0 55%, #cfc9b8 100%);
    transform: rotateX(7deg) rotateZ(-3.5deg);
    box-shadow: 14px 22px 40px rgba(0, 0, 0, 0.55);
    filter: blur(0.45px) contrast(0.93);
  }
  /* Foto mala: más torcida, oscura, desenfocada y con una sombra cruzando la tabla. */
  body.poor { background: #1f1913; }
  body.poor .sheet {
    position: relative;
    transform: rotateX(13deg) rotateZ(5.5deg);
    filter: blur(0.9px) brightness(0.72) contrast(0.85);
  }
  body.poor .sheet::after {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(100deg, transparent 30%, rgba(0, 0, 0, 0.45) 48%, rgba(0, 0, 0, 0.38) 60%, transparent 75%);
  }

  /* Tinta de boli: correcciones a mano y albaranes de talonario. */
  .pen, body.handwritten .lines td, body.handwritten .totals td {
    font-family: 'Ink Free', 'Segoe Print', cursive; color: #1b2f7a;
  }
  .pen { display: inline-block; margin-left: 5px; font-size: 19px; line-height: 1; transform: rotate(-6deg); }
  .lines s { text-decoration: line-through 2px #1b2f7a; }
  body.handwritten .lines td, body.handwritten .totals td { font-size: 18px; }

  td.stained { position: relative; }
  .stain {
    position: absolute; right: -14px; top: -10px; width: 118px; height: 46px;
    border-radius: 47% 53% 58% 42% / 55% 44% 56% 45%;
    background: radial-gradient(ellipse at 45% 50%, #4a2c12 0%, #5b3717 55%, rgba(91, 55, 23, 0.85) 80%, rgba(91, 55, 23, 0) 100%);
    transform: rotate(-4deg);
  }
</style>
</head>
<body class="${[doc.photo && 'photo', doc.photo === 'poor' && 'poor', doc.handwritten && 'handwritten'].filter(Boolean).join(' ')}">
<div class="sheet">
  <header>
    <div>
      <h1>${doc.supplier.name}</h1>
      <p>NIF ${doc.supplier.taxId}</p>
      <p>${doc.supplier.address}</p>
    </div>
    <div class="meta">
      <h2>${isFactura ? 'FACTURA' : 'ALBARÁN'}</h2>
      <p>Nº ${doc.number}</p>
      <p>Fecha ${doc.date}</p>
      ${doc.albaranRef ? `<p>Albarán ${doc.albaranRef}</p>` : ''}
    </div>
  </header>
  <div class="client">
    <strong>Restaurante O Faiado S.L.</strong><br>
    NIF B15009902 · Rúa da Estrela 14 · 15003 A Coruña
  </div>
  <table class="lines">
    <thead><tr>
      ${withCodes ? '<th>Código</th>' : ''}
      <th>Descripción</th>
      <th class="num">Cantidad</th>
      <th>Ud.</th>
      <th class="num">Precio</th>
      ${isFactura ? '<th class="num">IVA %</th>' : ''}
      <th class="num">Importe</th>
    </tr></thead>
    <tbody>${doc.lines.map((l) => row(l, withCodes, isFactura)).join('')}</tbody>
  </table>
  <table class="totals">${totals}</table>
</div>
</body>
</html>`
}
