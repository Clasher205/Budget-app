import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { addAccount, addRule, backupPayload, createState, deleteCategory, importTransactions, parseBackup,
  setCategory, setTransfer, areaBalance } from "../js/state.js";
import { readCsv, guessMapping, transform } from "../js/logic/csv.js";

function rowsFrom(text) {
  const parsed = readCsv(text);
  return transform(parsed, guessMapping(parsed.headers)).rows;
}

test("import with duplicates, rules, transfers", () => {
  const s = createState();
  const main = addAccount(s, { name: "Hauptkonto", area: "Privat", openingBalance: 10000 });
  const food = addAccount(s, { name: "Essenskonto", area: "Privat", openingBalance: 0 });
  assert.throws(() => addAccount(s, { name: "hauptkonto", area: "Privat" }));
  const lebensmittel = s.categories.find((c) => c.name === "Lebensmittel").id;
  addRule(s, "markt", lebensmittel);
  const mainCsv = "Datum;Empfänger;Zweck;Betrag\n01.09.2026;Ich;Umbuchung;-250,00\n03.09.2026;Kino;Ticket;-9,50\n";
  assert.deepEqual(importTransactions(s, main.id, rowsFrom(mainCsv)), { inserted: 2, duplicates: 0, transfers: 0 });
  assert.deepEqual(importTransactions(s, main.id, rowsFrom(mainCsv)), { inserted: 0, duplicates: 2, transfers: 0 });
  const foodCsv = "Datum;Empfänger;Zweck;Betrag\n02.09.2026;Ich;Umbuchung;250,00\n04.09.2026;Frischmarkt;Karte;-30,00\n";
  assert.deepEqual(importTransactions(s, food.id, rowsFrom(foodCsv)), { inserted: 2, duplicates: 0, transfers: 1 });
  const market = s.transactions.find((t) => t.payee === "Frischmarkt");
  assert.equal(market.categoryId, lebensmittel);
  const kino = s.transactions.find((t) => t.payee === "Kino");
  setCategory(s, kino.id, s.categories.find((c) => c.name === "Freizeit").id);
  addRule(s, "kino", lebensmittel);
  assert.equal(kino.manual, true);
  assert.notEqual(kino.categoryId, lebensmittel);
  setTransfer(s, market.id, true);
  assert.equal(market.transferManual, true);
  assert.equal(areaBalance(s, "Privat"), 10000 - 25000 - 950 + 25000 - 3000);
  deleteCategory(s, lebensmittel);
  assert.equal(s.rules.length, 0);
  assert.equal(market.categoryId, null);
});

test("backup roundtrip and validation", () => {
  const s = createState();
  addAccount(s, { name: "Giro", area: "Privat" });
  const restored = parseBackup(JSON.stringify(backupPayload(s))).state;
  assert.equal(restored.accounts[0].name, "Giro");
  assert.throws(() => parseBackup("{}"), /keine Sicherung/);
  assert.throws(() => parseBackup("kein json"), /kein JSON/);
});

const SP = "/tmp/claude-0/-home-user/51a031b0-0691-5ed9-b650-e02b32bbbb68/scratchpad";
test("migration file from old app is accepted", { skip: !existsSync(`${SP}/migrated.json`) }, () => {
  for (const file of ["migrated.json", "migrated_old.json"]) {
    const { state } = parseBackup(readFileSync(`${SP}/${file}`, "utf8"));
    assert.ok(state.transactions.length > 0);
    assert.ok(state.nextId > Math.max(...state.transactions.map((t) => t.id)));
    const keys = new Set(state.transactions.map((t) => `${t.accountId}|${t.key}`));
    assert.equal(keys.size, state.transactions.length);
  }
});

test("Stichtag-Einstellung: Standard 20, alte Stände bekommen sie nachgerüstet", async () => {
  const { upgradeState } = await import("../js/state.js");
  assert.equal(createState().settings.incomeCutoffDay, 20);
  const old = createState();
  delete old.settings;
  assert.equal(upgradeState(old).settings.incomeCutoffDay, 20);
});

test("Umbuchungs-Regel: Abbuchung an eigenes Konto zählt nicht als Ausgabe, auch ohne Gegenseite", async () => {
  const { TRANSFER, deleteRule, upgradeState } = await import("../js/state.js");
  const { monthData } = await import("../js/data.js");
  const s = createState();
  const giro = addAccount(s, { name: "Volksbank Giro", area: "Privat" });
  const tr = addAccount(s, { name: "Trade Republic", area: "Privat" });
  addRule(s, "Trade Republic", TRANSFER);
  const giroCsv = "Datum;Empfänger;Zweck;Betrag\n20.10.2026;Arbeitgeber Muster;Lohn;538,00\n31.10.2026;Trade Republic Bank;Sparen;-100,00\n"
    + "31.10.2026;Muster Kiosk;Einkauf;-5,00\n";
  importTransactions(s, giro.id, rowsFrom(giroCsv));
  const out = s.transactions.find((t) => t.amount === -10000);
  assert.deepEqual([out.transfer, out.transferByRule, out.transferPair], [true, true, false]);
  const oct = monthData(s, "2026-10", "Beide", null);
  assert.equal(oct.figures.expenses, 500);
  assert.equal(monthData(s, "2026-11", "Beide", null).figures.income, 53800);
  // Gegenseite später importiert: wird als Paar erkannt und zählt nicht als Einnahme
  const res = importTransactions(s, tr.id, rowsFrom("Datum;Empfänger;Zweck;Betrag\n31.10.2026;Max Muster;Sparen;100,00\n"));
  assert.equal(res.transfers, 1);
  assert.equal(monthData(s, "2026-11", "Beide", null).figures.income, 53800);
  // Regel löschen: Paar bleibt Umbuchung
  deleteRule(s, s.rules.find((r) => r.transfer).id);
  assert.equal(out.transfer, true);
  // Alte Stände: bereits erkannte Paare werden als Paar übernommen
  const old = createState();
  old.transactions.push({ id: 99, accountId: 1, date: "2026-10-01", amount: -1, payee: "", purpose: "", categoryId: null, manual: false, transfer: true, transferManual: false, key: "x" });
  assert.equal(upgradeState(old).transactions[0].transferPair, true);
});

test("Umbuchungs-Regel ohne Gegenseite: löschen hebt Markierung wieder auf", async () => {
  const { TRANSFER, deleteRule } = await import("../js/state.js");
  const s = createState();
  const giro = addAccount(s, { name: "Giro", area: "Privat" });
  addRule(s, "sparkonto", TRANSFER);
  importTransactions(s, giro.id, rowsFrom("Datum;Empfänger;Zweck;Betrag\n31.10.2026;Eigenes Sparkonto;Sparen;-30,00\n"));
  assert.equal(s.transactions[0].transfer, true);
  assert.equal(matchCategoryCount(s), 0);
  deleteRule(s, s.rules[0].id);
  assert.equal(s.transactions[0].transfer, false);
});

function matchCategoryCount(s) {
  return s.transactions.filter((t) => t.categoryId !== null).length;
}
