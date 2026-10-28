/** Deutsche Formate und Datums-/Monatshelfer. Beträge sind immer ganze Cent (Number). */

export const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/** Kaufmännisch runden (Hälfte weg von null). */
export function roundHalfUp(value) {
  return Math.sign(value) * Math.round(Math.abs(value));
}

function groupThousands(digits) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** 123456 → "1.234,56 €"; null → "–". */
export function formatEur(cents) {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return "–";
  const rounded = roundHalfUp(cents);
  const abs = Math.abs(rounded);
  const euros = groupThousands(String(Math.floor(abs / 100)));
  return `${rounded < 0 ? "-" : ""}${euros},${String(abs % 100).padStart(2, "0")} €`;
}

/** Betrag für Eingabefelder: 123456 → "1234,56". */
export function formatAmountInput(cents) {
  if (cents === null || cents === undefined) return "";
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

/** Prozentwert (Zahl) → "12,35 %"; null → "–". */
export function formatPct(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  const hundredths = roundHalfUp(value * 100);
  const abs = Math.abs(hundredths);
  return `${hundredths < 0 ? "-" : ""}${groupThousands(String(Math.floor(abs / 100)))},${String(abs % 100).padStart(2, "0")} %`;
}

/** Anteil in Prozent mit 2 Nachkommastellen, null bei Division durch 0. */
export function percent(part, whole) {
  if (!whole) return null;
  return roundHalfUp((part * 10000) / whole) / 100;
}

/** "2026-03-07" → "07.03.2026". */
export function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/** "2026-03" → "März 2026". */
export function formatMonth(month) {
  const [y, m] = month.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

export function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Lokales Datum als "JJJJ-MM-TT". */
export function isoDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Zeitstempel (ISO, UTC) → "28.10.2026, 16:52 Uhr" in Ortszeit; leer bei fehlendem Wert. */
export function formatDateTime(timestamp) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatDate(isoDate(d))}, ${pad2(d.getHours())}:${pad2(d.getMinutes())} Uhr`;
}

export function todayIso() {
  return isoDate(new Date());
}

export function monthOf(iso) {
  return iso.slice(0, 7);
}

export function daysInMonth(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function shiftMonth(month, delta) {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${pad2((index % 12) + 1)}`;
}

/** Tage zwischen zwei ISO-Daten (b − a). */
export function daysBetween(a, b) {
  const toUtc = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

export function addDays(iso, days) {
  const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + days));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Monate addieren, Tag auf Monatsende begrenzen (31.01. + 1 → 28./29.02.). */
export function addMonths(iso, months, anchorDay = null) {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const day = anchorDay ?? Number(iso.slice(8, 10));
  const target = shiftMonth(`${y}-${pad2(m)}`, months);
  return `${target}-${pad2(Math.min(day, daysInMonth(target)))}`;
}

export function normalizeText(value) {
  return String(value ?? "").split(/\s+/).filter(Boolean).join(" ");
}
