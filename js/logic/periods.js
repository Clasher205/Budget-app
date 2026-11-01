/** Zuordnung von Buchungen zu Budget-Monaten: Eingänge ab dem Stichtag zählen schon zum Folgemonat. */
import { monthOf, shiftMonth } from "./format.js";

export const DEFAULT_CUTOFF_DAY = 20;

/** Gültiger Stichtag (2–28) oder null (= Regel aus). */
export function normalizeCutoff(value) {
  if (value === null || value === undefined || value === "") return null;
  const day = Number(value);
  if (!Number.isInteger(day) || day < 2 || day > 28) throw new Error("Der Stichtag muss eine ganze Zahl von 2 bis 28 sein.");
  return day;
}

/** Monat, für den eine Buchung zählt. Ausgaben bleiben in ihrem Monat. */
export function countedMonth(tx, cutoffDay) {
  const month = monthOf(tx.date);
  if (cutoffDay && tx.amount > 0 && Number(tx.date.slice(8, 10)) >= cutoffDay) return shiftMonth(month, 1);
  return month;
}

/** Buchungen mit „zählendem“ Datum: verschobene Eingänge stehen am 1. des Folgemonats, `bookedDate` behält das echte. */
export function withCountedDates(transactions, cutoffDay) {
  return transactions.map((t) => {
    const month = countedMonth(t, cutoffDay);
    return month === monthOf(t.date) ? t : { ...t, date: `${month}-01`, bookedDate: t.date };
  });
}
