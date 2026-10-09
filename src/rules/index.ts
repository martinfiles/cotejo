import type { Rule, RuleContext } from '../types'
import { albaranLink } from './albaran-link'
import { implausiblePrice } from './implausible-price'
import { lineArithmetic } from './line-arithmetic'
import { missingLine } from './missing-line'
import { quantityMismatch } from './quantity-mismatch'
import { totalMismatch } from './total-mismatch'
import { unitIncompatible } from './unit-incompatible'
import { unitPriceMismatch } from './unit-price-mismatch'
import { unreadableAmount } from './unreadable-amount'
import { vatInconsistent } from './vat-inconsistent'

// Para añadir una regla: un fichero nuevo en esta carpeta y una línea aquí.
export const rules: Rule[] = [
  albaranLink,
  quantityMismatch,
  unitPriceMismatch,
  missingLine,
  unitIncompatible,
  lineArithmetic,
  totalMismatch,
  vatInconsistent,
  unreadableAmount,
  implausiblePrice,
]

export const runRules = (ctx: RuleContext) => rules.flatMap((rule) => rule.check(ctx))
