/** Budget je Kategorie: Soll-Ist-Vergleich und Budgets bearbeiten. */
import { formatAmountInput, formatEur, formatMonth, formatPct, monthOf, todayIso } from "../logic/format.js";
import { parseAmount } from "../logic/csv.js";
import { AREAS, budgetKey, overrideKey } from "../logic/budget.js";
import { setBudget, setBudgetOverride } from "../state.js";
import { BOTH, monthData, sortedCategories } from "../data.js";
import { keyFigureCards } from "./overview.js";
import { esc, monthSelect, options } from "../ui.js";

const STATUS_CLASS = { OK: "good", knapp: "warn", "überschritten": "bad", "unter Plan": "warn", "kein Budget": "info" };

export function budgetTable(rows) {
  if (!rows.length) return '<p class="subtle">Für diesen Monat gibt es weder Budgets noch Buchungen.</p>';
  const missing = rows.filter((r) => r.plan === null && r.categoryId !== null).map((r) => r.category);
  return `<div class="table-wrap"><table><thead><tr><th>Kategorie</th><th class="num">Plan</th><th class="num">Ist</th>
    <th class="num">Differenz</th><th class="num">%</th><th>Status</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${esc(r.category)}<div class="subtle small">${esc(r.kind)}</div></td><td class="num">${formatEur(r.plan)}</td>
      <td class="num">${formatEur(r.actual)}</td><td class="num">${formatEur(r.diff)}</td><td class="num">${formatPct(r.diffPct)}</td>
      <td><span class="pill ${STATUS_CLASS[r.status] || "info"}">${esc(r.status)}</span></td></tr>`).join("")}</tbody></table></div>
    ${missing.length ? `<p class="subtle small">Kein Budget hinterlegt für: ${missing.map(esc).join(", ")}. Differenz und Status entfallen dort.</p>` : ""}
    <p class="subtle small">Differenz = Plan − Ist bei Ausgaben (positiv = noch verfügbar), Ist − Plan bei Einnahmen. „knapp“ ab 90 % des Plans.</p>`;
}

function compare(ctx) {
  const { state, ui } = ctx;
  const area = ui.bcArea || BOTH;
  const month = ui.bcMonth || monthOf(todayIso());
  const { rows, figures } = monthData(state, month, area, null);
  return `<div class="fields"><div class="field"><label for="bcArea">Bereich</label><select id="bcArea" data-bind="bcArea">${options([[BOTH, "Beide"], ["Privat", "Privat"], ["Business", "Business"]], area)}</select></div>
    <div class="field"><label for="bcMonth">Monat</label>${monthSelect(state, "bcMonth", month)}</div></div>
    <section class="card"><h2>${formatMonth(month)}</h2>${keyFigureCards(figures)}</section><section class="card">${budgetTable(rows)}</section>`;
}

function edit(ctx) {
  const { state, ui } = ctx;
  const area = ui.beArea || "Privat";
  const month = ui.beMonth || monthOf(todayIso());
  const rows = sortedCategories(state).map((c) => `<tr><td>${esc(c.name)}<div class="subtle small">${c.kind}</div></td>
    <td><input type="text" inputmode="decimal" name="std-${c.id}" value="${formatAmountInput(state.budgets[budgetKey(c.id, area)] ?? null)}" placeholder="–" aria-label="Standardbudget ${esc(c.name)}"></td>
    <td><input type="text" inputmode="decimal" name="ov-${c.id}" value="${formatAmountInput(state.budgetOverrides[overrideKey(c.id, area, month)] ?? null)}" placeholder="–" aria-label="Abweichung ${esc(c.name)}"></td></tr>`).join("");
  return `<div class="fields"><div class="field"><label for="beArea">Bereich</label><select id="beArea" data-bind="beArea">${options(AREAS.map((a) => [a, a]), area)}</select></div>
    <div class="field"><label for="beMonth">Abweichung für Monat</label>${monthSelect(state, "beMonth", month)}</div></div>
    <form class="card" id="budgetForm"><p class="subtle small">Beträge in Euro, z. B. 250 oder 49,90. Das Standardbudget gilt jeden Monat,
      eine Abweichung ersetzt es nur im gewählten Monat. Leer = kein Budget.</p>
      <div class="table-wrap"><table><thead><tr><th>Kategorie</th><th>Standard (€)</th><th>${formatMonth(month)} (€)</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="box bad" id="budgetError" hidden></div>
      <button class="primary" style="margin-top:12px">Budget speichern</button></form>`;
}

export function render(ctx) {
  const tab = ctx.ui.budgetTab || "compare";
  return `<div class="page-head"><div><h1>Budget je Kategorie</h1><div class="subtle">Ergänzend zu den Töpfen: Wofür geht das Geld weg?</div></div></div>
    <div class="tabs"><button data-action="tab" data-tab="compare" class="${tab === "compare" ? "active" : ""}">Soll-Ist</button>
    <button data-action="tab" data-tab="edit" class="${tab === "edit" ? "active" : ""}">Budget bearbeiten</button></div>
    ${tab === "compare" ? compare(ctx) : edit(ctx)}`;
}

export function bind(root, ctx) {
  root.addEventListener("click", (e) => {
    const el = e.target.closest('[data-action="tab"]');
    if (el) { ctx.ui.budgetTab = el.dataset.tab; ctx.rerender(); }
  });
  root.querySelector("#budgetForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const area = ctx.ui.beArea || "Privat";
    const month = ctx.ui.beMonth || monthOf(todayIso());
    const values = [];
    try {
      for (const c of ctx.state.categories) {
        const std = String(form.get(`std-${c.id}`) || "").trim();
        const ov = String(form.get(`ov-${c.id}`) || "").trim();
        values.push([c.id, std ? Math.abs(parseAmount(std)) : null, ov ? Math.abs(parseAmount(ov)) : null]);
      }
    } catch (err) {
      const box = root.querySelector("#budgetError");
      box.textContent = `Bitte prüfen: ${err.message}`;
      box.hidden = false;
      return;
    }
    await ctx.commit((s) => {
      for (const [id, std, ov] of values) { setBudget(s, id, area, std); setBudgetOverride(s, id, area, month, ov); }
    }, "Budget gespeichert.");
  });
}
