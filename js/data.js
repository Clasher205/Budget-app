/** Abfragen auf dem State, die mehrere Seiten brauchen. */
import { AREAS, keyFigures, planVsActual } from "./logic/budget.js";

export const BOTH = "Beide";

export function accountMap(state) {
  return new Map(state.accounts.map((a) => [a.id, a]));
}

export function accountNames(state) {
  return new Map(state.accounts.map((a) => [a.id, a.name]));
}

export function categoryNames(state) {
  return new Map(state.categories.map((c) => [c.id, c.name]));
}

export function sortedCategories(state) {
  return [...state.categories].sort((a, b) => a.order - b.order);
}

export function areasFor(area) {
  return area === BOTH ? AREAS : [area];
}

/** Buchungen gefiltert nach Monat ("JJJJ-MM" oder null), Bereich und Konto, neueste zuerst. */
export function filterTransactions(state, { month = null, area = BOTH, accountId = null } = {}) {
  const accounts = accountMap(state);
  return state.transactions
    .filter((t) => (!month || t.date.startsWith(month))
      && (area === BOTH || accounts.get(t.accountId)?.area === area)
      && (!accountId || t.accountId === accountId))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

export function withoutTransfers(txs) {
  return txs.filter((t) => !t.transfer);
}

/** Buchungen, Soll-Ist-Zeilen und Kennzahlen eines Monats (Umbuchungen zählen nicht). */
export function monthData(state, month, area, accountId) {
  const tx = filterTransactions(state, { month, area, accountId });
  const real = withoutTransfers(tx);
  const rows = planVsActual(state.categories, real, areasFor(area), state.budgets, state.budgetOverrides, month);
  return { tx, real, rows, figures: keyFigures(real.map((t) => t.amount)) };
}
