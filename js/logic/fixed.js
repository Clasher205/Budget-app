/** Fixkosten: Fälligkeiten und Abo-Erkennung aus wiederkehrenden Abbuchungen. */
import { addDays, addMonths, monthOf, shiftMonth } from "./format.js";

export const RHYTHMS = { monatlich: 1, vierteljährlich: 3, jährlich: 12 };

/** Alle Fälligkeiten in [start, end]; vergangene Fälligkeiten werden im Rhythmus fortgeschrieben. */
export function occurrences(nextDue, rhythm, start, end) {
  const step = RHYTHMS[rhythm];
  const anchor = Number(nextDue.slice(8, 10));
  const result = [];
  for (let n = 0, current = nextDue; current <= end; n++, current = addMonths(nextDue, step * n, anchor)) {
    if (current >= start) result.push(current);
  }
  return result;
}

/** Anstehende Fixkosten der nächsten `days` Tage, nach Datum sortiert. */
export function upcoming(fixedCosts, todayIso, days = 90) {
  const end = addDays(todayIso, days);
  const items = [];
  for (const f of fixedCosts) {
    for (const due of occurrences(f.nextDue, f.rhythm, todayIso, end)) items.push({ ...f, due });
  }
  return items.sort((a, b) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name));
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function longestConsecutive(months) {
  let best = [];
  let run = [];
  for (const m of [...new Set(months)].sort()) {
    run = run.length && shiftMonth(run[run.length - 1], 1) === m ? [...run, m] : [m];
    if (run.length > best.length) best = run;
  }
  return best;
}

/**
 * Abo-Vorschläge: gleicher Empfänger, ähnlicher Betrag (±10 %, mind. 1 €) in ≥ 3 aufeinanderfolgenden Monaten,
 * etwa einmal pro Monat. `ignored` sind Empfänger (klein geschrieben), die nicht mehr vorgeschlagen werden.
 */
export function detectSubscriptions(transactions, ignored = []) {
  const skip = new Set(ignored.map((n) => n.toLocaleLowerCase("de").trim()));
  const groups = new Map();
  for (const t of transactions) {
    if (t.amount >= 0 || t.transfer || !t.payee.trim()) continue;
    const key = t.payee.toLocaleLowerCase("de").trim();
    if (skip.has(key)) continue;
    groups.set(key, [...(groups.get(key) || []), t]);
  }
  const suggestions = [];
  for (const [key, list] of groups) {
    const months = new Set(list.map((t) => monthOf(t.date)));
    if (list.length > 1.5 * months.size) continue;
    const ref = median(list.map((t) => -t.amount));
    const tolerance = Math.max(ref * 0.1, 100);
    const similar = list.filter((t) => Math.abs(-t.amount - ref) <= tolerance);
    const run = longestConsecutive(similar.map((t) => monthOf(t.date)));
    if (run.length < 3) continue;
    const inRun = similar.filter((t) => run.includes(monthOf(t.date)));
    const last = inRun.map((t) => t.date).sort().at(-1);
    const avg = Math.round(inRun.reduce((s, t) => s - t.amount, 0) / inRun.length);
    const cats = inRun.map((t) => t.categoryId).filter((c) => c !== null && c !== undefined);
    suggestions.push({
      key, payee: list[0].payee, amount: avg, months: run, lastDate: last, nextDue: addMonths(last, 1),
      accountId: inRun.at(-1).accountId, categoryId: cats.length ? mode(cats) : null,
    });
  }
  return suggestions.sort((a, b) => a.payee.localeCompare(b.payee, "de"));
}

function mode(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}
