/** Buchungen: offene (unkategorisierte) zuordnen, alle Buchungen durchsuchen und korrigieren. */
import { formatDate, formatEur } from "../logic/format.js";
import { addRule, deleteTransaction, setCategory, setTransfer } from "../state.js";
import { accountNames, filterTransactions, sortedCategories } from "../data.js";
import { filterBar } from "./overview.js";
import { confirmDialog, esc, options, toast } from "../ui.js";

const PAGE_SIZE = 150;

function categorySelect(state, tx, action) {
  return `<select data-change="${action}" data-id="${tx.id}" aria-label="Kategorie">
    ${options(sortedCategories(state).map((c) => [c.id, c.name]), tx.categoryId, "– Kategorie wählen –")}</select>`;
}

function openList(state) {
  const names = accountNames(state);
  const open = state.transactions.filter((t) => t.categoryId === null && !t.transfer)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!open.length) return '<div class="card empty">Alle Buchungen sind kategorisiert. 🎉</div>';
  const shown = open.slice(0, PAGE_SIZE);
  return `<section class="card"><p class="subtle">${open.length} Buchungen ohne Kategorie. Kategorie wählen, dann wird sie sofort gespeichert.
    Ist der Haken gesetzt, entsteht dabei eine Regel und alle Buchungen dieses Empfängers werden künftig automatisch so zugeordnet.</p>
    <ul class="list">${shown.map((t) => `<li>
      <div class="tx-main"><div><div class="tx-title">${esc(t.payee || "–")}</div>
        <div class="tx-sub">${formatDate(t.date)} · ${esc(names.get(t.accountId))}${t.purpose ? ` · ${esc(t.purpose)}` : ""}</div></div>
        <div class="amount ${t.amount > 0 ? "pos" : ""}">${formatEur(t.amount)}</div></div>
      <div class="tx-controls">${categorySelect(state, t, "assign")}
        ${t.payee ? `<label class="check small" title="Regel erstellen"><input type="checkbox" id="rule-${t.id}" checked> Regel</label>` : "<span></span>"}</div>
    </li>`).join("")}</ul>${open.length > PAGE_SIZE ? `<p class="subtle small">Die ersten ${PAGE_SIZE} werden angezeigt.</p>` : ""}</section>`;
}

function allList(ctx) {
  const { state, ui } = ctx;
  const f = filterBar(ctx, "tx");
  const query = (ui.txSearch || "").trim().toLowerCase();
  let txs = filterTransactions(state, { month: ui.txAllMonths ? null : f.month, area: f.area, accountId: f.accountId });
  if (query) txs = txs.filter((t) => `${t.payee} ${t.purpose}`.toLowerCase().includes(query));
  const limit = ui.txLimit || PAGE_SIZE;
  const names = accountNames(state);
  return `${f.html}<div class="fields">
      <div class="field"><label for="txSearch">Suche (Empfänger, Zweck)</label><input type="search" id="txSearch" data-bind="txSearch" value="${esc(ui.txSearch || "")}" placeholder="z. B. Netflix"></div>
      <div class="field" style="align-self:end"><label class="check"><input type="checkbox" data-bind-check="txAllMonths" ${ui.txAllMonths ? "checked" : ""}> alle Monate</label></div></div>
    <section class="card">${txs.length ? `<p class="subtle small">${txs.length} Buchungen. Kategorie ändern = manuell (wird nie von Regeln überschrieben).
      „Umbuchung“ = Geld zwischen deinen eigenen Konten.</p>
    <ul class="list">${txs.slice(0, limit).map((t) => `<li>
      <div class="tx-main"><div><div class="tx-title">${esc(t.payee || "–")}</div>
        <div class="tx-sub">${formatDate(t.date)} · ${esc(names.get(t.accountId))}${t.purpose ? ` · ${esc(t.purpose)}` : ""}${t.manual ? " · manuell" : ""}</div></div>
        <div class="amount ${t.amount > 0 ? "pos" : ""}">${formatEur(t.amount)}</div></div>
      <div class="tx-controls">${categorySelect(state, t, "recat")}
        <label class="check small"><input type="checkbox" data-change="transfer" data-id="${t.id}" ${t.transfer ? "checked" : ""}> Umbuchung</label></div>
      <button class="link small" data-action="delete" data-id="${t.id}">Buchung löschen</button>
    </li>`).join("")}</ul>
    ${txs.length > limit ? `<button data-action="more">Weitere ${Math.min(PAGE_SIZE, txs.length - limit)} anzeigen</button>` : ""}`
    : '<p class="empty">Keine Buchungen für diesen Filter.</p>'}</section>`;
}

export function render(ctx) {
  const tab = ctx.ui.txTab || "open";
  const openCount = ctx.state.transactions.filter((t) => t.categoryId === null && !t.transfer).length;
  return `<div class="page-head"><h1>Buchungen</h1></div>
    <div class="tabs"><button data-action="tab" data-tab="open" class="${tab === "open" ? "active" : ""}">Offen (${openCount})</button>
    <button data-action="tab" data-tab="all" class="${tab === "all" ? "active" : ""}">Alle Buchungen</button></div>
    ${tab === "open" ? openList(ctx.state) : allList(ctx)}`;
}

export function bind(root, ctx) {
  root.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    if (action === "tab") { ctx.ui.txTab = el.dataset.tab; ctx.rerender(); }
    if (action === "more") { ctx.ui.txLimit = (ctx.ui.txLimit || PAGE_SIZE) + PAGE_SIZE; ctx.rerender(); }
    if (action === "delete") {
      if (await confirmDialog("Diese Buchung endgültig löschen? Beim nächsten Import derselben Datei käme sie wieder.", { okText: "Löschen", danger: true })) {
        await ctx.commit((s) => deleteTransaction(s, Number(el.dataset.id)), "Buchung gelöscht.");
      }
    }
  });
  root.addEventListener("change", async (e) => {
    const el = e.target.closest("[data-change]");
    if (!el) return;
    const id = Number(el.dataset.id);
    if (el.dataset.change === "assign" && el.value) {
      const catId = Number(el.value);
      const asRule = root.querySelector(`#rule-${id}`)?.checked;
      const tx = ctx.state.transactions.find((t) => t.id === id);
      await ctx.commit((s) => {
        if (asRule && tx.payee && !s.rules.some((r) => r.keyword.toLowerCase() === tx.payee.toLowerCase())) {
          const changed = addRule(s, tx.payee, catId);
          toast(`Regel „${tx.payee}“ erstellt, ${changed} Buchungen zugeordnet.`);
        } else {
          setCategory(s, id, catId);
        }
      });
    }
    if (el.dataset.change === "recat") {
      await ctx.commit((s) => setCategory(s, id, el.value ? Number(el.value) : null), "Kategorie gespeichert.");
    }
    if (el.dataset.change === "transfer") {
      await ctx.commit((s) => setTransfer(s, id, el.checked), el.checked ? "Als Umbuchung markiert." : "Keine Umbuchung mehr.");
    }
  });
}
