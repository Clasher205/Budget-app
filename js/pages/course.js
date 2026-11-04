/** Startseite „Kurs“: Töpfe mit Kursanzeige, Rest pro Tag und Monatsvergleich. */
import { formatDate, formatEur, formatMonth, formatPct, monthOf, percent, shiftMonth, todayIso } from "../logic/format.js";
import { potAmounts, potHistory, potStatus, potTransactions } from "../logic/pots.js";
import { potBudgetFor } from "../state.js";
import { countedTransactions } from "../data.js";
import { courseChart } from "../charts.js";
import { esc, monthSelect, monthList } from "../ui.js";

/** Aufklappbare Liste der Buchungen, aus denen die Zahlen eines Topfs berechnet werden. */
function countedList(list, isSpend, month) {
  const sorted = [...list].sort((a, b) => (a.bookedDate || a.date).localeCompare(b.bookedDate || b.date));
  return `<details style="margin-top:8px"><summary>Welche Buchungen zählen? (${sorted.length})</summary>
    <p class="subtle small">${isSpend ? "Alle Abbuchungen dieses Kontos außer Umbuchungen. Kategorien dienen nur der Beschreibung."
    : "Alle Eingänge und Abgänge dieses Kontos, auch Umbuchungen."} Eingänge ab dem Stichtag des Vormonats zählen für ${formatMonth(month)}.</p>
    <ul class="list">${sorted.map((t) => `<li><div class="tx-main"><div><div class="tx-title">${esc(t.payee || "–")}</div>
      <div class="tx-sub">${formatDate(t.bookedDate || t.date)}${t.bookedDate ? ` · zählt für ${formatMonth(month)}` : ""}${t.transfer ? " · Umbuchung" : ""}${t.purpose ? ` · ${esc(t.purpose)}` : ""}</div></div>
      <div class="amount ${t.amount > 0 ? "pos" : ""}">${formatEur(t.amount)}</div></div></li>`).join("")}</ul></details>`;
}

function potCard(state, account, month, today) {
  const budget = potBudgetFor(state, account, month);
  const tx = countedTransactions(state).filter((t) => t.accountId === account.id && t.date.startsWith(month));
  const s = potStatus(account.potType, budget, month, potAmounts(tx, account.potType), today);
  const isSpend = s.potType === "Ausgaben";
  const share = budget ? Math.min(Math.max(s.used / budget, 0), 1) : 0;
  const idealShare = s.days ? s.day / s.days : 0;
  const hero = isSpend
    ? (s.perDayRemaining !== null
      ? `<div class="hero"><span class="big">${formatEur(s.perDayRemaining)}</span><span class="subtle">pro Tag ab heute verfügbar</span></div>`
      : `<div class="hero"><span class="big">${formatEur(s.remaining)}</span><span class="subtle">übrig</span></div>`)
    : `<div class="hero"><span class="big">${formatEur(s.used)}</span><span class="subtle">netto gespart · Ziel ${formatEur(budget)}</span></div>`;
  const aheadLabel = isSpend
    ? (s.ahead >= 0 ? "unter Kurs ✓" : "über Kurs")
    : (s.ahead >= 0 ? "vor dem Plan ✓" : "hinter dem Plan");
  const metrics = isSpend
    ? [["Budget", formatEur(budget), `${formatEur(s.perDayNominal)} pro Tag`],
      ["Ausgegeben", formatEur(s.used), `${formatPct(percent(s.used, budget))} verbraucht`],
      ["Soll bis heute", formatEur(s.ideal), `Tag ${s.day} von ${s.days}`],
      ["Abweichung", formatEur(Math.abs(s.ahead)), aheadLabel]]
    : [["Sparziel", formatEur(budget), "pro Monat, netto"],
      ["Eingezahlt", formatEur(s.inflow), "inkl. Umbuchungen"],
      ["Abgänge", formatEur(-s.outflow), "z. B. Sparplan, Auto"],
      ["Netto gespart", formatEur(s.used), s.used >= budget
        ? `Ziel erreicht ✓${s.used > budget ? ` (+${formatEur(s.used - budget)})` : ""}`
        : `noch ${formatEur(budget - s.used)} bis zum Ziel`]];
  const barClass = s.level === "bad" ? "bad" : s.level === "warn" ? "warn" : "";
  return `<section class="card">
    <div class="row between"><div><h2 style="margin:0">${esc(account.name)}</h2>
      <span class="subtle">${isSpend ? "Ausgaben-Topf" : "Sparziel"} · ${formatMonth(month)}</span></div>
      <span class="pill ${s.level}">${isSpend ? (s.level === "good" ? "im Kurs" : s.level === "warn" ? "knapp" : s.level === "bad" ? "über Kurs" : "–") : (s.level === "good" ? "erreicht" : "läuft")}</span></div>
    ${hero}
    <div class="progress" title="${Math.round(share * 100)} %"><span class="${barClass}" style="width:${share * 100}%"></span>
      ${s.day > 0 && s.day < s.days ? `<i style="left:calc(${idealShare * 100}% - 1px)" title="Soll bis heute"></i>` : ""}</div>
    <div class="subtle small" style="margin-bottom:10px">Balken = ${isSpend ? "verbraucht" : "netto gespart"} · Strich = Soll bis heute</div>
    <div class="grid cols-4">${metrics.map(([l, v, n]) => `<div class="metric"><div class="label">${l}</div><div class="value">${v}</div><div class="note">${n}</div></div>`).join("")}</div>
    <div class="box ${s.level}">${esc(s.status)}</div>
    ${s.day > 0 ? courseChart(s) : ""}
    ${tx.length ? countedList(potTransactions(tx, account.potType), isSpend, month)
    : '<p class="subtle small">Für dieses Konto gibt es in diesem Monat noch keine importierten Buchungen.</p>'}
  </section>`;
}

function historyTable(state, pots, month, today) {
  const months = monthList(state);
  const first = months.at(-1);
  const range = [5, 4, 3, 2, 1, 0].map((i) => shiftMonth(month, -i)).filter((m) => m >= first);
  const rows = [];
  for (const acc of pots) {
    const tx = countedTransactions(state).filter((t) => t.accountId === acc.id);
    const plan = range.map((m) => [m, potBudgetFor(state, acc, m)]);
    for (const h of potHistory(acc.potType, plan, tx, [], today)) {
      const result = h.kept === null ? "läuft" : h.kept ? "✅" : "❌";
      const tone = h.kept === null ? "" : h.kept ? "pos" : "";
      const [name, year] = formatMonth(h.month).split(" ");
      rows.push(`<tr><td>${esc(acc.name)}<div class="subtle small">${name.slice(0, 3)} ${year}</div></td>
        <td class="num">${formatEur(h.used)}<div class="subtle small">von ${formatEur(h.budget)}</div></td>
        <td class="num"><span class="${tone}">${formatEur(h.diff)}</span><div class="small">${result}</div></td></tr>`);
    }
  }
  return `<section class="card"><h2>Monatsvergleich</h2><div class="table-wrap"><table>
    <thead><tr><th>Topf / Monat</th><th class="num">Ist / Budget</th><th class="num">Differenz</th></tr></thead>
    <tbody>${rows.join("")}</tbody></table></div>
    <p class="subtle small">Differenz positiv = Budget unterschritten bzw. Sparziel übertroffen. ✅ eingehalten/erreicht · ❌ verfehlt · läuft = aktueller Monat.</p></section>`;
}

function backupHint(state) {
  if (!state.transactions.length) return "";
  const last = state.meta.lastBackup;
  const days = last ? (Date.now() - Date.parse(last)) / 86400000 : Infinity;
  if (days < 14) return "";
  return `<div class="box info row between"><span>${last ? "Deine letzte Sicherung ist über zwei Wochen alt." : "Du hast noch keine Sicherung erstellt."}
    Die Daten liegen nur auf diesem Gerät.</span><a class="btn" href="#/einstellungen/sicherung">Sicherung erstellen</a></div>`;
}

export function render(ctx) {
  const { state, ui } = ctx;
  const today = todayIso();
  const month = ui.courseMonth || monthOf(today);
  const pots = state.accounts.filter((a) => a.potType && potBudgetFor(state, a, month));
  let body;
  if (!state.accounts.length) {
    body = `<div class="card empty"><h2>Willkommen!</h2><p>Lege zuerst deine Konten an, z. B. Hauptkonto, Essenskonto und Sparkonto.
      Oder lade eine Sicherung bzw. die Daten aus der alten App.</p>
      <a class="btn primary" href="#/einstellungen/konten">Konten anlegen</a> <a class="btn" href="#/einstellungen/sicherung">Sicherung laden</a></div>`;
  } else if (!pots.length) {
    body = `<div class="card empty"><h2>Noch keine Töpfe</h2><p>Gib deinen Konten einen Monatsbetrag, z. B. Essenskonto = 250 €.
      Dann siehst du hier jeden Tag, ob du im Kurs bist.</p><a class="btn primary" href="#/einstellungen/toepfe">Töpfe einrichten</a></div>`;
  } else {
    body = pots.map((a) => potCard(state, a, month, today)).join("") + historyTable(state, pots, month, today);
  }
  return `<div class="page-head"><div><h1>Kurs</h1><div class="subtle">Soll bis heute = Monatsbudget ÷ Tage × vergangene Tage</div></div>
    <div style="min-width:180px">${monthSelect(state, "courseMonth", month)}</div></div>${backupHint(state)}${body}`;
}
