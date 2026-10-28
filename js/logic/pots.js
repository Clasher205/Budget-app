/** Budget-Töpfe pro Konto: Kurs im Monat, Rest pro Tag, Monatsvergleich. */
import { daysInMonth, formatEur, monthOf } from "./format.js";

export const POT_TYPES = ["Ausgaben", "Sparen"];

/** [vergangene Tage inkl. heute, Tage im Monat]; vergangene Monate voll, zukünftige 0. */
export function monthProgress(month, todayIso) {
  const days = daysInMonth(month);
  const current = monthOf(todayIso);
  if (month < current) return [days, days];
  if (month > current) return [0, days];
  return [Number(todayIso.slice(8, 10)), days];
}

/**
 * Relevante Beträge eines Topfs (Cent, positiv = verbraucht bzw. gespart).
 * Ausgaben-Topf: nur Abbuchungen, ohne Umbuchungen und ausgeschlossene Kategorien.
 * Spar-Topf: Netto-Zufluss inkl. Umbuchungen.
 */
export function potAmounts(transactions, potType, excluded = []) {
  if (potType === "Sparen") return transactions.map((t) => ({ date: t.date, value: t.amount }));
  const skip = new Set(excluded);
  return transactions
    .filter((t) => t.amount < 0 && !t.transfer && !skip.has(t.categoryId))
    .map((t) => ({ date: t.date, value: -t.amount }));
}

/** Kurs eines Topfs. `ahead` > 0 heißt: besser als das Soll bis heute. */
export function potStatus(potType, budget, month, amounts, todayIso) {
  const [day, days] = monthProgress(month, todayIso);
  const daily = new Array(days).fill(0);
  for (const a of amounts) {
    const idx = Number(a.date.slice(8, 10)) - 1;
    if (idx >= 0 && idx < days) daily[idx] += a.value;
  }
  const cumulative = [];
  let running = 0;
  for (let i = 0; i < day; i++) { running += daily[i]; cumulative.push(running); }
  const used = daily.reduce((s, v) => s + v, 0);
  const ideal = Math.round((budget * day) / days);
  const remaining = budget - used;
  const perDayNominal = Math.round(budget / days);
  const current = monthOf(todayIso);
  const finished = month < current;
  let perDayRemaining = null;
  if (month === current) perDayRemaining = Math.round(Math.max(remaining, 0) / (days - day + 1));
  else if (month > current) perDayRemaining = perDayNominal;

  let ahead;
  let status;
  let level;
  if (potType === "Sparen") {
    ahead = used - ideal;
    if (used >= budget) [status, level] = ["Sparziel erreicht", "good"];
    else if (finished) [status, level] = [`Sparziel verfehlt (es fehlen ${formatEur(budget - used)})`, "bad"];
    else [status, level] = [`Noch ${formatEur(budget - used)} bis zum Sparziel`, "info"];
  } else {
    ahead = ideal - used;
    if (used > budget) [status, level] = [`Budget überschritten um ${formatEur(used - budget)}`, "bad"];
    else if (finished) [status, level] = [`Budget eingehalten (${formatEur(remaining)} übrig)`, "good"];
    else if (day === 0) [status, level] = ["Monat hat noch nicht begonnen", "info"];
    else if (used <= ideal) [status, level] = [`Im Kurs: ${formatEur(ahead)} unter dem Soll bis heute`, "good"];
    else if (used * 100 <= ideal * 110) [status, level] = [`Knapp über Kurs: ${formatEur(-ahead)} über dem Soll`, "warn"];
    else [status, level] = [`Über Kurs: ${formatEur(-ahead)} über dem Soll bis heute`, "bad"];
  }
  return { potType, budget, used, day, days, ideal, ahead, remaining, perDayNominal, perDayRemaining,
    status, level, cumulative };
}

/** Monatsvergleich. `diff` > 0: Budget unterschritten bzw. Sparziel übertroffen; `kept` null = Monat läuft. */
export function potHistory(potType, budgetsByMonth, transactions, excluded, todayIso) {
  const current = monthOf(todayIso);
  const result = [];
  for (const [month, budget] of budgetsByMonth) {
    if (budget === null || budget === undefined) continue;
    const monthTx = transactions.filter((t) => t.date.startsWith(month));
    const used = potAmounts(monthTx, potType, excluded).reduce((s, a) => s + a.value, 0);
    const diff = potType === "Sparen" ? used - budget : budget - used;
    result.push({ month, budget, used, diff, kept: month >= current ? null : diff >= 0 });
  }
  return result;
}
