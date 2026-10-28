/** Regelbasierte Kategorisierung und Erkennung von Umbuchungen zwischen eigenen Konten. */
import { daysBetween } from "./format.js";

export function sortRules(rules) {
  return [...rules].sort((a, b) => a.priority - b.priority || a.id - b.id);
}

/** Kategorie der ersten passenden Regel (Suche in Empfänger und Verwendungszweck, ohne Groß-/Kleinschreibung). */
export function matchCategory(payee, purpose, rules) {
  const haystack = `${payee || ""}\n${purpose || ""}`.toLocaleLowerCase("de");
  for (const rule of sortRules(rules)) {
    const keyword = (rule.keyword || "").trim().toLocaleLowerCase("de");
    if (keyword && haystack.includes(keyword)) return rule.categoryId;
  }
  return null;
}

/** Kategorisiert alle nicht manuell gesetzten Buchungen neu; gibt die Anzahl Änderungen zurück. */
export function applyRules(transactions, rules) {
  let changed = 0;
  for (const tx of transactions) {
    if (tx.manual) continue;
    const next = matchCategory(tx.payee, tx.purpose, rules);
    if (next !== tx.categoryId) { tx.categoryId = next; changed++; }
  }
  return changed;
}

/**
 * Umbuchungen erkennen: gleicher Betrag mit umgekehrtem Vorzeichen, anderes eigenes Konto,
 * höchstens `windowDays` Tage auseinander. Manuell festgelegte Buchungen bleiben unberührt.
 * Gibt die Anzahl neu erkannter Paare zurück.
 */
export function matchTransfers(transactions, windowDays = 3) {
  const open = transactions
    .filter((t) => !t.transfer && !t.transferManual && t.amount !== 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const incoming = new Map();
  for (const t of open) if (t.amount > 0) {
    if (!incoming.has(t.amount)) incoming.set(t.amount, []);
    incoming.get(t.amount).push(t);
  }
  const used = new Set();
  let pairs = 0;
  for (const out of open) {
    if (out.amount >= 0 || used.has(out.id)) continue;
    let best = null;
    let bestGap = null;
    for (const cand of incoming.get(-out.amount) || []) {
      if (used.has(cand.id) || cand.accountId === out.accountId) continue;
      const gap = Math.abs(daysBetween(out.date, cand.date));
      if (gap <= windowDays && (bestGap === null || gap < bestGap)) { best = cand; bestGap = gap; }
    }
    if (best) {
      used.add(out.id); used.add(best.id);
      out.transfer = true; best.transfer = true;
      pairs++;
    }
  }
  return pairs;
}
