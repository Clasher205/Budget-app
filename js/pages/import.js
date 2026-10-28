/** CSV-Import: Datei wählen, Spalten zuordnen, Vorschau, importieren. */
import { decodeBytes, guessMapping, mappingProblems, readCsv, summarizeErrors, transform } from "../logic/csv.js";
import { formatDate, formatEur } from "../logic/format.js";
import { matchCategory } from "../logic/rules.js";
import { importTransactions } from "../state.js";
import { categoryNames } from "../data.js";
import { readFileBytes } from "../storage.js";
import { esc, options, toast } from "../ui.js";

const FIELDS = [["date", "Buchungsdatum"], ["amount", "Betrag"], ["debit", "Soll (Ausgaben)"], ["credit", "Haben (Einnahmen)"],
  ["purpose", "Verwendungszweck"], ["payee", "Empfänger/Auftraggeber"]];

function loadMapping(ctx) {
  const { state, ui } = ctx;
  const data = ui.importData;
  const account = state.accounts.find((a) => a.id === ui.importAccount);
  const profile = account?.profile;
  if (profile) {
    const used = FIELDS.map(([k]) => profile[k]).filter(Boolean);
    if (used.every((c) => data.headers.includes(c))) return { mapping: { ...profile }, fromProfile: true };
  }
  return { mapping: guessMapping(data.headers), fromProfile: false };
}

function resultBox(result) {
  if (!result) return "";
  const summary = Object.entries(summarizeErrors(result.errors)).map(([r, n]) => `${n}× ${r}`).join("; ");
  return `<div class="box good">${result.inserted} Buchungen importiert, ${result.duplicates} Duplikate übersprungen.</div>
    ${result.transfers ? `<div class="box info">${result.transfers} Umbuchungen zwischen deinen eigenen Konten erkannt. Sie zählen weder als Einnahme noch als Ausgabe.</div>` : ""}
    ${result.errors.length ? `<div class="box warn">${result.errors.length} fehlerhafte Zeilen übersprungen: ${esc(summary)}
      <details><summary>Details</summary><ul>${result.errors.slice(0, 100).map((e) => `<li>Zeile ${e.line}: ${esc(e.reason)}</li>`).join("")}</ul></details></div>` : ""}
    ${result.inserted ? '<p><a class="btn" href="#/buchungen">Offene Buchungen zuordnen</a> <a class="btn" href="#/">Zum Kurs</a></p>' : ""}`;
}

export function render(ctx) {
  const { state, ui } = ctx;
  const head = '<div class="page-head"><div><h1>Import</h1><div class="subtle">CSV-Export aus deinem Online-Banking. Die Datei wird nur auf diesem Gerät verarbeitet.</div></div></div>';
  if (!state.accounts.length) return `${head}<div class="card empty">Lege zuerst ein Konto an. <a href="#/einstellungen/konten">Konten anlegen</a></div>`;
  if (!state.accounts.some((a) => a.id === ui.importAccount)) ui.importAccount = state.accounts[0].id;
  const accountField = `<div class="field"><label for="importAccount">Konto</label>
    <select id="importAccount" data-change="account">${options(state.accounts.map((a) => [a.id, `${a.name} (${a.area})`]), ui.importAccount)}</select></div>`;
  const fileField = `<div class="field"><label for="importFile">CSV-Datei</label>
    <input type="file" id="importFile" accept=".csv,.txt,text/csv,text/plain,text/comma-separated-values" data-change="file"></div>`;
  let body = "";
  const data = ui.importData;
  if (data) {
    if (!ui.importMapping) {
      const loaded = loadMapping(ctx);
      Object.assign(ui, { importMapping: loaded.mapping, importFromProfile: loaded.fromProfile });
    }
    const m = ui.importMapping;
    const pick = (field, label) => `<div class="field"><label for="map-${field}">${label}</label>
      <select id="map-${field}" data-change="map" data-field="${field}">${options(data.headers.map((h) => [h, h]), m[field], "– keine –")}</select></div>`;
    const problems = mappingProblems(m);
    let preview = "";
    if (!problems.length) {
      const names = categoryNames(state);
      const sample = { ...data, rows: data.rows.slice(0, 20) };
      const { rows, errors } = transform(sample, m);
      const byLine = new Map(rows.map((r) => [r.line, r]));
      const errLine = new Map(errors.map((e) => [e.line, e.reason]));
      preview = `<h3>Vorschau (erste 20 Zeilen)</h3><div class="table-wrap"><table><thead><tr><th>Zeile</th><th>Datum</th><th>Empfänger</th><th>Zweck</th><th class="num">Betrag</th><th>Kategorie (Regel)</th></tr></thead><tbody>
        ${sample.rows.map((row) => {
          const r = byLine.get(row.line);
          if (!r) return `<tr><td>${row.line}</td><td colspan="5" class="small" style="color:var(--bad)">${esc(errLine.get(row.line))}</td></tr>`;
          return `<tr><td>${row.line}</td><td>${formatDate(r.date)}</td><td>${esc(r.payee)}</td><td>${esc(r.purpose)}</td>
            <td class="num">${formatEur(r.amount)}</td><td>${esc(names.get(matchCategory(r.payee, r.purpose, state.rules)) || "–")}</td></tr>`;
        }).join("")}</tbody></table></div>
        <label class="check" style="margin:12px 0"><input type="checkbox" id="saveProfile" checked> Zuordnung für dieses Konto merken</label>
        <button class="primary" data-action="import">${data.rows.length} Zeilen importieren</button>`;
    }
    body = `<section class="card"><p class="subtle small">Erkannt: ${esc(data.fileName)} · ${data.encoding} · Trennzeichen „${data.delimiter}“ ·
      Kopfzeile in Zeile ${data.headerLine} · ${data.rows.length} Datenzeilen${data.errors.length ? ` · ${data.errors.length} unlesbare Zeilen` : ""}</p>
      <h3>Spaltenzuordnung</h3>${ui.importFromProfile ? '<div class="box good">Gespeicherte Zuordnung dieses Kontos geladen.</div>' : ""}
      <label class="check" style="margin-bottom:10px"><input type="checkbox" data-change="dc" ${m.useDebitCredit ? "checked" : ""}> Getrennte Soll-/Haben-Spalten statt einer Betragsspalte</label>
      <div class="fields">${pick("date", "Buchungsdatum")}${m.useDebitCredit ? pick("debit", "Soll (Ausgaben)") + pick("credit", "Haben (Einnahmen)") : pick("amount", "Betrag")}
        ${pick("purpose", "Verwendungszweck")}${pick("payee", "Empfänger/Auftraggeber")}</div>
      ${problems.length ? `<div class="box warn">Bitte noch zuordnen: ${problems.join(", ")}</div>` : preview}</section>`;
  }
  return `${head}<section class="card"><div class="fields">${accountField}${fileField}</div>
    ${ui.importError ? `<div class="box bad">${esc(ui.importError)}</div>` : ""}${resultBox(ui.importResult)}</section>${body}`;
}

export function bind(root, ctx) {
  const { ui } = ctx;
  root.addEventListener("change", async (e) => {
    const el = e.target.closest("[data-change]");
    if (!el) return;
    const kind = el.dataset.change;
    if (kind === "account") {
      ui.importAccount = Number(el.value);
      ui.importMapping = null;
      ui.importResult = null;
    }
    if (kind === "file" && el.files[0]) {
      const file = el.files[0];
      ui.importResult = null;
      ui.importMapping = null;
      ui.importError = null;
      try {
        const { text, encoding } = decodeBytes(await readFileBytes(file));
        ui.importData = { fileName: file.name, encoding, ...readCsv(text) };
      } catch (err) {
        ui.importData = null;
        ui.importError = `Datei konnte nicht gelesen werden: ${err.message}`;
      }
    }
    if (kind === "map") ui.importMapping[el.dataset.field] = el.value || null;
    if (kind === "dc") ui.importMapping.useDebitCredit = el.checked;
    ctx.rerender();
  });
  root.addEventListener("click", async (e) => {
    if (!e.target.closest('[data-action="import"]')) return;
    const data = ui.importData;
    const mapping = ui.importMapping;
    const saveProfile = root.querySelector("#saveProfile")?.checked;
    const { rows, errors } = transform(data, mapping);
    const accountId = ui.importAccount;
    const result = await ctx.commit((s) => {
      if (saveProfile) s.accounts.find((a) => a.id === accountId).profile = { ...mapping };
      return importTransactions(s, accountId, rows);
    });
    ui.importResult = { ...result, errors: [...data.errors, ...errors] };
    ui.importData = null;
    ui.importMapping = null;
    toast(`${result.inserted} Buchungen importiert.`);
    ctx.rerender();
  });
}
