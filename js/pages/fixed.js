/** Fixkosten: nächste 90 Tage, verwalten, Abo-Vorschläge. */
import { formatAmountInput, formatDate, formatEur, todayIso } from "../logic/format.js";
import { parseAmount } from "../logic/csv.js";
import { AREAS } from "../logic/budget.js";
import { RHYTHMS, detectSubscriptions, upcoming } from "../logic/fixed.js";
import { areaBalance, deleteFixedCost, saveFixedCost } from "../state.js";
import { accountMap, categoryNames, sortedCategories } from "../data.js";
import { confirmDialog, esc, formDialog, options } from "../ui.js";

function nextDays(state) {
  const items = upcoming(state.fixedCosts, todayIso(), 90);
  if (!items.length) return '<p class="subtle">Keine Fixkosten in den nächsten 90 Tagen.</p>';
  const names = categoryNames(state);
  const sums = AREAS.map((area) => {
    const total = items.filter((i) => i.area === area).reduce((s, i) => s + i.amount, 0);
    if (!total) return "";
    const balance = areaBalance(state, area);
    if (balance === null) {
      return `<div class="box info"><b>${area}:</b> anstehend ${formatEur(total)}. Verfügbarer Saldo unbekannt: Hinterlege bei allen Konten dieses Bereichs den Anfangssaldo
        (<a href="#/einstellungen/konten">Konten</a>), dann vergleicht die App.</div>`;
    }
    return total > balance
      ? `<div class="box bad"><b>${area}:</b> anstehend ${formatEur(total)} übersteigt den verfügbaren Saldo von ${formatEur(balance)} (Fehlbetrag ${formatEur(total - balance)}).</div>`
      : `<div class="box good"><b>${area}:</b> anstehend ${formatEur(total)}, verfügbarer Saldo ${formatEur(balance)}.</div>`;
  }).join("");
  return `<ul class="list">${items.map((i) => `<li><div class="tx-main"><div><div class="tx-title">${esc(i.name)}</div>
    <div class="tx-sub">${formatDate(i.due)} · ${i.area}${i.categoryId ? ` · ${esc(names.get(i.categoryId) || "")}` : ""}</div></div>
    <div class="amount">${formatEur(i.amount)}</div></div></li>`).join("")}</ul>${sums}
    <p class="subtle small">Vergangene Fälligkeiten werden automatisch im Rhythmus fortgeschrieben.</p>`;
}

function manage(state) {
  const names = categoryNames(state);
  const list = [...state.fixedCosts].sort((a, b) => a.name.localeCompare(b.name, "de"));
  return `${list.length ? `<ul class="list">${list.map((f) => `<li><div class="tx-main"><div><div class="tx-title">${esc(f.name)}</div>
    <div class="tx-sub">${f.rhythm} · nächste ${formatDate(f.nextDue)} · ${f.area}${f.categoryId ? ` · ${esc(names.get(f.categoryId) || "")}` : ""}</div></div>
    <div class="amount">${formatEur(f.amount)}</div></div>
    <div class="row" style="margin-top:6px"><button class="link" data-action="edit" data-id="${f.id}">Bearbeiten</button>
    <button class="link" data-action="remove" data-id="${f.id}" style="color:var(--bad)">Löschen</button></div></li>`).join("")}</ul>`
    : '<p class="subtle">Noch keine Fixkosten angelegt.</p>'}
    <button class="primary" data-action="add">+ Fixkosten hinzufügen</button>`;
}

function suggestions(state) {
  const existing = state.fixedCosts.map((f) => f.name.toLowerCase());
  const list = detectSubscriptions(state.transactions, [...state.ignoredSubscriptions, ...existing]);
  if (!list.length) return '<p class="subtle">Keine neuen wiederkehrenden Abbuchungen erkannt.</p>';
  const names = categoryNames(state);
  return `<p class="subtle small">Gleicher Empfänger, ähnlicher Betrag (±10 %), etwa einmal im Monat, mindestens 3 Monate in Folge.</p>
    <ul class="list">${list.map((s) => `<li><div class="tx-main"><div><div class="tx-title">${esc(s.payee)}</div>
    <div class="tx-sub">${s.months.length} Monate in Folge · zuletzt ${formatDate(s.lastDate)} · ${esc(names.get(s.categoryId) || "ohne Kategorie")}</div></div>
    <div class="amount">Ø ${formatEur(s.amount)}</div></div>
    <div class="row" style="margin-top:6px"><button data-action="take" data-key="${esc(s.key)}">Als Fixkosten übernehmen</button>
    <button class="link" data-action="ignore" data-key="${esc(s.key)}">Kein Abo</button></div></li>`).join("")}</ul>`;
}

function fixedForm(state, item) {
  return `<div class="fields">
    <div class="field" style="grid-column:1/-1"><label>Name</label><input type="text" name="name" required value="${esc(item.name || "")}"></div>
    <div class="field"><label>Betrag (€)</label><input type="text" inputmode="decimal" name="amount" required value="${formatAmountInput(item.amount ?? null)}" placeholder="z. B. 12,99"></div>
    <div class="field"><label>Rhythmus</label><select name="rhythm">${options(Object.keys(RHYTHMS).map((r) => [r, r]), item.rhythm || "monatlich")}</select></div>
    <div class="field"><label>Nächste Fälligkeit</label><input type="date" name="nextDue" required value="${item.nextDue || todayIso()}"></div>
    <div class="field"><label>Bereich</label><select name="area">${options(AREAS.map((a) => [a, a]), item.area || "Privat")}</select></div>
    <div class="field" style="grid-column:1/-1"><label>Kategorie</label><select name="categoryId">${options(sortedCategories(state).map((c) => [c.id, c.name]), item.categoryId, "– keine –")}</select></div>
  </div>`;
}

function openForm(ctx, item) {
  formDialog(item.id ? "Fixkosten bearbeiten" : "Fixkosten hinzufügen", fixedForm(ctx.state, item), async (form) => {
    const amount = Math.abs(parseAmount(String(form.get("amount") || "")));
    const data = { id: item.id, name: String(form.get("name") || ""), amount, rhythm: form.get("rhythm"),
      nextDue: form.get("nextDue"), area: form.get("area"), categoryId: form.get("categoryId") ? Number(form.get("categoryId")) : null };
    await ctx.commit((s) => saveFixedCost(s, data), "Fixkosten gespeichert.");
  });
}

export function render(ctx) {
  const { state } = ctx;
  const tab = ctx.ui.fixedTab || "next";
  const tabs = [["next", "Nächste 90 Tage"], ["manage", `Verwalten (${state.fixedCosts.length})`], ["suggest", "Abo-Vorschläge"]];
  const body = tab === "next" ? nextDays(state) : tab === "manage" ? manage(state) : suggestions(state);
  return `<div class="page-head"><h1>Fixkosten</h1></div>
    <div class="tabs">${tabs.map(([k, l]) => `<button data-action="tab" data-tab="${k}" class="${tab === k ? "active" : ""}">${l}</button>`).join("")}</div>
    <section class="card">${body}</section>`;
}

export function bind(root, ctx) {
  root.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const { state } = ctx;
    const action = el.dataset.action;
    if (action === "tab") { ctx.ui.fixedTab = el.dataset.tab; ctx.rerender(); }
    if (action === "add") openForm(ctx, {});
    if (action === "edit") openForm(ctx, state.fixedCosts.find((f) => f.id === Number(el.dataset.id)));
    if (action === "remove" && await confirmDialog("Diesen Fixkosten-Posten löschen?", { okText: "Löschen", danger: true })) {
      await ctx.commit((s) => deleteFixedCost(s, Number(el.dataset.id)), "Gelöscht.");
    }
    if (action === "take" || action === "ignore") {
      const existing = state.fixedCosts.map((f) => f.name.toLowerCase());
      const s = detectSubscriptions(state.transactions, [...state.ignoredSubscriptions, ...existing]).find((x) => x.key === el.dataset.key);
      if (!s) return;
      if (action === "ignore") {
        await ctx.commit((st) => { st.ignoredSubscriptions.push(s.key); }, `„${s.payee}“ wird nicht mehr vorgeschlagen.`);
      } else {
        const area = accountMap(state).get(s.accountId)?.area || "Privat";
        openForm(ctx, { name: s.payee, amount: s.amount, rhythm: "monatlich", nextDue: s.nextDue, area, categoryId: s.categoryId });
      }
    }
  });
}
