import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeBytes, detectDelimiter, guessMapping, mappingProblems, parseAmount, parseDate, readCsv,
  transactionKey, transform } from "../js/logic/csv.js";
import { formatDate, formatEur, formatPct, addMonths, shiftMonth, daysInMonth } from "../js/logic/format.js";

test("parseAmount", () => {
  const cases = {
    "1.234,56": 123456, "-1.234,56": -123456, "12,5": 1250, "-0,99": -99, "1234.56": 123456, "1,234.56": 123456,
    "1.234": 123400, "1.234.567,89": 123456789, "12,50-": -1250, "+45,00": 4500, "  -7,10 €": -710,
    "1.234,56 EUR": 123456, "1 234,56": 123456, "0,005": 1, "(5,00)": -500,
  };
  for (const [raw, expected] of Object.entries(cases)) assert.equal(parseAmount(raw), expected, raw);
  for (const bad of ["", "abc", "1,2,3", "--", "12a,00"]) assert.throws(() => parseAmount(bad), Error, bad);
});

test("parseDate", () => {
  assert.equal(parseDate("03.01.2026"), "2026-01-03");
  assert.equal(parseDate("03.01.26"), "2026-01-03");
  assert.equal(parseDate("2026-01-03"), "2026-01-03");
  assert.equal(parseDate("3/1/2026"), "2026-01-03");
  for (const bad of ["", "32.01.2026", "2026/13/01", "gestern", "29.02.2025"]) assert.throws(() => parseDate(bad), Error, bad);
});

test("decode encodings", () => {
  const text = "Empfänger;Betrag\nBäckerei;-1,00\n";
  assert.deepEqual(decodeBytes(new TextEncoder().encode(text)), { text, encoding: "UTF-8" });
  assert.equal(decodeBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)])).encoding, "UTF-8-BOM");
  const latin = new Uint8Array([...text].map((c) => c.charCodeAt(0)));
  assert.deepEqual(decodeBytes(latin), { text, encoding: "Windows-1252" });
});

test("delimiter detection", () => {
  assert.equal(detectDelimiter("Datum;Betrag;Text\n01.01.2026;-1,50;A\n"), ";");
  assert.equal(detectDelimiter('Datum,Betrag,Text\n01.01.2026,"-1,50",A\n'), ",");
});

test("readCsv skips preamble and reports bad rows, transform continues", () => {
  const text = "Kontoauszug Beispiel\nZeitraum;01.01.2026 - 31.01.2026\n\n"
    + "Buchungstag;Empfänger;Verwendungszweck;Betrag\n02.01.2026;Muster GmbH;Rechnung \"1\";-10,00\n"
    + "kaputte Zeile\n03.01.2026;Beispiel AG;Gehalt;1.000,00\n99.99.2026;X;y;1,00\n04.01.2026;Z;\"a;b\";abc\n";
  const parsed = readCsv(text);
  assert.deepEqual(parsed.headers, ["Buchungstag", "Empfänger", "Verwendungszweck", "Betrag"]);
  assert.deepEqual(parsed.errors, [{ line: 6, reason: "falsche Spaltenanzahl (1 statt 4)" }]);
  const { rows, errors } = transform(parsed, guessMapping(parsed.headers));
  assert.deepEqual(rows.map((r) => r.amount), [-1000, 100000]);
  assert.equal(rows[0].purpose, 'Rechnung "1"');
  assert.equal(errors.length, 2);
});

test("readCsv: ING-Export mit aufgefüllten Infozeilen", () => {
  const pad = (line) => line + ";".repeat(8 - (line.match(/;/g) || []).length);
  const text = [
    "Umsatzanzeige;Datei erstellt am: 04.11.2026 09:15", "", "IBAN;DE00 0000 0000 0000 0000 00", "Kontoname;Girokonto",
    "Bank;ING", "Kunde;Erika Beispiel", "Zeitraum;01.10.2026 - 04.11.2026", "Saldo;250,00;EUR", "",
    "Sortierung;Datum absteigend", "",
    "In der CSV-Datei finden Sie alle bereits gebuchten Umsätze.", "",
    "Buchung;Wertstellungsdatum;Auftraggeber/Empfänger;Buchungstext;Verwendungszweck;Saldo;Währung;Betrag;Währung",
    "02.11.2026;02.11.2026;Supermarkt Muster;Lastschrift;Einkauf;250,00;EUR;-12,34;EUR",
    "30.10.2026;30.10.2026;Erika Beispiel;Gutschrift;Essen November;262,34;EUR;250,00;EUR",
  ].map(pad).join("\n");
  const parsed = readCsv(text);
  assert.equal(parsed.headerLine, 14);
  assert.equal(parsed.headers[0], "Buchung");
  assert.deepEqual(parsed.errors, []);
  const mapping = guessMapping(parsed.headers);
  assert.deepEqual(mappingProblems(mapping), []);
  const { rows } = transform(parsed, mapping);
  assert.deepEqual(rows.map((r) => [r.date, r.amount, r.payee]), [["2026-11-02", -1234, "Supermarkt Muster"], ["2026-10-30", 25000, "Erika Beispiel"]]);
});

test("guessMapping prefers exact names, supports Soll/Haben", () => {
  const m = guessMapping(["Datum", "Name", "Buchungstext", "Soll", "Haben"]);
  assert.deepEqual([m.date, m.payee, m.purpose, m.debit, m.credit, m.useDebitCredit],
    ["Datum", "Name", "Buchungstext", "Soll", "Haben", true]);
  const parsed = readCsv("Datum;Name;Text;Soll;Haben\n01.02.2026;A;x;12,34;\n02.02.2026;B;y;;100,00\n");
  assert.deepEqual(transform(parsed, guessMapping(parsed.headers)).rows.map((r) => r.amount), [-1234, 10000]);
  assert.ok(mappingProblems({ date: null }).length);
});

test("duplicate key ignores case and whitespace", () => {
  assert.equal(transactionKey("2026-01-01", -999, "Muster  GmbH", "Abo"), transactionKey("2026-01-01", -999, "muster gmbh", " abo "));
  assert.notEqual(transactionKey("2026-01-01", -999, "A", "x"), transactionKey("2026-01-01", -998, "A", "x"));
});

test("formatting", () => {
  assert.equal(formatEur(123450), "1.234,50 €");
  assert.equal(formatEur(-1), "-0,01 €");
  assert.equal(formatEur(null), "–");
  assert.equal(formatPct(12.345), "12,35 %");
  assert.equal(formatDate("2026-03-07"), "07.03.2026");
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(daysInMonth("2028-02"), 29);
});

test("local date-time formatting", async () => {
  const { formatDateTime } = await import("../js/logic/format.js");
  const d = new Date(2026, 9, 28, 16, 52);
  assert.equal(formatDateTime(d.toISOString()), "28.10.2026, 16:52 Uhr");
  assert.equal(formatDateTime(null), "");
});

test("ING-Format (erfundene Daten, Latin-1, Vorspann)", () => {
  const text = [
    "Umsatzanzeige;Datei erstellt am: 31.10.2026 10:00", "", "IBAN;DE00 0000 0000 0000 0000 00", "Kontoname;Girokonto",
    "Bank;ING", "Kunde;Max Muster", "Zeitraum;01.10.2026 - 31.10.2026", "Saldo;1.234,56;EUR", "",
    "Sortierung;Datum absteigend", "", "In der CSV-Datei finden Sie alle bereits gebuchten Umsätze.", "",
    "Buchung;Wertstellungsdatum;Auftraggeber/Empfänger;Buchungstext;Verwendungszweck;Saldo;Währung;Betrag;Währung",
    "30.10.2026;30.10.2026;Frischmarkt Beispiel;Lastschrift;Einkauf;1.234,56;EUR;-23,45;EUR",
    "29.10.2026;28.10.2026;Arbeitgeber Muster;Gutschrift;Lohn Oktober;1.258,01;EUR;538,00;EUR",
  ].join("\r\n");
  const bytes = new Uint8Array([...text].map((c) => c.charCodeAt(0)));
  const { text: decoded, encoding } = decodeBytes(bytes);
  assert.equal(encoding, "Windows-1252");
  const parsed = readCsv(decoded);
  const m = guessMapping(parsed.headers);
  assert.deepEqual([m.date, m.payee, m.purpose, m.amount], ["Buchung", "Auftraggeber/Empfänger", "Verwendungszweck", "Betrag"]);
  const { rows, errors } = transform(parsed, m);
  assert.deepEqual(rows.map((r) => [r.date, r.amount]), [["2026-10-30", -2345], ["2026-10-29", 53800]]);
  assert.equal(errors.length, 0);
});
