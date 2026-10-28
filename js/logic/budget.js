/** Budget je Kategorie: Soll-Ist, Kennzahlen, automatische Auffälligkeiten. */
import { formatDate, formatEur, percent, roundHalfUp } from "./format.js";

export const AREAS = ["Privat", "Business"];

export function budgetKey(categoryId, area) {
  return `${categoryId}|${area}`;
}

export function overrideKey(categoryId, area, month) {
  return `${categoryId}|${area}|${month}`;
}

/** Plan einer Kategorie für die gewählten Bereiche; Monats-Abweichung schlägt Standard. null = kein Budget. */
export function effectivePlan(categoryId, areas, budgets, overrides, month) {
  let total = 0;
  let found = false;
  for (const area of areas) {
    const ov = overrides[overrideKey(categoryId, area, month)];
    const value = ov ?? budgets[budgetKey(categoryId, area)];
    if (value !== undefined && value !== null) { total += value; found = true; }
  }
  return found ? total : null;
}

/** OK / knapp (ab 90 %) / überschritten; bei Einnahmen: OK / unter Plan. */
export function statusFor(plan, actual, kind) {
  if (plan === null) return "kein Budget";
  if (kind === "Einnahme") return actual >= plan ? "OK" : "unter Plan";
  if (plan === 0) return actual <= 0 ? "OK" : "überschritten";
  if (actual > plan) return "überschritten";
  if (actual * 100 >= plan * 90) return "knapp";
  return "OK";
}

/**
 * Soll-Ist je Kategorie (Umbuchungen vorher herausfiltern). Ist bei Ausgaben = Abbuchungen positiv,
 * Erstattungen mindern. Differenz = Plan − Ist bei Ausgaben, Ist − Plan bei Einnahmen.
 */
export function planVsActual(categories, transactions, areas, budgets, overrides, month) {
  const sums = new Map();
  for (const t of transactions) sums.set(t.categoryId ?? null, (sums.get(t.categoryId ?? null) || 0) + t.amount);
  const rows = [];
  for (const cat of [...categories].sort((a, b) => a.order - b.order)) {
    const raw = sums.get(cat.id) || 0;
    const actual = cat.kind === "Einnahme" ? raw : -raw;
    const plan = effectivePlan(cat.id, areas, budgets, overrides, month);
    if (plan === null && actual === 0) continue;
    let diff = null;
    let diffPct = null;
    if (plan !== null) {
      diff = cat.kind === "Einnahme" ? actual - plan : plan - actual;
      diffPct = percent(diff, plan);
    }
    rows.push({ categoryId: cat.id, category: cat.name, kind: cat.kind, plan, actual, diff, diffPct,
      status: statusFor(plan, actual, cat.kind) });
  }
  if (sums.get(null)) {
    rows.push({ categoryId: null, category: "Unkategorisiert", kind: "–", plan: null, actual: sums.get(null),
      diff: null, diffPct: null, status: "kein Budget" });
  }
  return rows;
}

/** Einnahmen, Ausgaben (positiv), Saldo, Sparquote in % (null ohne Einnahmen). */
export function keyFigures(amounts) {
  let income = 0;
  let expenses = 0;
  for (const a of amounts) { if (a > 0) income += a; else expenses -= a; }
  const balance = income - expenses;
  return { income, expenses, balance, savingsRate: income > 0 ? percent(balance, income) : null };
}

/** Hinweise: Kategorien über Plan, doppelte Abbuchungen am selben Tag, Ausreißer (> 2× Kategorie-Ø). */
export function findAnomalies(rows, monthTx, historyTx, categoryNames) {
  const hints = [];
  for (const r of rows) {
    if (r.status === "überschritten") {
      hints.push(`${r.category} liegt über Plan: ${formatEur(r.actual)} von ${formatEur(r.plan)}.`);
    }
  }
  const expenses = monthTx.filter((t) => t.amount < 0);
  const groups = new Map();
  for (const t of expenses) {
    const key = [t.accountId, t.date, t.payee, t.amount].join("|");
    groups.set(key, [...(groups.get(key) || []), t]);
  }
  for (const list of groups.values()) {
    if (list.length > 1) {
      const t = list[0];
      hints.push(`Mögliche doppelte Abbuchung: ${list.length}× ${formatEur(-t.amount)} an „${t.payee || "unbekannt"}“ `
        + `am ${formatDate(t.date)}.`);
    }
  }
  const stats = new Map();
  for (const t of historyTx) {
    if (t.amount >= 0 || t.categoryId === null || t.categoryId === undefined) continue;
    const s = stats.get(t.categoryId) || { sum: 0, count: 0 };
    s.sum += -t.amount; s.count++;
    stats.set(t.categoryId, s);
  }
  for (const t of expenses) {
    const s = stats.get(t.categoryId);
    if (!s || s.count < 3) continue;
    const avg = s.sum / s.count;
    if (-t.amount > 2 * avg) {
      hints.push(`Ungewöhnlich hohe Ausgabe in ${categoryNames.get(t.categoryId) || "?"}: ${formatEur(-t.amount)} `
        + `an „${t.payee || "unbekannt"}“ am ${formatDate(t.date)} (Ø ${formatEur(roundHalfUp(avg))}).`);
    }
  }
  return hints;
}
