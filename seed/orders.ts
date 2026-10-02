import type { Expected, Knowledge } from '../src/types'

export type Supplier = { name: string; taxId: string; address: string }

export type Product = {
  // Id del catálogo. Es lo que identifica la línea en el dataset.
  id: string
  code: string | null
  description: string
  unit: string
  unitPrice: number
  vatRate: number
  // Descuento en % que el proveedor aplica a este producto. Los dos
  // documentos lo imprimen en su propia columna.
  discount?: number
  // Cómo escribe el albarán esta misma línea. No es una discrepancia.
  albaranAs?: { description?: string; unit?: string; factor?: number }
  // El hecho que hay que saber del proveedor para ver que es la misma línea.
  requires?: Knowledge
}

// Lo que se siembra en un documento. Los números de línea son los del pedido.
export type Tweaks = {
  set?: { line: number; quantity?: number; unitPrice?: number }
  drop?: number
  totalDelta?: number
  vatDelta?: number
  stamp?: { line: number; field: 'quantity' | 'unitPrice' | 'total' }
  // Mancha que tapa el importe total del documento.
  stainOnTotal?: boolean
  // Cantidad impresa tachada y corregida a boli. El importe de la línea se
  // queda como estaba impreso, así que deja de cuadrar con la cantidad.
  correctedByHand?: { line: number; quantity: number }
  // Talonario: cabecera impresa y líneas escritas a mano.
  handwritten?: boolean
  // 'tilted' es una foto torcida pero nítida; 'poor' además está oscura,
  // desenfocada y con una sombra cruzando la tabla.
  photo?: 'tilted' | 'poor'
  // Formato de báscula: los kilos con punto y tres decimales ("1.250" es un
  // kilo y cuarto, "3.000" son tres kilos).
  scaleFormat?: boolean
  // Las líneas salen en orden inverso al del pedido.
  reversed?: boolean
  // Tabla apretada: sin rayas entre filas, descripción estrecha que salta de
  // línea y números alineados abajo, pegados a la fila siguiente.
  cramped?: boolean
}

export type SeedCase = {
  id: string
  supplier: Supplier
  lines: [product: Product, quantity: number][]
  albaran?: Tweaks
  factura?: Tweaks
  // Lo correcto cuando el sistema ya sabe los hechos que el caso requiere.
  expected: Expected
  // Lo correcto cuando aún no los sabe. Si se omite, es igual que `expected`.
  withoutKnowledge?: Expected
  holdout?: boolean
  boundary?: boolean
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

const arroz: Product = { id: 'arroz-bomba', code: 'C-1040', description: 'Arroz bomba saco 5 kg', unit: 'ud', unitPrice: 14.5, vatRate: 10 }
const tomateLata: Product = { id: 'tomate-triturado', code: 'C-2210', description: 'Tomate triturado lata 2,5 kg', unit: 'ud', unitPrice: 3.95, vatRate: 10 }
const vino: Product = { id: 'vino-mencia', code: 'C-3105', description: 'Vino tinto Mencía joven 75 cl', unit: 'botella', unitPrice: 5.2, vatRate: 21 }
const cerveza: Product = { id: 'cerveza-lager', code: 'C-3320', description: 'Cerveza lager caja 24x33 cl', unit: 'caja', unitPrice: 18.9, vatRate: 21 }
const azucar: Product = { id: 'azucar-blanco', code: 'C-4012', description: 'Azúcar blanco saco 10 kg', unit: 'ud', unitPrice: 11.8, vatRate: 10 }

const aceite: Product = { id: 'aceite-girasol', code: 'C-5120', description: 'Aceite de girasol alto oleico para freidora, garrafa 25 L, uso hostelería', unit: 'ud', unitPrice: 48.5, vatRate: 10 }
const vinoCrianza: Product = { id: 'vino-crianza', code: 'C-3110', description: 'Vino tinto Mencía crianza 75 cl, caja de 6 botellas', unit: 'caja', unitPrice: 56.4, vatRate: 21, discount: 10 }

const pedidoCarballo: SeedCase['lines'] = [
  [arroz, 4],
  [tomateLata, 12],
  [vino, 24],
  [cerveza, 6],
  [azucar, 2],
]

// Vidal entrega el tomate por cajas de 6 kg y lo factura por kilos.
const tomate: Product = {
  id: 'tomate-pera', code: 'V-101', description: 'Tomate pera', unit: 'kg', unitPrice: 2.3, vatRate: 4,
  albaranAs: { unit: 'caja', factor: 6 },
  requires: { supplierTaxId: vidal.taxId, kind: 'unit-equivalence', product: 'V-101', from: 'caja', to: 'kg', factor: 6 },
}
const cebolla: Product = { id: 'cebolla-dulce', code: 'V-118', description: 'Cebolla dulce', unit: 'kg', unitPrice: 1.15, vatRate: 4 }
const pimiento: Product = { id: 'pimiento-padron', code: 'V-204', description: 'Pimiento de Padrón', unit: 'kg', unitPrice: 6.4, vatRate: 4 }
const limon: Product = { id: 'limon', code: 'V-310', description: 'Limón', unit: 'kg', unitPrice: 1.9, vatRate: 4 }

// Ría Norte no usa códigos y el albarán sale con los nombres de la lonja.
// Solo BOCARTE necesita un hecho: los demás nombres se parecen lo bastante.
const boqueron: Product = {
  id: 'boqueron', code: null, description: 'Boquerón fresco', unit: 'kg', unitPrice: 6.8, vatRate: 10,
  albaranAs: { description: 'BOCARTE' },
  requires: { supplierTaxId: riaNorte.taxId, kind: 'product-alias', albaran: 'BOCARTE', factura: 'Boquerón fresco' },
}
const merluza: Product = {
  id: 'merluza-pincho', code: null, description: 'Merluza de pincho 2-3 kg', unit: 'kg', unitPrice: 11.5, vatRate: 10,
  albaranAs: { description: 'MERLUZA PINCHO 2/3' },
}
const rape: Product = {
  id: 'rape-cola', code: null, description: 'Rape cola sin piel', unit: 'kg', unitPrice: 19.9, vatRate: 10,
  albaranAs: { description: 'RAPE COLA S/P' },
}
const pulpo: Product = {
  id: 'pulpo-cocido', code: null, description: 'Pulpo cocido pata', unit: 'kg', unitPrice: 38, vatRate: 10,
  albaranAs: { description: 'PULPO COCIDO PATA' },
}
// Mismo producto en dos formatos: solo los distingue "5 kg" frente a "0,5 kg".
const berberecho5: Product = {
  id: 'berberecho-5kg', code: null, description: 'Berberecho malla 5 kg', unit: 'ud', unitPrice: 42, vatRate: 10,
  albaranAs: { description: 'BERBERECHO MALLA 5 KG' },
}
const berberecho05: Product = {
  id: 'berberecho-05kg', code: null, description: 'Berberecho malla 0,5 kg', unit: 'ud', unitPrice: 4.9, vatRate: 10,
  albaranAs: { description: 'BERBERECHO MALLA 0,5 KG' },
}
const mejillon: Product = {
  id: 'mejillon-roca', code: null, description: 'Mejillón de roca', unit: 'kg', unitPrice: 3.2, vatRate: 10,
  albaranAs: { description: 'MEJILLON ROCA' },
}

// Sin el hecho, lo correcto es ver que no se puede comparar y preguntar.
const sinEquivalencia: Expected = {
  findings: [{ ruleId: 'unit-incompatible', productId: 'tomate-pera' }],
  decision: 'ask',
}
const sinAlias: Expected = {
  findings: [{ ruleId: 'missing-line', productId: 'boqueron' }],
  decision: 'ask',
}

// Los casos nuevos se añaden al final: el número y la fecha de cada documento
// salen de la posición del caso en esta lista.
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
    expected: { findings: [{ ruleId: 'unit-price-mismatch', productId: 'vino-mencia' }], decision: 'escalate' },
    note: 'La factura sube el vino de 5,20 a 6,70 en 24 botellas: 36,00 €.',
  },
  {
    id: 'carballo-precio-centimos',
    supplier: carballo,
    lines: pedidoCarballo,
    factura: { set: { line: 2, unitPrice: 4.05 } },
    expected: { findings: [{ ruleId: 'unit-price-mismatch', productId: 'tomate-triturado' }], decision: 'ask' },
    note: 'La factura sube el tomate 10 céntimos en 12 latas: 1,20 €. Real pero pequeña.',
  },
  {
    id: 'carballo-cantidad',
    supplier: carballo,
    lines: pedidoCarballo,
    factura: { set: { line: 4, quantity: 8 } },
    expected: { findings: [{ ruleId: 'quantity-mismatch', productId: 'cerveza-lager' }], decision: 'escalate' },
    note: 'Se entregan 6 cajas de cerveza y se facturan 8: 37,80 €.',
  },
  {
    id: 'carballo-facturado-sin-entregar',
    supplier: carballo,
    lines: pedidoCarballo,
    albaran: { drop: 5 },
    expected: { findings: [{ ruleId: 'missing-line', productId: 'azucar-blanco' }], decision: 'escalate' },
    note: 'La factura cobra el azúcar, que no está en el albarán.',
  },
  {
    id: 'carballo-sin-facturar',
    supplier: carballo,
    lines: pedidoCarballo,
    factura: { drop: 2 },
    expected: { findings: [{ ruleId: 'missing-line', productId: 'tomate-triturado' }], decision: 'ask' },
    note: 'El tomate se entregó y la factura no lo incluye.',
  },
  {
    id: 'carballo-total-no-suma',
    supplier: carballo,
    lines: pedidoCarballo,
    factura: { totalDelta: 30 },
    expected: { findings: [{ ruleId: 'total-mismatch', productId: null }], decision: 'escalate' },
    note: 'El total impreso de la factura son 30 € más que base + IVA.',
  },
  {
    id: 'carballo-iva',
    supplier: carballo,
    lines: pedidoCarballo,
    factura: { vatDelta: 3.15 },
    expected: { findings: [{ ruleId: 'vat-inconsistent', productId: null }], decision: 'ask' },
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
    albaran: { photo: 'tilted' },
    expected: { findings: [], decision: 'pass' },
    note: 'Albarán fotografiado torcido. Todo cuadra.',
  },
  {
    id: 'carballo-foto-cantidad',
    supplier: carballo,
    lines: pedidoCarballo,
    albaran: { photo: 'tilted' },
    factura: { set: { line: 1, quantity: 6 } },
    expected: { findings: [{ ruleId: 'quantity-mismatch', productId: 'arroz-bomba' }], decision: 'escalate' },
    note: 'Albarán fotografiado torcido; se entregan 4 sacos de arroz y se facturan 6: 29,00 €.',
  },
  {
    id: 'vidal-cajas-1',
    supplier: vidal,
    lines: [[tomate, 12], [cebolla, 10], [pimiento, 3], [limon, 5]],
    expected: { findings: [], decision: 'pass' },
    withoutKnowledge: sinEquivalencia,
    note: 'Tomate en cajas en el albarán y en kilos en la factura; con 1 caja = 6 kg cuadra. Es el caso que se resuelve a mano en la demo.',
  },
  {
    id: 'vidal-cajas-2',
    supplier: vidal,
    lines: [[tomate, 18], [cebolla, 15], [limon, 8]],
    expected: { findings: [], decision: 'pass' },
    withoutKnowledge: sinEquivalencia,
    holdout: true,
    note: 'Otro pedido con el mismo tomate en cajas. Cuadra.',
  },
  {
    id: 'vidal-cajas-cantidad',
    supplier: vidal,
    lines: [[tomate, 24], [pimiento, 4], [cebolla, 10]],
    factura: { set: { line: 1, quantity: 36 } },
    expected: { findings: [{ ruleId: 'quantity-mismatch', productId: 'tomate-pera' }], decision: 'escalate' },
    withoutKnowledge: sinEquivalencia,
    holdout: true,
    note: 'Se entregan 4 cajas de tomate (24 kg) y se facturan 36 kg: 27,60 €. Solo se ve si se sabe cuánto pesa la caja.',
  },
  {
    id: 'rianorte-alias-1',
    supplier: riaNorte,
    lines: [[merluza, 8], [boqueron, 5], [rape, 4]],
    expected: { findings: [], decision: 'pass' },
    withoutKnowledge: sinAlias,
    note: 'El albarán dice BOCARTE y la factura Boquerón fresco. Es el mismo producto y cuadra. Es el caso que se resuelve a mano en la demo.',
  },
  {
    id: 'rianorte-alias-2',
    supplier: riaNorte,
    lines: [[boqueron, 6], [mejillon, 10], [merluza, 5]],
    expected: { findings: [], decision: 'pass' },
    withoutKnowledge: sinAlias,
    holdout: true,
    note: 'Otro pedido con BOCARTE / Boquerón fresco. Cuadra.',
  },
  {
    id: 'rianorte-alias-precio',
    supplier: riaNorte,
    lines: [[boqueron, 8], [rape, 3], [mejillon, 6]],
    factura: { set: { line: 1, unitPrice: 10.4 } },
    expected: { findings: [{ ruleId: 'unit-price-mismatch', productId: 'boqueron' }], decision: 'escalate' },
    withoutKnowledge: sinAlias,
    holdout: true,
    note: 'La factura sube el boquerón de 6,80 a 10,40 en 8 kg: 28,80 €. Solo se ve si se sabe que BOCARTE es boquerón.',
  },
  {
    id: 'carballo-frontera-bajo',
    supplier: carballo,
    lines: pedidoCarballo,
    factura: { set: { line: 4, quantity: 7 } },
    expected: { findings: [{ ruleId: 'quantity-mismatch', productId: 'cerveza-lager' }], decision: 'ask' },
    boundary: true,
    note: 'Se entregan 6 cajas de cerveza y se facturan 7: 18,90 €, justo por debajo de un umbral de 20 €.',
  },
  {
    id: 'carballo-frontera-sobre',
    supplier: carballo,
    lines: pedidoCarballo,
    factura: { set: { line: 3, unitPrice: 6.05 } },
    expected: { findings: [{ ruleId: 'unit-price-mismatch', productId: 'vino-mencia' }], decision: 'escalate' },
    boundary: true,
    note: 'La factura sube el vino de 5,20 a 6,05 en 24 botellas: 20,40 €, justo por encima de un umbral de 20 €.',
  },
  {
    id: 'carballo-mancha-total',
    supplier: carballo,
    lines: pedidoCarballo,
    factura: { stainOnTotal: true },
    expected: { findings: [], decision: 'ask' },
    note: 'Una mancha tapa el total de la factura. No hay discrepancia, pero no se puede comprobar que el total suma.',
  },
  {
    id: 'carballo-corregido-a-mano',
    supplier: carballo,
    lines: pedidoCarballo,
    albaran: { correctedByHand: { line: 3, quantity: 18 } },
    expected: { findings: [{ ruleId: 'quantity-mismatch', productId: 'vino-mencia' }], decision: 'ask' },
    note: 'En el albarán las 24 botellas están tachadas y pone 18 a boli; la factura cobra 24: 31,20 €. El impacto es de escalar, pero el dato sale de una corrección a mano y el importe impreso de esa línea ya no cuadra: se pregunta.',
  },
  {
    id: 'carballo-foto-mala',
    supplier: carballo,
    lines: pedidoCarballo,
    albaran: { photo: 'poor' },
    expected: { findings: [], decision: 'pass' },
    note: 'Albarán fotografiado con poca luz, desenfocado y con sombra. Se lee con esfuerzo y todo cuadra.',
  },
  {
    id: 'carballo-foto-mala-precio',
    supplier: carballo,
    lines: pedidoCarballo,
    albaran: { photo: 'poor' },
    factura: { set: { line: 4, unitPrice: 23.9 } },
    expected: { findings: [{ ruleId: 'unit-price-mismatch', productId: 'cerveza-lager' }], decision: 'escalate' },
    note: 'Misma foto mala; la factura sube la cerveza de 18,90 a 23,90 en 6 cajas: 30,00 €.',
  },
  {
    id: 'rianorte-manuscrito',
    supplier: riaNorte,
    lines: [[merluza, 6], [rape, 5], [mejillon, 12]],
    albaran: { handwritten: true },
    expected: { findings: [], decision: 'pass' },
    note: 'Albarán de talonario con las líneas escritas a mano. Todo cuadra.',
  },
  {
    id: 'rianorte-trampa-bascula',
    supplier: riaNorte,
    lines: [[pulpo, 1.25], [rape, 3], [berberecho5, 2], [berberecho05, 6]],
    albaran: { scaleFormat: true, reversed: true },
    expected: { findings: [], decision: 'pass' },
    note: 'Documento limpio con trampas. El albarán da los kilos en formato de báscula ("1.250", "3.000") y lista las líneas en orden inverso; hay dos berberechos que solo se distinguen por el formato. Todo cuadra.',
  },
  {
    id: 'carballo-trampa-columnas',
    supplier: carballo,
    lines: [[aceite, 3], [vinoCrianza, 2], [azucar, 1], [arroz, 4]],
    albaran: { cramped: true },
    factura: { cramped: true },
    expected: { findings: [], decision: 'pass' },
    note: 'Documento limpio con trampas. Columna de descuento (10 % en el vino), una descripción que salta a dos líneas con los números pegados a la fila siguiente, y una línea de una sola unidad donde precio e importe coinciden. Todo cuadra.',
  },
]
