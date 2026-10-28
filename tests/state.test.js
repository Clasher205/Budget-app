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
