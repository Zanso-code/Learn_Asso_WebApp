/**
 * Chart palette — validated, not eyeballed.
 *
 * Categorical slots (expense postings) on the white card surface:
 *   node scripts/validate_palette.js "<CATEGORICAL>" --mode light --surface "#ffffff"
 *   → lightness PASS · chroma PASS · CVD adjacent ΔE 9.1 PASS · normal-vision ΔE 19.6 PASS
 *     · contrast WARN on aqua/yellow/magenta (< 3:1)
 * The contrast warning obliges visible relief: every category is direct-labelled
 * with its name, amount and share beside its swatch — never colour alone.
 *
 * Recettes vs Dépenses follows the app accent (ZansoTech blue income, red
 * expense). Blue/red separates better under deutan and protan CVD than the
 * emerald/red pair it replaces, so this is a net gain — but the secondary
 * encoding stays regardless: the monthly chart is *diverging*, income rising
 * above the zero line and expense falling below it. Direction carries the
 * meaning; colour only reinforces it.
 *
 * INCOME_COLOR is deliberately Zanso Royal Blue rather than CATEGORICAL[0]
 * (#2a78d6). The two never share a chart — income/expense is the monthly
 * diverging chart, CATEGORICAL is the expense-category breakdown — but keeping
 * them visibly distinct avoids a false read when both are on screen together.
 */

export const INCOME_COLOR = '#0066ff'
export const EXPENSE_COLOR = '#e34948'

/** Fixed order — assigned by slot, never cycled or re-ranked. */
export const CATEGORICAL = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
] as const

import type { ExpenseCategory } from './types'

/** Each posting owns a slot for the life of the app, so a filter never repaints it. */
export const EXPENSE_COLORS: Record<ExpenseCategory, string> = {
  logistique: CATEGORICAL[0],
  restauration: CATEGORICAL[1],
  solidarite: CATEGORICAL[2],
  fournitures: CATEGORICAL[3],
  transport: CATEGORICAL[4],
  honoraires: CATEGORICAL[5],
  autre: CATEGORICAL[6],
}
