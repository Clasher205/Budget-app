import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRules, matchCategory, matchTransfers } from "../js/logic/rules.js";
import { keyFigures, planVsActual, statusFor, findAnomalies } from "../js/logic/budget.js";
import { monthProgress, potAmounts, potHistory, potStatus } from "../js/logic/pots.js";
import { detectSubscriptions, occurrences, upcoming } from "../js/logic/fixed.js";
import { reportCsv, reportTables, reportXlsx } from "../js/logic/exportfile.js";

const RULES = [
  { id: 1, keyword: "supermarkt", categoryId: 2, priority: 20 },
  { id: 2, keyword: "Bahn", categoryId: 3, priority: 10 },
  { id: 3, keyword: "markt", categoryId: 9, priority: 30 },
];

test("rules: case-insensitive, both fields, priority wins, manual never overwritten", () => {
  assert.equal(matchCategory("Beispiel SUPERMARKT", "", RULES), 2);
  assert.equal(matchCategory("Firma", "Ticket bahn", RULES), 3);
  assert.equal(matchCategory("Bahnhofs-Supermarkt", "", RULES), 3);
  assert.equal(matchCategory("Wochenmarkt", "", RULES), 9);
  assert.equal(matchCategory("Unbekannt", "", RULES), null);
  const txs = [{ payee: "Cafe", purpose: "", categoryId: 5, manual: true }, { payee: "Cafe", purpose: "", categoryId: null, manual: false }];
  assert.equal(applyRules(txs, [{ id: 1, keyword: "cafe", categoryId: 2, priority: 1 }]), 1);
  assert.deepEqual(txs.map((t) => t.categoryId), [5, 2]);
});

test("transfers between own accounts", () => {
  const txs = [
    { id: 1, accountId: 1, date: "2026-09-01", amount: -25000 },
    { id: 2, accountId: 1, date: "2026-09-01", amount: -2000 },
    { id: 3, accountId: 2, date: "2026-09-02", amount: 25000 },
    { id: 4, accountId: 2, date: "2026-09-20", amount: 2000 },
    { id: 5, accountId: 1, date: "2026-09-03", amount: 777, transferManual: true },
    { id: 6, accountId: 2, date: "2026-09-03", amount: -777 },
  ];
  assert.equal(matchTransfers(txs), 1);
  assert.deepEqual(txs.map((t) => Boolean(t.transfer)), [true, false, true, false, false, false]);
});

test("status thresholds and plan vs actual", () => {
  assert.equal(statusFor(10000, 8999, "Ausgabe"), "OK");
  assert.equal(statusFor(10000, 9000, "Ausgabe"), "knapp");
  assert.equal(statusFor(10000, 10001, "Ausgabe"), "überschritten");
  assert.equal(statusFor(null, 5, "Ausgabe"), "kein Budget");
  assert.equal(statusFor(50000, 40000, "Einnahme"), "unter Plan");
  const cats = [
    { id: 1, name: "Lebensmittel", kind: "Ausgabe", order: 0 }, { id: 2, name: "Freizeit", kind: "Ausgabe", order: 1 },
    { id: 3, name: "Einnahmen Job", kind: "Einnahme", order: 2 }, { id: 5, name: "Gesundheit", kind: "Ausgabe", order: 3 },
  ];
  const txs = [[1, -12345], [1, -5000], [1, 1000], [2, -6000], [3, 60000], [5, -2000], [null, -999]]
    .map(([categoryId, amount]) => ({ categoryId, amount }));
  const rows = Object.fromEntries(planVsActual(cats, txs, ["Privat"],
    { "1|Privat": 30000, "2|Privat": 10000, "3|Privat": 50000 }, { "2|Privat|2026-09": 5000 }, "2026-09")
    .map((r) => [r.category, r]));
  assert.deepEqual([rows.Lebensmittel.actual, rows.Lebensmittel.diff, rows.Lebensmittel.diffPct, rows.Lebensmittel.status], [16345, 13655, 45.52, "OK"]);
  assert.deepEqual([rows.Freizeit.plan, rows.Freizeit.diff, rows.Freizeit.diffPct, rows.Freizeit.status], [5000, -1000, -20, "überschritten"]);
  assert.deepEqual([rows["Einnahmen Job"].diff, rows["Einnahmen Job"].status], [10000, "OK"]);
  assert.equal(rows.Gesundheit.plan, null);
  assert.equal(rows.Unkategorisiert.actual, -999);
});

test("key figures", () => {
  assert.deepEqual(keyFigures([100000, -25050, -4950, 0]), { income: 100000, expenses: 30000, balance: 70000, savingsRate: 70 });
  assert.equal(keyFigures([-100]).savingsRate, null);
  assert.equal(keyFigures([30000, -10000]).savingsRate, 66.67);
});

test("anomalies", () => {
  const month = [
    { accountId: 1, date: "2026-10-10", payee: "Kino", amount: -950, categoryId: 4 },
    { accountId: 1, date: "2026-10-10", payee: "Kino", amount: -950, categoryId: 4 },
    { accountId: 1, date: "2026-10-12", payee: "Markt", amount: -18640, categoryId: 2 },
  ];
  const history = [...month, ...[3000, 3200, 2800].map((a) => ({ amount: -a, categoryId: 2 }))];
  const hints = findAnomalies([{ category: "Freizeit", status: "überschritten", actual: 2000, plan: 1000 }], month, history, new Map([[2, "Lebensmittel"]]));
  assert.equal(hints.length, 3);
  assert.match(hints[1], /2× 9,50 €/);
  assert.match(hints[2], /Lebensmittel: 186,40 €/);
});

test("pot course: example food account", () => {
  assert.deepEqual(monthProgress("2026-10", "2026-10-15"), [15, 31]);
  assert.deepEqual(monthProgress("2026-09", "2026-10-15"), [30, 30]);
  assert.deepEqual(monthProgress("2026-11", "2026-10-15"), [0, 30]);
  const txs = [{ date: "2026-09-03", amount: -10000 }, { date: "2026-09-14", amount: -8000 },
    { date: "2026-09-01", amount: 25000, transfer: true }];
  const s = potStatus("Ausgaben", 25000, "2026-09", potAmounts(txs, "Ausgaben"), "2026-09-15");
  assert.deepEqual([s.ideal, s.used, s.ahead, s.remaining, s.perDayNominal, s.perDayRemaining, s.level],
    [12500, 18000, -5500, 7000, 833, 438, "bad"]);
  assert.equal(s.cumulative.length, 15);
  assert.equal(s.cumulative.at(-1), 18000);
  const ok = potStatus("Ausgaben", 25000, "2026-09", [{ date: "2026-09-02", value: 12000 }], "2026-09-15");
  assert.equal(ok.level, "good");
  const near = potStatus("Ausgaben", 25000, "2026-09", [{ date: "2026-09-02", value: 13000 }], "2026-09-15");
  assert.equal(near.level, "warn");
  const done = potStatus("Ausgaben", 25000, "2026-08", [{ date: "2026-08-10", value: 24000 }], "2026-09-15");
  assert.deepEqual([done.level, done.perDayRemaining, done.ideal], ["good", null, 25000]);
  const save = potStatus("Sparen", 20000, "2026-09", potAmounts([{ date: "2026-09-01", amount: 20000, transfer: true }], "Sparen"), "2026-09-15");
  assert.equal(save.status, "Sparziel erreicht");
});

test("pot excluded categories and history", () => {
  const txs = [{ date: "2026-09-02", amount: -4000, categoryId: 2 }, { date: "2026-09-03", amount: -1000, categoryId: 7 }];
  assert.deepEqual(potAmounts(txs, "Ausgaben", [7]).map((a) => a.value), [4000]);
  const hist = potHistory("Ausgaben", [["2026-08", 25000], ["2026-09", 25000], ["2026-10", 25000]],
    [{ date: "2026-08-05", amount: -30000 }, { date: "2026-09-05", amount: -20000 }, { date: "2026-10-01", amount: -1000 }], [], "2026-10-15");
  assert.deepEqual(hist.map((h) => [h.month, h.diff, h.kept]), [["2026-08", -5000, false], ["2026-09", 5000, true], ["2026-10", 24000, null]]);
});

test("fixed costs: occurrences and upcoming", () => {
  assert.deepEqual(occurrences("2026-01-31", "monatlich", "2026-03-01", "2026-05-31"), ["2026-03-31", "2026-04-30", "2026-05-31"]);
  assert.deepEqual(occurrences("2026-02-15", "vierteljährlich", "2026-01-01", "2026-12-31"), ["2026-02-15", "2026-05-15", "2026-08-15", "2026-11-15"]);
  const items = upcoming([{ name: "Miete", nextDue: "2026-10-01", rhythm: "monatlich", amount: 42000 }], "2026-10-15", 90);
  assert.deepEqual(items.map((i) => i.due), ["2026-11-01", "2026-12-01", "2027-01-01"]);
});

test("subscription detection", () => {
  const row = (date, amount, payee) => ({ date, amount, payee, categoryId: 4, accountId: 1 });
  const txs = [
    row("2026-01-05", -999, "Streamingdienst Muster"), row("2026-02-05", -999, "Streamingdienst Muster"),
    row("2026-03-06", -1049, "streamingdienst muster"),
    row("2026-01-10", -500, "Kiosk"), row("2026-03-10", -500, "Kiosk"), row("2026-04-10", -500, "Kiosk"),
    row("2026-01-15", -2000, "Variabel"), row("2026-02-15", -9000, "Variabel"), row("2026-03-15", -2000, "Variabel"),
    ...[1, 2, 3].flatMap((m) => [3, 12, 24].map((d) => row(`2026-0${m}-${String(d).padStart(2, "0")}`, -3500, "Supermarkt"))),
  ];
  const found = detectSubscriptions(txs);
  assert.deepEqual(found.map((s) => s.payee), ["Streamingdienst Muster"]);
  assert.equal(found[0].nextDue, "2026-04-06");
  assert.equal(found[0].amount, 1016);
  assert.deepEqual(detectSubscriptions(txs, ["STREAMINGDIENST MUSTER"]), []);
});

test("export csv and xlsx", () => {
  const tables = reportTables({ income: 100000, expenses: 123456, balance: -23456, savingsRate: -23.46 },
    [{ category: "Lebensmittel", kind: "Ausgabe", plan: 30000, actual: 123456, diff: -93456, diffPct: -311.52, status: "überschritten" }],
    [{ date: "2026-01-02", accountId: 1, payee: "A", purpose: "x;y", categoryId: null, transfer: false, amount: -123456 }],
    new Map([[1, "Giro"]]), new Map());
  const csv = reportCsv("Januar 2026", tables);
  assert.ok(csv.startsWith("﻿"));
  assert.ok(csv.includes("Lebensmittel;Ausgabe;300,00;1234,56;-934,56;-311,52;überschritten"));
  assert.ok(csv.includes('02.01.2026;Giro;A;"x;y";Unkategorisiert;;-1234,56'));
  const xlsx = reportXlsx(tables);
  assert.equal(xlsx[0], 0x50);
  assert.equal(xlsx[1], 0x4b);
});
