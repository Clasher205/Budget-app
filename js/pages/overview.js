/** Übersicht: Kennzahlen, Auffälligkeiten, Plan vs. Ist, Monatsverlauf, Verteilung, größte Ausgaben. */
import { formatDate, formatEur, formatMonth, formatPct, monthOf, shiftMonth, todayIso } from "../logic/format.js";
import { findAnomalies } from "../logic/budget.js";
import { BOTH, categoryNames, filterTransactions, monthData, withoutTransfers } from "../data.js";
import { donut, monthBars, planActualBars } from "../charts.js";
import { esc, monthList, monthSelect, options } from "../ui.js";

export function filterBar(ctx, prefix) {
  const { state, ui } = ctx;
  const area = ui[`${prefix}Area`] || BOTH;
  const month = ui[`${prefix}Month`] || monthOf(todayIso());
  const accounts = state.accounts.filter((a) => area === BOTH || a.area === area);
  let accountId = Number(ui[`${prefix}Account`]) || null;
  if (accountId && !accounts.some((a) => a.id === accountId)) accountId = null;
  const html = `<div class="fields">
    <div class="field"><label for="${prefix}Area">Bereich</label><select id="${prefix}Area" data-bind="${prefix}Area">${options([[BOTH, "Beide"], ["Privat", "Privat"], ["Business", "Business"]], area)}</select></div>
    <div class="field"><label for="${prefix}Month">Monat</label>${monthSelect(state, `${prefix}Month`, month)}</div>
    <div class="field"><label for="${prefix}Account">Konto</label><select id="${prefix}Account" data-bind="${prefix}Account">${options(accounts.map((a) => [a.id, a.name]), accountId, "Alle Konten")}</select></div>
  </div>`;
  return { html, area, month, accountId };
}

export function keyFigureCards(figures) {
  const items = [["Einnahmen", formatEur(figures.income)], ["Ausgaben", formatEur(figures.expenses)],
    ["Saldo", formatEur(figures.balance)], ["Sparquote", formatPct(figures.savingsRate)]];
  return `<div class="grid cols-4">${items.map(([l, v]) => `<div class="metric"><div class="label">${l}</div><div class="value">${v}</div></div>`).join("")}</div>
    ${figures.savingsRate === null ? '<p class="subtle small">Sparquote nicht berechenbar: keine Einnahmen in diesem Zeitraum.</p>' : ""}
    <p class="subtle small">Umbuchungen zwischen deinen eigenen Konten zählen weder als Einnahme noch als Ausgabe.</p>`;
}

export function render(ctx) {
  const { state } = ctx;
  const head = '<div class="page-head"><h1>Übersicht</h1></div>';
  if (!state.accounts.length) return `${head}<div class="card empty">Noch keine Konten. <a href="#/einstellungen/konten">Konten anlegen</a></div>`;
  const f = filterBar(ctx, "ov");
  const { real, rows, figures } = monthData(state, f.month, f.area, f.accountId);
  const names = categoryNames(state);
  const history = withoutTransfers(filterTransactions(state, { area: f.area, accountId: f.accountId }));
  const hints = findAnomalies(rows, real, history, names);

  const first = monthList(state).at(-1);
  const months = [5, 4, 3, 2, 1, 0].map((i) => shiftMonth(f.month, -i)).filter((m) => m >= first);
  const series = months.map((m) => ({ month: m, value: -history.filter((t) => t.date.startsWith(m) && t.amount < 0).reduce((s, t) => s + t.amount, 0) }));

  const expenses = real.filter((t) => t.amount < 0);
  const byCat = new Map();
  for (const t of expenses) {
    const label = names.get(t.categoryId) || "Unkategorisiert";
    byCat.set(label, (byCat.get(label) || 0) - t.amount);
  }
  const pie = [...byCat].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  const top = [...expenses].sort((a, b) => a.amount - b.amount).slice(0, 10);

  return `${head}${f.html}
    <section class="card"><h2>${formatMonth(f.month)}</h2>${keyFigureCards(figures)}
      ${hints.length ? `<div class="box warn"><b>Auffälligkeiten</b><ul>${hints.map((h) => `<li>${esc(h)}</li>`).join("")}</ul></div>`
    : real.length ? '<div class="box good">Keine Auffälligkeiten in diesem Monat.</div>' : '<div class="box info">Keine Buchungen für diesen Filter.</div>'}
    </section>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
      <section class="card"><h3>Plan vs. Ist je Kategorie</h3>${planActualBars(rows)}
        ${f.accountId ? '<p class="subtle small">Budgets gelten pro Bereich, nicht pro Konto.</p>' : ""}</section>
      <section class="card"><h3>Ausgaben pro Monat</h3>${monthBars(series)}
        ${months.length < 6 ? '<p class="subtle small">Monate vor der ersten Buchung werden nicht angezeigt.</p>' : ""}</section>
      <section class="card"><h3>Ausgabenverteilung</h3>${donut(pie)}</section>
      <section class="card"><h3>10 größte Ausgaben</h3>${top.length ? `<ul class="list">${top.map((t) => `<li><div class="tx-main">
        <div><div class="tx-title">${esc(t.payee || "–")}</div><div class="tx-sub">${formatDate(t.date)} · ${esc(names.get(t.categoryId) || "Unkategorisiert")}</div></div>
        <div class="amount">${formatEur(t.amount)}</div></div></li>`).join("")}</ul>` : '<p class="subtle">Keine Ausgaben.</p>'}</section>
    </div>`;
}
