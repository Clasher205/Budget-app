/** Oberflächen-Helfer: Escaping, Icons, Monatsauswahl, Hinweise und Dialoge. */
import { formatMonth, monthOf, todayIso } from "./logic/format.js";

export function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const ICON_PATHS = {
  course: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  overview: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  upload: '<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  budget: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  save: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/>',
  file: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/>',
};

export function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ""}</svg>`;
}

/** Monate mit Buchungen plus aktueller Monat, neueste zuerst. */
export function monthList(state) {
  const months = new Set(state.transactions.map((t) => monthOf(t.date)));
  months.add(monthOf(todayIso()));
  return [...months].sort().reverse();
}

export function monthSelect(state, id, selected) {
  return `<select id="${id}" data-bind="${id}">${monthList(state)
    .map((m) => `<option value="${m}" ${m === selected ? "selected" : ""}>${formatMonth(m)}</option>`).join("")}</select>`;
}

export function options(items, selected, placeholder = null) {
  const head = placeholder !== null ? `<option value="">${esc(placeholder)}</option>` : "";
  return head + items.map(([value, label]) => `<option value="${esc(value)}" ${String(value) === String(selected ?? "") ? "selected" : ""}>${esc(label)}</option>`).join("");
}

let toastTimer = null;
export function toast(message) {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.textContent = message;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3500);
}

/** Bestätigungsdialog; resolve(true/false). */
export function confirmDialog(message, { okText = "OK", danger = false } = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.innerHTML = `<form method="dialog"><p>${message}</p><div class="actions">
      <button value="cancel">Abbrechen</button>
      <button value="ok" class="${danger ? "danger" : "primary"}">${esc(okText)}</button></div></form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener("close", () => { resolve(dlg.returnValue === "ok"); dlg.remove(); });
    dlg.showModal();
  });
}

/**
 * Formular-Dialog. `body` ist HTML mit benannten Feldern; `onSubmit(formData)` darf werfen,
 * dann bleibt der Dialog offen und zeigt den Fehler.
 */
export function formDialog(title, body, onSubmit, { okText = "Speichern" } = {}) {
  const dlg = document.createElement("dialog");
  dlg.innerHTML = `<form novalidate><h2>${esc(title)}</h2>${body}<div class="box bad" hidden></div>
    <div class="actions"><button type="button" data-close>Abbrechen</button><button class="primary">${esc(okText)}</button></div></form>`;
  document.body.appendChild(dlg);
  const form = dlg.querySelector("form");
  const error = dlg.querySelector(".box.bad");
  dlg.querySelector("[data-close]").addEventListener("click", () => dlg.close());
  dlg.addEventListener("close", () => dlg.remove());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await onSubmit(new FormData(form));
      dlg.close();
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  });
  dlg.showModal();
  return dlg;
}
