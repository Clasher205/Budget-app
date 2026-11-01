/** Regelbasierte Kategorisierung und Erkennung von Umbuchungen zwischen eigenen Konten. */
import { daysBetween } from "./format.js";

export function sortRules(rules) {
  return [...rules].sort((a, b) => a.priority - b.priority || a.id - b.id);
}

function matches(rule, payee, purpose) {
  const keyword = (rule.keyword || "").trim().toLocaleLowerCase("de");
  return Boolean(keyword) && `${payee || ""}\n${purpose || ""}`.toLocaleLowerCase("de").includes(keyword);
}

/** Kategorie der ersten passenden Kategorie-Regel (Suche in Empfänger und Verwendungszweck, ohne Groß-/Kleinschreibung). */
export function matchCategory(payee, purpose, rules) {
  const rule = sortRules(rules).find((r) => !r.transfer && matches(r, payee, purpose));
  return rule ? rule.categoryId : null;
}

/** true, wenn eine Umbuchungs-Regel passt (z. B. „Trade Republic“ = Geld an ein eigenes Konto). */
export function matchTransferRule(payee, purpose, rules) {
  return rules.some((r) => r.transfer && matches(r, payee, purpose));
}

/**
 * Wendet alle Regeln neu an: Kategorien (außer manuell gesetzten) und Umbuchungs-Regeln
 * (außer manuell festgelegten Umbuchungen). Gibt die Anzahl geänderter Buchungen zurück.
 */
export function applyRules(transactions, rules) {
  let changed = 0;
  for (const tx of transactions) {
    let touched = false;
    if (!tx.manual) {
      const next = matchCategory(tx.payee, tx.purpose, rules);
      if (next !== tx.categoryId) { tx.categoryId = next; touched = true; }
    }
    if (!tx.transferManual) {
      const hit = matchTransferRule(tx.payee, tx.purpose, rules);
      if (hit && !tx.transferByRule) {
        tx.transferByRule = true;
        if (!tx.transfer) { tx.transfer = true; touched = true; }
      } else if (!hit && tx.transferByRule) {
        tx.transferByRule = false;
        if (!tx.transferPair) { tx.transfer = false; touched = true; }
      }
    }
    if (touched) changed++;
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
    .filter((t) => !t.transferPair && !t.transferManual && t.amount !== 0)
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
      out.transferPair = true; best.transferPair = true;
      pairs++;
    }
  }
  return pairs;
}
