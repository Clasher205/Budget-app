/** Zuordnung von Buchungen zu Budget-Monaten: Eingänge ab dem Stichtag zählen schon zum Folgemonat. */
import { daysInMonth, monthOf, shiftMonth } from "./format.js";

export const DEFAULT_CUTOFF_DAY = 20;

/** Gültiger Stichtag (2–31, 31 = letzter Tag des Monats) oder null (= leer). */
export function normalizeCutoff(value) {
  if (value === null || value === undefined || value === "") return null;
  const day = Number(value);
  if (!Number.isInteger(day) || day < 2 || day > 31) {
    throw new Error("Der Stichtag muss eine ganze Zahl von 2 bis 31 sein (31 = letzter Tag des Monats).");
  }
  return day;
}

/** Monat, für den eine Buchung zählt. Ausgaben bleiben in ihrem Monat; ein Stichtag über dem Monatsende gilt als letzter Tag. */
export function countedMonth(tx, cutoffDay) {
  const month = monthOf(tx.date);
  if (!cutoffDay || tx.amount <= 0) return month;
  return Number(tx.date.slice(8, 10)) >= Math.min(cutoffDay, daysInMonth(month)) ? shiftMonth(month, 1) : month;
}

/**
 * Buchungen mit „zählendem“ Datum: verschobene Eingänge stehen am 1. des Folgemonats, `bookedDate` behält das echte.
 * `cutoff`: Stichtag für alle Buchungen oder Funktion (Buchung → Stichtag), z. B. pro Konto.
 */
export function withCountedDates(transactions, cutoff) {
  const cutoffFor = typeof cutoff === "function" ? cutoff : () => cutoff;
  return transactions.map((t) => {
    const month = countedMonth(t, cutoffFor(t));
    return month === monthOf(t.date) ? t : { ...t, date: `${month}-01`, bookedDate: t.date };
  });
}
