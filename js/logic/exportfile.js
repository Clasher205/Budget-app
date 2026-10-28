/** Export des Monatsberichts als CSV (Excel-tauglich) und als XLSX (eigener, kleiner Writer). */
import { formatDate } from "./format.js";

/** Cent → "-1234,56" (deutsches CSV ohne Tausenderpunkt). */
function csvNumber(cents) {
  if (cents === null || cents === undefined) return "";
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

function csvPct(value) {
  return value === null || value === undefined ? "" : value.toFixed(2).replace(".", ",");
}

function csvCell(value) {
  const s = String(value ?? "");
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Tabellen für den Bericht: [{ name, header, rows }] mit typisierten Zellen { v, t: "s"|"eur"|"pct" }. */
export function reportTables(figures, budgetRows, transactions, accountNames, categoryNames) {
  const eur = (v) => ({ v, t: "eur" });
  const pct = (v) => ({ v, t: "pct" });
  const str = (v) => ({ v, t: "s" });
  return [
    {
      name: "Kennzahlen",
      header: ["Kennzahl", "Wert"],
      rows: [
        [str("Einnahmen (€)"), eur(figures.income)],
        [str("Ausgaben (€)"), eur(figures.expenses)],
        [str("Saldo (€)"), eur(figures.balance)],
        [str("Sparquote (%)"), pct(figures.savingsRate)],
      ],
    },
    {
      name: "Soll-Ist",
      header: ["Kategorie", "Art", "Plan (€)", "Ist (€)", "Differenz (€)", "Differenz (%)", "Status"],
      rows: budgetRows.map((r) => [str(r.category), str(r.kind), eur(r.plan), eur(r.actual), eur(r.diff),
        pct(r.diffPct), str(r.status)]),
    },
    {
      name: "Buchungen",
      header: ["Datum", "Konto", "Empfänger/Auftraggeber", "Verwendungszweck", "Kategorie", "Umbuchung", "Betrag (€)"],
      rows: transactions.map((t) => [str(formatDate(t.date)), str(accountNames.get(t.accountId) || ""), str(t.payee),
        str(t.purpose), str(categoryNames.get(t.categoryId) || "Unkategorisiert"), str(t.transfer ? "ja" : ""),
        eur(t.amount)]),
    },
  ];
}

/** Ein CSV mit allen Tabellen (Semikolon, Dezimalkomma, BOM für Excel). */
export function reportCsv(title, tables) {
  const lines = [`Monatsbericht;${csvCell(title)}`, ""];
  for (const table of tables) {
    lines.push(table.name, table.header.map(csvCell).join(";"));
    for (const row of table.rows) {
      lines.push(row.map((c) => (c.t === "eur" ? csvNumber(c.v) : c.t === "pct" ? csvPct(c.v) : csvCell(c.v))).join(";"));
    }
    lines.push("");
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Minimaler ZIP-Writer (ohne Kompression), reicht für XLSX. */
export function zipFiles(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBytes = enc.encode(name);
    const data = typeof content === "string" ? enc.encode(content) : content;
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const parts = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  for (const p of parts) { out.set(p, pos); pos += p.length; }
  return out;
}

function xmlEscape(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function colName(i) {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function sheetXml(table) {
  const cell = (c, ref) => {
    if (c.v === null || c.v === undefined || c.v === "") return "";
    if (c.t === "eur") return `<c r="${ref}" s="1"><v>${c.v / 100}</v></c>`;
    if (c.t === "pct") return `<c r="${ref}" s="2"><v>${c.v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(c.v)}</t></is></c>`;
  };
  const all = [table.header.map((h) => ({ v: h, t: "s" })), ...table.rows];
  const widths = table.header.map((h, i) => Math.min(60, Math.max(...all.slice(0, 200).map((r) => String(r[i]?.v ?? "").length), h.length) + 2));
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const rows = all.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => cell(c, `${colName(ci)}${ri + 1}`)).join("")}</row>`);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${rows.join("")}</sheetData></worksheet>`;
}

/** XLSX-Datei (Uint8Array) mit einem Blatt pro Tabelle. */
export function reportXlsx(tables) {
  const sheets = tables.map((t, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(t)]);
  const ns = "http://schemas.openxmlformats.org";
  return zipFiles([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${tables.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${ns}/spreadsheetml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><sheets>${tables.map((t, i) => `<sheet name="${xmlEscape(t.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${ns}/package/2006/relationships">${tables.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${ns}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${tables.length + 1}" Type="${ns}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${ns}/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ...sheets,
  ]);
}
