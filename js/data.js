/** Abfragen auf dem State, die mehrere Seiten brauchen. */
import { AREAS, keyFigures, planVsActual } from "./logic/budget.js";
import { withCountedDates } from "./logic/periods.js";

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

/** Stichtag je Buchung: eigener Stichtag des Kontos, sonst der allgemeine. */
export function cutoffResolver(state) {
  const general = state.settings?.incomeCutoffDay ?? null;
  const perAccount = new Map(state.accounts.map((a) => [a.id, a.cutoffDay ?? null]));
  return (t) => perAccount.get(t.accountId) ?? general;
}

/** Buchungen mit dem Datum, für das sie im Budget zählen (Eingänge ab dem Stichtag → Folgemonat). */
export function countedTransactions(state) {
  return withCountedDates(state.transactions, cutoffResolver(state));
}

/**
 * Buchungen gefiltert nach Monat ("JJJJ-MM" oder null), Bereich und Konto, neueste zuerst.
 * `counted`: nach Budget-Monat filtern (Standard) statt nach echtem Buchungsdatum.
 */
export function filterTransactions(state, { month = null, area = BOTH, accountId = null, counted = true } = {}) {
  const accounts = accountMap(state);
  return (counted ? countedTransactions(state) : state.transactions)
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
