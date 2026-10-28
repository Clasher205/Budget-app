/** CSV-Import: Encoding/Trennzeichen erkennen, Zahlen- und Datumsparser, Spaltenzuordnung, Duplikat-Schlüssel. */
import { normalizeText, pad2 } from "./format.js";

/** Bytes → { text, encoding }: UTF-8 (mit/ohne BOM), sonst Windows-1252. */
export function decodeBytes(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(data.subarray(3)), encoding: "UTF-8-BOM" };
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(data), encoding: "UTF-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(data), encoding: "Windows-1252" };
  }
}

/** Zerlegt CSV-Text in Zeilen (Arrays von Zellen), beachtet Anführungszeichen. */
export function parseCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; }
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell); cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null;
  let bestCount = 0;
  for (const [v, c] of counts) if (c > bestCount) { best = v; bestCount = c; }
  return [best, bestCount];
}

/** Wählt ";" oder "," – je nachdem, was die gleichmäßigste Spaltenanzahl (> 1) ergibt. */
export function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30).join("\n");
  let best = ";";
  let bestScore = [-1, -1];
  for (const delim of [";", ","]) {
    const counts = parseCsv(sample, delim).map((r) => r.length).filter((c) => c > 1);
    if (!counts.length) continue;
    const [mode, freq] = mostCommon(counts);
    if (freq > bestScore[0] || (freq === bestScore[0] && mode > bestScore[1])) {
      best = delim; bestScore = [freq, mode];
    }
  }
  return best;
}

function uniqueHeaders(headers) {
  const seen = new Map();
  return headers.map((h, i) => {
    const name = h.trim() || `Spalte ${i + 1}`;
    const n = (seen.get(name) || 0) + 1;
    seen.set(name, n);
    return n === 1 ? name : `${name} (${n})`;
  });
}

/** Liest eine Bank-CSV fehlertolerant. Vorspannzeilen werden übersprungen, kaputte Zeilen gemeldet. */
export function readCsv(text) {
  const delimiter = detectDelimiter(text);
  const all = parseCsv(text, delimiter);
  const lengths = all.map((r) => r.length).filter((l) => l > 1);
  if (!lengths.length) throw new Error("Die Datei enthält keine erkennbare Tabelle.");
  const [width] = mostCommon(lengths);
  const headerIdx = all.findIndex((r) => r.length === width);
  const headers = uniqueHeaders(all[headerIdx]);
  const rows = [];
  const errors = [];
  for (let i = headerIdx + 1; i < all.length; i++) {
    let cells = all[i];
    const line = i + 1;
    if (!cells.some((c) => c.trim())) continue;
    if (cells.length > width && !cells.slice(width).some((c) => c.trim())) cells = cells.slice(0, width);
    if (cells.length !== width) {
      errors.push({ line, reason: `falsche Spaltenanzahl (${cells.length} statt ${width})` });
      continue;
    }
    rows.push({ line, cells: cells.map((c) => c.trim()) });
  }
  return { headers, rows, errors, delimiter, headerLine: headerIdx + 1 };
}

const THOUSANDS_DOT = /^\d{1,3}(\.\d{3})+$/;

/** Parst deutsche und englische Betragsformate zu ganzen Cent. Wirft bei ungültigen Werten. */
export function parseAmount(value) {
  if (value === null || value === undefined) throw new Error("leerer Betrag");
  let s = String(value).trim().replace(/[ \s']/g, "").replace(/eur|€/gi, "");
  if (!s) throw new Error("leerer Betrag");
  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) { negative = true; s = s.slice(1, -1); }
  if (s.endsWith("-")) { negative = true; s = s.slice(0, -1); }
  if (s.startsWith("-")) { negative = !negative; s = s.slice(1); } else if (s.startsWith("+")) { s = s.slice(1); }
  if (s.includes(",") && s.includes(".")) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    if (s.split(",").length > 2) throw new Error(`ungültiger Betrag '${value}'`);
    s = s.replace(",", ".");
  } else if (s.includes(".") && THOUSANDS_DOT.test(s)) {
    s = s.replace(/\./g, "");
  }
  const match = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!match) throw new Error(`ungültiger Betrag '${value}'`);
  const frac = (match[2] || "").padEnd(3, "0");
  let cents = Number(match[1]) * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) cents += 1;
  return negative ? -cents : cents;
}

function validDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Parst TT.MM.JJJJ, TT.MM.JJ, JJJJ-MM-TT, TT/MM/JJJJ, TT-MM-JJJJ zu "JJJJ-MM-TT". */
export function parseDate(value) {
  const s = String(value ?? "").trim();
  if (!s) throw new Error("leeres Datum");
  let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(s);
  let y; let mo; let d;
  if (m) {
    d = Number(m[1]); mo = Number(m[2]); y = Number(m[3]);
    if (m[3].length === 2) y += y < 70 ? 2000 : 1900;
  } else if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) {
    y = Number(m[1]); mo = Number(m[2]); d = Number(m[3]);
  } else {
    throw new Error(`ungültiges Datum '${value}'`);
  }
  if (!validDate(y, mo, d)) throw new Error(`ungültiges Datum '${value}'`);
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

/** Schlüssel für die Duplikaterkennung: Datum, Betrag, Empfänger, Verwendungszweck (ohne Groß-/Kleinschreibung). */
export function transactionKey(date, amount, payee, purpose) {
  return [date, amount, normalizeText(payee).toLowerCase(), normalizeText(purpose).toLowerCase()].join("|");
}

const GUESSES = {
  date: ["buchungsdatum", "buchungstag", "datum", "date", "valuta", "wertstellung"],
  amount: ["betrag (€)", "betrag (eur)", "betrag", "umsatz", "amount"],
  purpose: ["verwendungszweck", "buchungstext", "beschreibung", "zweck", "text"],
  payee: ["empfänger/auftraggeber", "beguenstigter/zahlungspflichtiger", "begünstigter/zahlungspflichtiger",
    "zahlungsempfänger", "auftraggeber", "empfänger", "name", "gegenkonto"],
  debit: ["soll", "belastung", "ausgang"],
  credit: ["haben", "gutschrift", "eingang"],
};

export function emptyMapping() {
  return { date: null, amount: null, purpose: null, payee: null, debit: null, credit: null, useDebitCredit: false };
}

/** Schlägt anhand der Spaltennamen eine Zuordnung vor (erst exakte Treffer, dann Teilstrings). */
export function guessMapping(headers) {
  const lowered = headers.map((h) => [h, h.toLowerCase().trim()]);
  const mapping = emptyMapping();
  const used = new Set();
  for (const exact of [true, false]) {
    for (const field of ["date", "purpose", "payee", "debit", "credit", "amount"]) {
      if (mapping[field]) continue;
      for (const keyword of GUESSES[field]) {
        const hit = lowered.find(([h, low]) => !used.has(h) && (exact ? low === keyword : low.includes(keyword)));
        if (hit) { mapping[field] = hit[0]; used.add(hit[0]); break; }
      }
    }
  }
  if (!mapping.amount && (mapping.debit || mapping.credit)) mapping.useDebitCredit = true;
  return mapping;
}

export function mappingProblems(mapping) {
  const missing = [];
  if (!mapping.date) missing.push("Buchungsdatum");
  if (mapping.useDebitCredit) {
    if (!mapping.debit && !mapping.credit) missing.push("Soll- und/oder Haben-Spalte");
  } else if (!mapping.amount) {
    missing.push("Betrag");
  }
  if (!mapping.purpose && !mapping.payee) missing.push("Verwendungszweck oder Empfänger");
  return missing;
}

/** Wandelt CSV-Zeilen in Buchungen um; fehlerhafte Zeilen werden gesammelt statt abzubrechen. */
export function transform(parsed, mapping) {
  const index = Object.fromEntries(parsed.headers.map((h, i) => [h, i]));
  const cell = (row, column) => (column && column in index ? (row.cells[index[column]] ?? "").trim() : "");
  const rows = [];
  const errors = [];
  for (const row of parsed.rows) {
    try {
      const date = parseDate(cell(row, mapping.date));
      let amount;
      if (mapping.useDebitCredit) {
        const debit = cell(row, mapping.debit);
        const credit = cell(row, mapping.credit);
        if (!debit && !credit) throw new Error("kein Betrag in Soll/Haben");
        amount = (credit ? Math.abs(parseAmount(credit)) : 0) - (debit ? Math.abs(parseAmount(debit)) : 0);
      } else {
        amount = parseAmount(cell(row, mapping.amount));
      }
      const payee = normalizeText(cell(row, mapping.payee));
      const purpose = normalizeText(cell(row, mapping.purpose));
      rows.push({ line: row.line, date, amount, payee, purpose, key: transactionKey(date, amount, payee, purpose) });
    } catch (err) {
      errors.push({ line: row.line, reason: err.message });
    }
  }
  return { rows, errors };
}

/** Fehler nach Grund gruppieren (ohne konkrete Werte). */
export function summarizeErrors(errors) {
  const counts = {};
  for (const e of errors) {
    const reason = e.reason.split(" '")[0];
    counts[reason] = (counts[reason] || 0) + 1;
  }
  return counts;
}
