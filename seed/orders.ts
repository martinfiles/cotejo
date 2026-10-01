import type { DatasetCase } from '../src/types'

export type Supplier = { name: string; taxId: string; address: string }

export type Product = {
  code: string | null
  description: string
  unit: string
  unitPrice: number
  vatRate: number
  // Cómo escribe el albarán esta misma línea. No es una discrepancia: es lo
  // que el sistema tiene que aprender del proveedor (1 caja = `factor` kg,
  // o un nombre distinto para el mismo producto).
  albaranAs?: { description?: string; unit?: string; factor?: number }
}

// Lo que se siembra en un documento. Los números de línea son los del pedido.
export type Tweaks = {
  set?: { line: number; quantity?: number; unitPrice?: number }
  drop?: number
  totalDelta?: number
  vatDelta?: number
  stamp?: { line: number; field: 'quantity' | 'unitPrice' | 'total' }
  photo?: boolean
}

export type SeedCase = {
  id: string
  supplier: Supplier
  lines: [product: Product, quantity: number][]
  albaran?: Tweaks
  factura?: Tweaks
  expected: DatasetCase['expected']
  note: string
}

const carballo: Supplier = {
  name: 'Distribuciones Carballo S.L.',
  taxId: 'B15004417',
  address: 'Pol. Ind. de Bergondo, nave 12 · 15165 Bergondo (A Coruña)',
}
const vidal: Supplier = {
  name: 'Frutas Hermanos Vidal S.L.',
  taxId: 'B36009823',
  address: 'Mercado Central, puesto 41 · 36202 Vigo (Pontevedra)',
}
const riaNorte: Supplier = {
  name: 'Pescados Ría Norte S.L.',
  taxId: 'B27003358',
  address: 'Peirao da Lonxa s/n · 27880 Burela (Lugo)',
}

const arroz: Product = { code: 'C-1040', description: 'Arroz bomba saco 5 kg', unit: 'ud', unitPrice: 14.5, vatRate: 10 }
const tomateLata: Product = { code: 'C-2210', description: 'Tomate triturado lata 2,5 kg', unit: 'ud', unitPrice: 3.95, vatRate: 10 }
const vino: Product = { code: 'C-3105', description: 'Vino tinto Mencía joven 75 cl', unit: 'botella', unitPrice: 5.2, vatRate: 21 }
const cerveza: Product = { code: 'C-3320', description: 'Cerveza lager caja 24x33 cl', unit: 'caja', unitPrice: 18.9, vatRate: 21 }
const azucar: Product = { code: 'C-4012', description: 'Azúcar blanco saco 10 kg', unit: 'ud', unitPrice: 11.8, vatRate: 10 }

const pedidoCarballo: SeedCase['lines'] = [
  [arroz, 4],
  [tomateLata, 12],
  [vino, 24],
  [cerveza, 6],
  [azucar, 2],
]

// Vidal entrega el tomate por cajas de 6 kg y lo factura por kilos.
const tomate: Product = {
  code: 'V-101', description: 'Tomate pera', unit: 'kg', unitPrice: 2.3, vatRate: 4,
  albaranAs: { unit: 'caja', factor: 6 },
}
const cebolla: Product = { code: 'V-118', description: 'Cebolla dulce', unit: 'kg', unitPrice: 1.15, vatRate: 4 }
const pimiento: Product = { code: 'V-204', description: 'Pimiento de Padrón', unit: 'kg', unitPrice: 6.4, vatRate: 4 }
const limon: Product = { code: 'V-310', description: 'Limón', unit: 'kg', unitPrice: 1.9, vatRate: 4 }

// Ría Norte no usa códigos y el albarán sale con los nombres de la lonja.
const boqueron: Product = {
  code: null, description: 'Boquerón fresco', unit: 'kg', unitPrice: 6.8, vatRate: 10,
  albaranAs: { description: 'BOCARTE' },
}
const merluza: Product = {
  code: null, description: 'Merluza de pincho 2-3 kg', unit: 'kg', unitPrice: 11.5, vatRate: 10,
  albaranAs: { description: 'MERLUZA PINCHO 2/3' },
}
const rape: Product = {
  code: null, description: 'Rape cola sin piel', unit: 'kg', unitPrice: 19.9, vatRate: 10,
  albaranAs: { description: 'RAPE COLA S/P' },
}
const mejillon: Product = {
  code: null, description: 'Mejillón de roca', unit: 'kg', unitPrice: 3.2, vatRate: 10,
  albaranAs: { description: 'MEJILLON ROCA' },
}

export const cases: SeedCase[] = [
  {
    id: 'carballo-limpio',
    supplier: carballo,
    lines: pedidoCarballo,
    expected: { findings: [], decision: 'pass' },
    note: 'Todo cuadra.',
  },
  {
    id: 'carballo-precio',
    supplier: carballo,
    lines: pedidoCarballo,
    factura: { set: { line: 3, unitPrice: 6.7 } },
    expected: { findings: [{ ruleId: 'unit-price-mismatch', lineKey: 'F3' }], decision: 'escalate' },
    note: 'La factura sube el vino de 5,20 a 6,70 en 24 botellas.',
  },
  {
    id: 'carballo-precio-centimos',
    supplier: carballo,
    lines: pedidoCarballo,
    factura: { set: { line: 2, unitPrice: 4.05 } },
    expected: { findings: [{ ruleId: 'unit-price-mismatch', lineKey: 'F2' }], decision: 'ask' },
    note: 'La factura sube el tomate 10 céntimos en 12 latas: real pero pequeña.',
  },
  {
    id: 'carballo-cantidad',
    supplier: carballo,
    lines: pedidoCarballo,
    factura: { set: { line: 4, quantity: 8 } },
    expected: { findings: [{ ruleId: 'quantity-mismatch', lineKey: 'F4' }], decision: 'escalate' },
    note: 'Se entregan 6 cajas de cerveza y se facturan 8.',
  },
  {
    id: 'carballo-facturado-sin-entregar',
    supplier: carballo,
    lines: pedidoCarballo,
    albaran: { drop: 5 },
    expected: { findings: [{ ruleId: 'missing-line', lineKey: 'F5' }], decision: 'escalate' },
    note: 'La factura cobra el azúcar, que no está en el albarán.',
  },
  {
    id: 'carballo-sin-facturar',
    supplier: carballo,
    lines: pedidoCarballo,
    factura: { drop: 2 },
    expected: { findings: [{ ruleId: 'missing-line', lineKey: 'A2' }], decision: 'ask' },
    note: 'El tomate se entregó y la factura no lo incluye.',
  },
  {
    id: 'carballo-total-no-suma',
    supplier: carballo,
    lines: pedidoCarballo,
    factura: { totalDelta: 30 },
    expected: { findings: [{ ruleId: 'total-mismatch', lineKey: null }], decision: 'escalate' },
    note: 'El total impreso de la factura son 30 € más que base + IVA.',
  },
  {
    id: 'carballo-iva',
    supplier: carballo,
    lines: pedidoCarballo,
    factura: { vatDelta: 3.15 },
    expected: { findings: [{ ruleId: 'vat-inconsistent', lineKey: null }], decision: 'ask' },
    note: 'La cuota de IVA impresa no sale de los tipos de las líneas; el total sí suma.',
  },
  {
    id: 'carballo-sello',
    supplier: carballo,
    lines: pedidoCarballo,
    factura: { stamp: { line: 3, field: 'unitPrice' } },
    expected: { findings: [], decision: 'ask' },
    note: 'Sello encima del precio del vino en la factura. No hay discrepancia, pero el dato no se puede leer.',
  },
  {
    id: 'carballo-foto',
    supplier: carballo,
    lines: pedidoCarballo,
    albaran: { photo: true },
    expected: { findings: [], decision: 'pass' },
    note: 'Albarán fotografiado torcido. Todo cuadra.',
  },
  {
    id: 'carballo-foto-cantidad',
    supplier: carballo,
    lines: pedidoCarballo,
    albaran: { photo: true },
    factura: { set: { line: 1, quantity: 6 } },
    expected: { findings: [{ ruleId: 'quantity-mismatch', lineKey: 'F1' }], decision: 'escalate' },
    note: 'Albarán fotografiado torcido; se entregan 4 sacos de arroz y se facturan 6.',
  },
  {
    id: 'vidal-cajas-1',
    supplier: vidal,
    lines: [[tomate, 12], [cebolla, 10], [pimiento, 3], [limon, 5]],
    expected: { findings: [], decision: 'pass' },
    note: 'Tomate en cajas en el albarán y en kilos en la factura; con 1 caja = 6 kg cuadra.',
  },
  {
    id: 'vidal-cajas-2',
    supplier: vidal,
    lines: [[tomate, 18], [cebolla, 15], [limon, 8]],
    expected: { findings: [], decision: 'pass' },
    note: 'Otro pedido con el mismo tomate en cajas. Cuadra.',
  },
  {
    id: 'vidal-cajas-cantidad',
    supplier: vidal,
    lines: [[tomate, 24], [pimiento, 4], [cebolla, 10]],
    factura: { set: { line: 1, quantity: 36 } },
    expected: { findings: [{ ruleId: 'quantity-mismatch', lineKey: 'F1' }], decision: 'escalate' },
    note: 'Se entregan 4 cajas de tomate (24 kg) y se facturan 36 kg. Solo se ve si se sabe cuánto pesa la caja.',
  },
  {
    id: 'rianorte-alias-1',
    supplier: riaNorte,
    lines: [[merluza, 8], [boqueron, 5], [rape, 4]],
    expected: { findings: [], decision: 'pass' },
    note: 'El albarán dice BOCARTE y la factura Boquerón fresco. Es el mismo producto y cuadra.',
  },
  {
    id: 'rianorte-alias-2',
    supplier: riaNorte,
    lines: [[boqueron, 6], [mejillon, 10], [merluza, 5]],
    expected: { findings: [], decision: 'pass' },
    note: 'Otro pedido con BOCARTE / Boquerón fresco. Cuadra.',
  },
  {
    id: 'rianorte-alias-precio',
    supplier: riaNorte,
    lines: [[boqueron, 8], [rape, 3], [mejillon, 6]],
    factura: { set: { line: 1, unitPrice: 10.4 } },
    expected: { findings: [{ ruleId: 'unit-price-mismatch', lineKey: 'F1' }], decision: 'escalate' },
    note: 'La factura sube el boquerón de 6,80 a 10,40. Solo se ve si se sabe que BOCARTE es boquerón.',
  },
]
