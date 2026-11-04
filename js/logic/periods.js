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

/**
 * Tatsächlicher Stichtag in einem Monat: über dem Monatsende gilt der letzte Tag; fällt er auf Samstag oder Sonntag,
 * gilt der Freitag davor (Banken buchen dann meist schon am Freitag).
 */
export function effectiveCutoff(month, cutoffDay) {
  const day = Math.min(cutoffDay, daysInMonth(month));
  const [y, m] = month.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return day - (weekday === 6 ? 1 : weekday === 0 ? 2 : 0);
}

/** Monat, für den eine Buchung zählt. Ausgaben bleiben in ihrem Monat. */
export function countedMonth(tx, cutoffDay) {
  const month = monthOf(tx.date);
  if (!cutoffDay || tx.amount <= 0) return month;
  return Number(tx.date.slice(8, 10)) >= effectiveCutoff(month, cutoffDay) ? shiftMonth(month, 1) : month;
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
