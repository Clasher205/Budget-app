/** Schlanke SVG-/HTML-Diagramme: Kursverlauf, Plan-vs-Ist-Balken, Monatsbalken, Ringdiagramm. */
import { formatEur, formatMonth } from "./logic/format.js";
import { esc } from "./ui.js";

const PALETTE = ["#2a6fdb", "#f29d38", "#3ba272", "#9b59b6", "#e15759", "#4cb5c4", "#b07aa1", "#c9a227",
  "#76b7b2", "#ff9da7", "#9c755f", "#8c96a5"];

function niceMax(value) {
  if (value <= 0) return 100;
  const exp = 10 ** Math.floor(Math.log10(value));
  const n = value / exp;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * exp;
}

function euroShort(cents) {
  const euros = cents / 100;
  return `${Math.round(euros).toLocaleString("de-DE")} €`;
}

/** Kursdiagramm: gestrichelte Soll-Linie vs. tatsächlicher Verlauf, waagrechte Budgetlinie. */
export function courseChart(status) {
  const W = 600; const H = 250; const L = 78; const R = 12; const T = 14; const B = 34;
  const maxVal = niceMax(Math.max(status.budget, ...status.cumulative, 1) * 1.05);
  const x = (day) => L + ((day - 0.5) / status.days) * (W - L - R);
  const y = (v) => T + (1 - v / maxVal) * (H - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxVal);
  const grid = ticks.map((v) => `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>
    <text x="${L - 8}" y="${y(v) + 6}" text-anchor="end">${euroShort(v)}</text>`).join("");
  const dayTicks = [1, 5, 10, 15, 20, 25, status.days].filter((d, i, a) => d <= status.days && a.indexOf(d) === i)
    .map((d) => `<text x="${x(d)}" y="${H - 10}" text-anchor="middle">${d}</text>`).join("");
  const ideal = `<line class="ideal" x1="${x(0.5)}" y1="${y(0)}" x2="${x(status.days)}" y2="${y(status.budget)}"/>`;
  const budgetLine = `<line class="budget-line" x1="${L}" x2="${W - R}" y1="${y(status.budget)}" y2="${y(status.budget)}"/>`;
  const pts = status.cumulative.map((v, i) => `${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const actual = status.cumulative.length
    ? `<polyline class="actual ${status.level === "bad" ? "bad" : ""}" points="${pts}"/>
       <circle cx="${x(status.cumulative.length)}" cy="${y(status.cumulative.at(-1))}" r="4.5" fill="${status.level === "bad" ? "var(--bad)" : "var(--primary)"}"/>`
    : "";
  const labelActual = status.potType === "Ausgaben" ? "Ausgegeben" : "Gespart";
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" style="font-size:17px" role="img" aria-label="Kursverlauf: ${labelActual} ${formatEur(status.used)} von ${formatEur(status.budget)}">
    ${grid}${budgetLine}${ideal}${actual}${dayTicks}</svg>
    <div class="legend"><span><i style="background:var(--plan)"></i>Soll (gleichmäßig)</span>
    <span><i style="background:${status.level === "bad" ? "var(--bad)" : "var(--primary)"}"></i>${labelActual}</span>
    <span>Tag im Monat →</span></div></div>`;
}

/** Waagrechte Balken Plan vs. Ist je Ausgabenkategorie (Strich = Plan). */
export function planActualBars(rows) {
  const data = rows.filter((r) => r.kind === "Ausgabe" && (r.actual > 0 || r.plan));
  if (!data.length) return '<p class="subtle">Noch keine kategorisierten Ausgaben oder Budgets in diesem Monat.</p>';
  const max = Math.max(...data.map((r) => Math.max(r.actual, r.plan || 0)), 1);
  return `<div class="hbars">${data.map((r) => {
    const over = r.status === "überschritten";
    const mark = r.plan ? `<span class="mark" style="left:calc(${(r.plan / max) * 100}% - 1px)" title="Plan ${formatEur(r.plan)}"></span>` : "";
    return `<div class="hbar"><div class="top"><span>${esc(r.category)}</span>
      <span class="amount">${formatEur(r.actual)}${r.plan ? ` <span class="subtle">/ ${formatEur(r.plan)}</span>` : ""}</span></div>
      <div class="track"><div class="fill ${over ? "bad" : ""}" style="width:${Math.max((Math.max(r.actual, 0) / max) * 100, 0)}%"></div>${mark}</div></div>`;
  }).join("")}</div><div class="legend"><span><i style="background:var(--primary)"></i>Ist</span><span><i style="background:var(--text);opacity:.6;width:3px"></i>Plan</span></div>`;
}

/** Senkrechte Balken für Ausgaben pro Monat. */
export function monthBars(series) {
  const W = 420; const H = 200; const L = 70; const R = 8; const T = 12; const B = 32;
  const maxVal = niceMax(Math.max(...series.map((s) => s.value), 1) * 1.05);
  const step = (W - L - R) / series.length;
  const y = (v) => T + (1 - v / maxVal) * (H - T - B);
  const grid = [0, 0.5, 1].map((f) => f * maxVal).map((v) => `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>
    <text x="${L - 8}" y="${y(v) + 5}" text-anchor="end">${euroShort(v)}</text>`).join("");
  const bars = series.map((s, i) => {
    const bx = L + i * step + step * 0.2;
    const bw = step * 0.6;
    const [name, year] = formatMonth(s.month).split(" ");
    return `<rect class="bar" x="${bx}" y="${y(s.value)}" width="${bw}" height="${y(0) - y(s.value)}" rx="4"><title>${formatMonth(s.month)}: ${formatEur(s.value)}</title></rect>
      <text x="${bx + bw / 2}" y="${H - 8}" text-anchor="middle">${name.slice(0, 3)} ${year.slice(2)}</text>`;
  }).join("");
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" style="font-size:15px" role="img" aria-label="Ausgaben pro Monat">${grid}${bars}</svg></div>`;
}

/** Ringdiagramm mit Legende. items: [{ label, value }] */
export function donut(items) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (!total) return '<p class="subtle">Keine Ausgaben.</p>';
  const r = 60; const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = items.map((item, i) => {
    const len = (item.value / total) * c;
    const arc = `<circle r="${r}" cx="80" cy="80" fill="none" stroke="${PALETTE[i % PALETTE.length]}" stroke-width="28"
      stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 80 80)"><title>${esc(item.label)}: ${formatEur(item.value)}</title></circle>`;
    offset += len;
    return arc;
  }).join("");
  const legend = items.map((item, i) => `<span><i style="background:${PALETTE[i % PALETTE.length]}"></i>${esc(item.label)}
    <b class="amount">${formatEur(item.value)}</b> (${Math.round((item.value / total) * 100)} %)</span>`).join("");
  return `<div class="chart row" style="align-items:center;gap:16px"><svg viewBox="0 0 160 160" style="width:150px;flex:0 0 150px" role="img" aria-label="Ausgabenverteilung">${arcs}
    <text x="80" y="84" text-anchor="middle" style="font-size:13px;font-weight:600;fill:var(--text)">${euroShort(total)}</text></svg>
    <div class="legend" style="flex-direction:column;flex:1;min-width:160px">${legend}</div></div>`;
}
