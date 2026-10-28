/** Einstellungen: Konten, Töpfe, Kategorien, Regeln, Sicherung & Abgleich, Export. */
import { formatAmountInput, formatDateTime, formatEur, formatMonth, monthOf, todayIso } from "../logic/format.js";
import { parseAmount } from "../logic/csv.js";
import { AREAS } from "../logic/budget.js";
import { POT_TYPES } from "../logic/pots.js";
import { reportCsv, reportTables, reportXlsx } from "../logic/exportfile.js";
import { addAccount, addCategory, addRule, backupPayload, deleteAccount, deleteCategory, deleteRule, parseBackup,
  reapplyRules, setPot, setPotOverride } from "../state.js";
import { accountNames, categoryNames, monthData, sortedCategories } from "../data.js";
import { downloadFile, readFileBytes, requestPersistence, shareFile } from "../storage.js";
import { filterBar } from "./overview.js";
import { budgetTable } from "./budget.js";
import { confirmDialog, esc, formDialog, icon, monthSelect, options, toast } from "../ui.js";

export const SECTIONS = [
  ["konten", "Konten", "settings"], ["toepfe", "Töpfe", "course"], ["kategorien", "Kategorien", "list"],
  ["regeln", "Regeln", "list"], ["sicherung", "Sicherung & Abgleich", "save"], ["export", "Monatsbericht exportieren", "file"],
];

function optionalAmount(value) {
  const s = String(value ?? "").trim();
  return s ? parseAmount(s) : null;
}

// Konten

function accountsSection(state) {
  const counts = new Map();
  for (const t of state.transactions) counts.set(t.accountId, (counts.get(t.accountId) || 0) + 1);
  return `<section class="card"><h2>Konten</h2>
    <p class="subtle small">Bereich Privat oder Business. Der Anfangssaldo (Kontostand vor der ersten importierten Buchung) ist optional
      und wird nur für den Fixkosten-Vergleich gebraucht.</p>
    ${state.accounts.length ? `<ul class="list">${state.accounts.map((a) => `<li><div class="tx-main"><div><div class="tx-title">${esc(a.name)}</div>
      <div class="tx-sub">${a.area} · ${counts.get(a.id) || 0} Buchungen · Anfangssaldo ${a.openingBalance === null ? "nicht hinterlegt" : formatEur(a.openingBalance)}
      ${a.potType ? ` · Topf: ${a.potType}` : ""}</div></div></div>
      <div class="row" style="margin-top:6px"><button class="link" data-action="edit-account" data-id="${a.id}">Bearbeiten</button>
      <button class="link" data-action="delete-account" data-id="${a.id}" style="color:var(--bad)">Löschen</button></div></li>`).join("")}</ul>`
    : '<p class="subtle">Noch keine Konten.</p>'}
    <button class="primary" data-action="add-account">+ Konto hinzufügen</button></section>`;
}

function accountForm(account = {}) {
  return `<div class="fields"><div class="field" style="grid-column:1/-1"><label>Name</label>
    <input type="text" name="name" required value="${esc(account.name || "")}" placeholder="z. B. Essenskonto"></div>
    <div class="field"><label>Bereich</label><select name="area">${options(AREAS.map((a) => [a, a]), account.area || "Privat")}</select></div>
    <div class="field"><label>Anfangssaldo (optional)</label><input type="text" inputmode="decimal" name="opening" value="${formatAmountInput(account.openingBalance ?? null)}" placeholder="z. B. 1.250,00"></div></div>`;
}

// Töpfe

function potsSection(ctx) {
  const { state, ui } = ctx;
  if (!state.accounts.length) return '<section class="card"><h2>Töpfe</h2><p>Lege zuerst Konten an.</p></section>';
  const month = ui.potMonth || monthOf(todayIso());
  const cats = sortedCategories(state);
  return `<section class="card"><h2>Töpfe einrichten</h2>
    <p class="subtle small"><b>Ausgaben-Topf:</b> so viel darf im Monat von diesem Konto ausgegeben werden (z. B. Essen 250 €).
      <b>Sparen:</b> so viel soll im Monat auf dem Konto ankommen. Umbuchungen zwischen deinen Konten zählen beim Ausgaben-Topf nicht als Ausgabe.</p>
    <div class="field" style="max-width:260px;margin-bottom:12px"><label for="potMonth">Abweichung für Monat</label>${monthSelect(state, "potMonth", month)}</div>
    <form id="potForm">${state.accounts.map((a) => `<div class="card" style="background:var(--surface-2);box-shadow:none">
      <h3>${esc(a.name)} <span class="subtle small">${a.area}</span></h3>
      <div class="fields"><div class="field"><label>Topf-Art</label><select name="type-${a.id}">${options([["", "kein Topf"], ...POT_TYPES.map((t) => [t, t])], a.potType || "")}</select></div>
      <div class="field"><label>Monatsbetrag (€)</label><input type="text" inputmode="decimal" name="budget-${a.id}" value="${formatAmountInput(a.potBudget)}" placeholder="z. B. 250"></div>
      <div class="field"><label>Abweichend im ${formatMonth(month)} (€)</label><input type="text" inputmode="decimal" name="ov-${a.id}" value="${formatAmountInput(state.potOverrides[`${a.id}|${month}`] ?? null)}" placeholder="–"></div></div>
      <details ${a.potExcluded.length ? "open" : ""}><summary>Kategorien, die nicht zum Topf zählen${a.potExcluded.length ? ` (${a.potExcluded.length})` : ""}</summary>
        <p class="subtle small">Z. B. Miete oder Verträge, die vom Hauptkonto abgehen, aber nicht zum Freizeitbudget gehören. Gilt nur für Ausgaben-Töpfe.</p>
        <div class="chips">${cats.filter((c) => c.kind === "Ausgabe").map((c) => `<label><input type="checkbox" name="ex-${a.id}" value="${c.id}" ${a.potExcluded.includes(c.id) ? "checked" : ""}>${esc(c.name)}</label>`).join("")}</div></details>
    </div>`).join("")}
    <div class="box bad" id="potError" hidden></div><button class="primary">Töpfe speichern</button></form></section>`;
}

// Kategorien & Regeln

function categoriesSection(state) {
  const used = new Map();
  for (const t of state.transactions) if (t.categoryId) used.set(t.categoryId, (used.get(t.categoryId) || 0) + 1);
  return `<section class="card"><h2>Kategorien</h2><ul class="list">${sortedCategories(state).map((c) => `<li class="row between">
    <div><div class="tx-title">${esc(c.name)}</div><div class="tx-sub">${c.kind} · ${used.get(c.id) || 0} Buchungen</div></div>
    <div class="row"><button class="link" data-action="edit-category" data-id="${c.id}">Bearbeiten</button>
    <button class="link" data-action="delete-category" data-id="${c.id}" style="color:var(--bad)">Löschen</button></div></li>`).join("")}</ul>
    <button class="primary" data-action="add-category">+ Kategorie hinzufügen</button></section>`;
}

function categoryForm(cat = {}) {
  return `<div class="fields"><div class="field"><label>Name</label><input type="text" name="name" required value="${esc(cat.name || "")}"></div>
    <div class="field"><label>Art</label><select name="kind">${options([["Ausgabe", "Ausgabe"], ["Einnahme", "Einnahme"]], cat.kind || "Ausgabe")}</select></div></div>`;
}

function rulesSection(state) {
  const names = categoryNames(state);
  const rules = [...state.rules].sort((a, b) => a.priority - b.priority || a.id - b.id);
  return `<section class="card"><h2>Regeln</h2>
    <p class="subtle small">Das Schlüsselwort wird (ohne Groß-/Kleinschreibung) in Empfänger und Verwendungszweck gesucht. Die Regel mit der
      kleinsten Priorität gewinnt. Manuell zugeordnete Buchungen bleiben unverändert.</p>
    ${rules.length ? `<div class="table-wrap"><table><thead><tr><th class="num">Prio</th><th>Schlüsselwort</th><th>Kategorie</th><th></th></tr></thead><tbody>
    ${rules.map((r) => `<tr><td class="num">${r.priority}</td><td>${esc(r.keyword)}</td><td>${esc(names.get(r.categoryId))}</td>
      <td class="num"><button class="link" data-action="edit-rule" data-id="${r.id}">Bearbeiten</button>
      <button class="link" data-action="delete-rule" data-id="${r.id}" style="color:var(--bad)">Löschen</button></td></tr>`).join("")}</tbody></table></div>`
    : '<p class="subtle">Noch keine Regeln. Am schnellsten entstehen sie unter Buchungen → Offen.</p>'}
    <div class="row"><button class="primary" data-action="add-rule">+ Regel hinzufügen</button><button data-action="reapply">Regeln neu anwenden</button></div></section>`;
}

function ruleForm(state, rule = {}) {
  return `<div class="fields"><div class="field"><label>Schlüsselwort</label><input type="text" name="keyword" required value="${esc(rule.keyword || "")}" placeholder="z. B. Netflix"></div>
    <div class="field"><label>Kategorie</label><select name="categoryId">${options(sortedCategories(state).map((c) => [c.id, c.name]), rule.categoryId)}</select></div>
    <div class="field"><label>Priorität</label><input type="number" name="priority" min="0" step="1" value="${rule.priority ?? ""}" placeholder="automatisch"></div></div>`;
}

// Sicherung

function backupSection(state) {
  const last = state.meta.lastBackup;
  return `<section class="card stack"><h2>Sicherung & Abgleich</h2>
    <p>Deine Daten liegen <b>nur auf diesem Gerät</b>, im Speicher dieser App. Es gibt keinen Server. Damit Laptop und Handy denselben Stand haben,
      erstellst du auf dem einen Gerät eine Sicherung und lädst sie auf dem anderen.</p>
    <ol class="small"><li>Auf dem Gerät mit dem neuesten Stand: <b>Sicherung erstellen</b> (herunterladen oder per Teilen-Menü an dich selbst senden).</li>
      <li>Auf dem anderen Gerät: <b>Sicherung laden</b> und die Datei auswählen. Die Daten dort werden dabei ersetzt.</li></ol>
    <div class="box info small">Letzte Sicherung von diesem Gerät: ${last ? formatDateTime(last) : "noch keine"} ·
      ${state.transactions.length} Buchungen · zuletzt geändert ${formatDateTime(state.meta.updated)}</div>
    <div class="row"><button class="primary" data-action="backup-download">${icon("save")} Sicherung herunterladen</button>
      <button data-action="backup-share">Sicherung teilen …</button></div>
    <div class="field"><label for="backupFile">Sicherung laden (ersetzt die Daten auf diesem Gerät)</label>
      <input type="file" id="backupFile" accept=".json,application/json"></div>
    <p class="subtle small">Daten aus der alten Laptop-App übernehmen: Dort das Skript <code>export_to_pwa.py</code> ausführen (siehe Anleitung)
      und die entstandene Datei hier laden.</p>
    <details><summary>Speicher & Daten löschen</summary>
      <p class="small" id="persistInfo">Prüfe Speicherschutz …</p>
      <button class="danger" data-action="wipe">Alle Daten auf diesem Gerät löschen</button></details></section>`;
}

// Export

function exportSection(ctx) {
  const f = filterBar(ctx, "ex");
  const { rows, figures, tx } = monthData(ctx.state, f.month, f.area, f.accountId);
  return `<section class="card"><h2>Monatsbericht exportieren</h2>${f.html}${budgetTable(rows)}
    <p class="small">${tx.length} Buchungen · Einnahmen ${formatEur(figures.income)} · Ausgaben ${formatEur(figures.expenses)}</p>
    <div class="row"><button class="primary" data-action="export-xlsx">Excel herunterladen</button><button data-action="export-csv">CSV herunterladen</button></div></section>`;
}

export function render(ctx, section) {
  const { state } = ctx;
  const active = SECTIONS.some(([k]) => k === section) ? section : "konten";
  const nav = `<div class="tabs">${SECTIONS.map(([k, l]) => `<a class="btn ${k === active ? "primary" : ""}" style="border-radius:999px;min-height:38px;padding:8px 14px;white-space:nowrap" href="#/einstellungen/${k}">${l}</a>`).join("")}</div>`;
  const body = {
    konten: () => accountsSection(state), toepfe: () => potsSection(ctx), kategorien: () => categoriesSection(state),
    regeln: () => rulesSection(state), sicherung: () => backupSection(state), export: () => exportSection(ctx),
  }[active]();
  return `<div class="page-head"><h1>Einstellungen</h1></div>${nav}${body}`;
}

async function exportBackup(ctx, share) {
  const payload = JSON.stringify(backupPayload(ctx.state));
  const name = `budget-sicherung-${todayIso()}.json`;
  const ok = share ? await shareFile(name, payload, "application/json") : (downloadFile(name, payload, "application/json"), true);
  if (!ok) { toast("Teilen wird hier nicht unterstützt – nutze „Herunterladen“."); return; }
  await ctx.commit((s) => { s.meta.lastBackup = new Date().toISOString(); }, "Sicherung erstellt.");
}

export function bind(root, ctx) {
  const persist = root.querySelector("#persistInfo");
  if (persist) {
    requestPersistence().then((ok) => {
      persist.textContent = ok
        ? "Speicherschutz aktiv: Der Browser löscht die Daten nicht automatisch."
        : "Der Browser hat keinen dauerhaften Speicherschutz bestätigt. Erstelle regelmäßig Sicherungen. Als installierte App ist das Risiko gering.";
    });
  }

  root.querySelector("#potForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const month = ctx.ui.potMonth || monthOf(todayIso());
    const updates = [];
    try {
      for (const a of ctx.state.accounts) {
        const type = form.get(`type-${a.id}`) || null;
        const budget = optionalAmount(form.get(`budget-${a.id}`));
        if (type && budget === null) throw new Error(`Bei „${a.name}“ fehlt der Monatsbetrag.`);
        updates.push([a.id, type, budget === null ? null : Math.abs(budget), optionalAmount(form.get(`ov-${a.id}`)),
          form.getAll(`ex-${a.id}`).map(Number)]);
      }
    } catch (err) {
      const box = root.querySelector("#potError");
      box.textContent = err.message;
      box.hidden = false;
      return;
    }
    await ctx.commit((s) => {
      for (const [id, type, budget, ov, ex] of updates) {
        setPot(s, id, { potType: type, potBudget: budget, potExcluded: ex });
        setPotOverride(s, id, month, type && ov !== null ? Math.abs(ov) : null);
      }
    }, "Töpfe gespeichert.");
  });

  root.querySelector("#backupFile")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = new TextDecoder("utf-8").decode(await readFileBytes(file));
      const { exportedAt, state } = parseBackup(text);
      const current = ctx.state;
      const msg = `Sicherung vom <b>${formatDateTime(exportedAt) || "unbekanntem Datum"}</b> mit ${state.transactions.length} Buchungen und ${state.accounts.length} Konten laden?<br><br>
        Die Daten auf diesem Gerät (${current.transactions.length} Buchungen, zuletzt geändert ${formatDateTime(current.meta.updated)}) werden <b>ersetzt</b>.`;
      if (await confirmDialog(msg, { okText: "Sicherung laden" })) {
        state.meta.lastBackup = exportedAt || state.meta.lastBackup;
        await ctx.replaceState(state);
        toast("Sicherung geladen.");
      }
    } catch (err) {
      toast(err.message);
    }
    e.target.value = "";
  });

  root.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const id = Number(el.dataset.id);
    const { state } = ctx;
    switch (el.dataset.action) {
      case "add-account":
        formDialog("Konto hinzufügen", accountForm(), (f) => ctx.commit((s) => addAccount(s, {
          name: f.get("name"), area: f.get("area"), openingBalance: optionalAmount(f.get("opening")) }), "Konto angelegt."));
        break;
      case "edit-account": {
        const acc = state.accounts.find((a) => a.id === id);
        formDialog("Konto bearbeiten", accountForm(acc), (f) => {
          const name = String(f.get("name") || "").trim();
          if (!name) throw new Error("Name darf nicht leer sein.");
          if (state.accounts.some((a) => a.id !== id && a.name.toLowerCase() === name.toLowerCase())) throw new Error("Diesen Namen gibt es schon.");
          const opening = optionalAmount(f.get("opening"));
          return ctx.commit((s) => Object.assign(s.accounts.find((a) => a.id === id), { name, area: f.get("area"), openingBalance: opening }), "Gespeichert.");
        });
        break;
      }
      case "delete-account": {
        const acc = state.accounts.find((a) => a.id === id);
        const n = state.transactions.filter((t) => t.accountId === id).length;
        if (await confirmDialog(`Konto „${esc(acc.name)}“ mit ${n} Buchungen endgültig löschen?`, { okText: "Löschen", danger: true })) {
          await ctx.commit((s) => deleteAccount(s, id), "Konto gelöscht.");
        }
        break;
      }
      case "add-category":
        formDialog("Kategorie hinzufügen", categoryForm(), (f) => ctx.commit((s) => addCategory(s, f.get("name"), f.get("kind")), "Kategorie angelegt."));
        break;
      case "edit-category": {
        const cat = state.categories.find((c) => c.id === id);
        formDialog("Kategorie bearbeiten", categoryForm(cat), (f) => {
          const name = String(f.get("name") || "").trim();
          if (!name) throw new Error("Name darf nicht leer sein.");
          if (state.categories.some((c) => c.id !== id && c.name.toLowerCase() === name.toLowerCase())) throw new Error("Diese Kategorie gibt es schon.");
          return ctx.commit((s) => Object.assign(s.categories.find((c) => c.id === id), { name, kind: f.get("kind") }), "Gespeichert.");
        });
        break;
      }
      case "delete-category": {
        const cat = state.categories.find((c) => c.id === id);
        if (await confirmDialog(`Kategorie „${esc(cat.name)}“ löschen? Ihre Buchungen werden unkategorisiert, zugehörige Regeln und Budgets entfernt.`, { okText: "Löschen", danger: true })) {
          await ctx.commit((s) => deleteCategory(s, id), "Kategorie gelöscht.");
        }
        break;
      }
      case "add-rule":
        formDialog("Regel hinzufügen", ruleForm(state), (f) => {
          const prio = String(f.get("priority") || "").trim();
          return ctx.commit((s) => toast(`Regel gespeichert, ${addRule(s, f.get("keyword"), Number(f.get("categoryId")), prio ? Number(prio) : null)} Buchungen neu zugeordnet.`));
        });
        break;
      case "edit-rule": {
        const rule = state.rules.find((r) => r.id === id);
        formDialog("Regel bearbeiten", ruleForm(state, rule), (f) => {
          const keyword = String(f.get("keyword") || "").trim();
          if (!keyword) throw new Error("Schlüsselwort darf nicht leer sein.");
          const prio = String(f.get("priority") || "").trim();
          return ctx.commit((s) => {
            Object.assign(s.rules.find((r) => r.id === id), { keyword, categoryId: Number(f.get("categoryId")), priority: prio ? Number(prio) : rule.priority });
            toast(`Regel gespeichert, ${reapplyRules(s)} Buchungen neu zugeordnet.`);
          });
        });
        break;
      }
      case "delete-rule":
        if (await confirmDialog("Diese Regel löschen?", { okText: "Löschen", danger: true })) {
          await ctx.commit((s) => toast(`Regel gelöscht, ${deleteRule(s, id)} Buchungen neu zugeordnet.`));
        }
        break;
      case "reapply":
        await ctx.commit((s) => toast(`${reapplyRules(s)} Buchungen neu zugeordnet.`));
        break;
      case "backup-download": await exportBackup(ctx, false); break;
      case "backup-share": await exportBackup(ctx, true); break;
      case "wipe":
        if (await confirmDialog("Wirklich <b>alle Daten auf diesem Gerät</b> löschen? Das lässt sich nur mit einer Sicherung rückgängig machen.", { okText: "Alles löschen", danger: true })) {
          await ctx.resetState();
          toast("Alle Daten gelöscht.");
        }
        break;
      case "export-csv":
      case "export-xlsx": {
        const f = filterBar(ctx, "ex");
        const { tx, rows, figures } = monthData(state, f.month, f.area, f.accountId);
        const tables = reportTables(figures, rows, tx, accountNames(state), categoryNames(state));
        const base = `monatsbericht_${f.month}_${f.area.toLowerCase()}`;
        if (el.dataset.action === "export-csv") downloadFile(`${base}.csv`, reportCsv(formatMonth(f.month), tables), "text/csv;charset=utf-8");
        else downloadFile(`${base}.xlsx`, reportXlsx(tables), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        break;
      }
      default:
    }
  });
}
