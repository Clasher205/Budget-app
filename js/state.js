/** Datenmodell und Aktionen (reine Funktionen auf dem State-Objekt, ohne Browser-APIs). */
import { matchCategory, applyRules, matchTransfers } from "./logic/rules.js";
import { budgetKey, overrideKey } from "./logic/budget.js";

export const FORMAT_VERSION = 1;

export const DEFAULT_CATEGORIES = [
  ["Miete/Wohnen", "Ausgabe"], ["Lebensmittel", "Ausgabe"], ["Mobilität", "Ausgabe"], ["Abos/Software", "Ausgabe"],
  ["Versicherungen", "Ausgabe"], ["Freizeit", "Ausgabe"], ["Studium", "Ausgabe"], ["Gesundheit", "Ausgabe"],
  ["Shopping", "Ausgabe"], ["Einnahmen Job", "Einnahme"], ["Einnahmen Business", "Einnahme"],
  ["Business-Ausgaben", "Ausgabe"], ["Steuern/Rücklagen", "Ausgabe"], ["Sonstiges", "Ausgabe"],
];

export function createState() {
  const state = {
    version: FORMAT_VERSION,
    nextId: 1,
    accounts: [],
    categories: [],
    transactions: [],
    rules: [],
    budgets: {},
    budgetOverrides: {},
    potOverrides: {},
    fixedCosts: [],
    ignoredSubscriptions: [],
    meta: { created: new Date().toISOString(), updated: new Date().toISOString(), lastBackup: null },
  };
  DEFAULT_CATEGORIES.forEach(([name, kind], order) => state.categories.push({ id: newId(state), name, kind, order }));
  return state;
}

export function newId(state) {
  return state.nextId++;
}

/** Fehlende Felder älterer Versionen ergänzen. */
export function upgradeState(state) {
  const fresh = createState();
  for (const key of Object.keys(fresh)) if (!(key in state)) state[key] = fresh[key];
  for (const a of state.accounts) {
    a.potExcluded ??= [];
    a.potType ??= null;
    a.potBudget ??= null;
    a.openingBalance ??= null;
    a.profile ??= null;
  }
  for (const t of state.transactions) {
    t.manual ??= false;
    t.transfer ??= false;
    t.transferManual ??= false;
  }
  const maxId = Math.max(0, ...["accounts", "categories", "transactions", "rules", "fixedCosts"]
    .flatMap((k) => state[k].map((x) => x.id)));
  state.nextId = Math.max(state.nextId || 1, maxId + 1);
  state.version = FORMAT_VERSION;
  return state;
}

// Konten

export function addAccount(state, { name, area, openingBalance = null }) {
  const clean = (name || "").trim();
  if (!clean) throw new Error("Kontoname darf nicht leer sein.");
  if (!["Privat", "Business"].includes(area)) throw new Error("Ungültiger Bereich.");
  if (state.accounts.some((a) => a.name.toLowerCase() === clean.toLowerCase())) throw new Error("Ein Konto mit diesem Namen gibt es schon.");
  const account = { id: newId(state), name: clean, area, openingBalance, potType: null, potBudget: null,
    potExcluded: [], profile: null };
  state.accounts.push(account);
  return account;
}

export function deleteAccount(state, accountId) {
  state.accounts = state.accounts.filter((a) => a.id !== accountId);
  state.transactions = state.transactions.filter((t) => t.accountId !== accountId);
  for (const key of Object.keys(state.potOverrides)) if (key.startsWith(`${accountId}|`)) delete state.potOverrides[key];
}

/** Kontostand eines Bereichs; null, wenn bei einem Konto der Anfangssaldo fehlt. */
export function areaBalance(state, area) {
  const accounts = state.accounts.filter((a) => a.area === area);
  if (!accounts.length || accounts.some((a) => a.openingBalance === null)) return null;
  const ids = new Set(accounts.map((a) => a.id));
  return accounts.reduce((s, a) => s + a.openingBalance, 0)
    + state.transactions.filter((t) => ids.has(t.accountId)).reduce((s, t) => s + t.amount, 0);
}

// Buchungen

/** Neue Buchungen speichern (Duplikate je Konto überspringen), kategorisieren, Umbuchungen suchen. */
export function importTransactions(state, accountId, rows) {
  const existing = new Set(state.transactions.filter((t) => t.accountId === accountId).map((t) => t.key));
  let inserted = 0;
  let duplicates = 0;
  for (const r of rows) {
    if (existing.has(r.key)) { duplicates++; continue; }
    existing.add(r.key);
    state.transactions.push({
      id: newId(state), accountId, date: r.date, amount: r.amount, payee: r.payee, purpose: r.purpose,
      categoryId: matchCategory(r.payee, r.purpose, state.rules), manual: false, transfer: false,
      transferManual: false, key: r.key,
    });
    inserted++;
  }
  const transfers = matchTransfers(state.transactions);
  return { inserted, duplicates, transfers };
}

export function setCategory(state, txId, categoryId) {
  const tx = state.transactions.find((t) => t.id === txId);
  tx.categoryId = categoryId;
  tx.manual = categoryId !== null;
  if (!tx.manual) tx.categoryId = matchCategory(tx.payee, tx.purpose, state.rules);
}

export function setTransfer(state, txId, value) {
  const tx = state.transactions.find((t) => t.id === txId);
  tx.transfer = value;
  tx.transferManual = true;
}

export function deleteTransaction(state, txId) {
  state.transactions = state.transactions.filter((t) => t.id !== txId);
}

// Kategorien & Regeln

export function addCategory(state, name, kind) {
  const clean = (name || "").trim();
  if (!clean) throw new Error("Name darf nicht leer sein.");
  if (state.categories.some((c) => c.name.toLowerCase() === clean.toLowerCase())) throw new Error("Diese Kategorie gibt es schon.");
  const order = Math.max(-1, ...state.categories.map((c) => c.order)) + 1;
  const cat = { id: newId(state), name: clean, kind, order };
  state.categories.push(cat);
  return cat;
}

export function deleteCategory(state, categoryId) {
  state.categories = state.categories.filter((c) => c.id !== categoryId);
  state.rules = state.rules.filter((r) => r.categoryId !== categoryId);
  for (const t of state.transactions) if (t.categoryId === categoryId) { t.categoryId = null; t.manual = false; }
  for (const f of state.fixedCosts) if (f.categoryId === categoryId) f.categoryId = null;
  for (const a of state.accounts) a.potExcluded = a.potExcluded.filter((c) => c !== categoryId);
  for (const store of [state.budgets, state.budgetOverrides]) {
    for (const key of Object.keys(store)) if (key.split("|")[0] === String(categoryId)) delete store[key];
  }
  applyRules(state.transactions, state.rules);
}

/** Regel anlegen und auf alle nicht manuellen Buchungen anwenden; gibt die Anzahl neu kategorisierter Buchungen zurück. */
export function addRule(state, keyword, categoryId, priority = null) {
  const clean = (keyword || "").trim();
  if (!clean) throw new Error("Schlüsselwort darf nicht leer sein.");
  const prio = priority ?? Math.max(0, ...state.rules.map((r) => r.priority)) + 10;
  state.rules.push({ id: newId(state), keyword: clean, categoryId, priority: prio });
  return applyRules(state.transactions, state.rules);
}

export function deleteRule(state, ruleId) {
  state.rules = state.rules.filter((r) => r.id !== ruleId);
  return applyRules(state.transactions, state.rules);
}

export function reapplyRules(state) {
  return applyRules(state.transactions, state.rules);
}

// Budgets & Töpfe

export function setBudget(state, categoryId, area, cents) {
  const key = budgetKey(categoryId, area);
  if (cents === null) delete state.budgets[key]; else state.budgets[key] = cents;
}

export function setBudgetOverride(state, categoryId, area, month, cents) {
  const key = overrideKey(categoryId, area, month);
  if (cents === null) delete state.budgetOverrides[key]; else state.budgetOverrides[key] = cents;
}

export function setPot(state, accountId, { potType, potBudget, potExcluded }) {
  const acc = state.accounts.find((a) => a.id === accountId);
  acc.potType = potType || null;
  acc.potBudget = potType ? potBudget : null;
  if (potExcluded) acc.potExcluded = potExcluded;
}

export function setPotOverride(state, accountId, month, cents) {
  const key = `${accountId}|${month}`;
  if (cents === null) delete state.potOverrides[key]; else state.potOverrides[key] = cents;
}

export function potBudgetFor(state, account, month) {
  return state.potOverrides[`${account.id}|${month}`] ?? account.potBudget;
}

// Fixkosten

export function saveFixedCost(state, item) {
  if (!(item.name || "").trim()) throw new Error("Name darf nicht leer sein.");
  if (!item.nextDue) throw new Error("Nächste Fälligkeit fehlt.");
  const clean = { ...item, name: item.name.trim(), amount: Math.abs(item.amount) };
  if (clean.id) {
    const idx = state.fixedCosts.findIndex((f) => f.id === clean.id);
    state.fixedCosts[idx] = clean;
  } else {
    clean.id = newId(state);
    state.fixedCosts.push(clean);
  }
  return clean;
}

export function deleteFixedCost(state, id) {
  state.fixedCosts = state.fixedCosts.filter((f) => f.id !== id);
}

// Sicherung

export function backupPayload(state) {
  return { app: "budget-pwa", format: FORMAT_VERSION, exportedAt: new Date().toISOString(), data: state };
}

/** Prüft und liest eine Sicherungsdatei; wirft bei ungültigem Inhalt. */
export function parseBackup(text) {
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error("Die Datei ist keine gültige Sicherung (kein JSON)."); }
  if (payload?.app !== "budget-pwa" || typeof payload.data !== "object") {
    throw new Error("Die Datei ist keine Sicherung dieser Budget-App.");
  }
  if (payload.format > FORMAT_VERSION) throw new Error("Die Sicherung stammt aus einer neueren App-Version. Bitte App aktualisieren.");
  const data = payload.data;
  for (const key of ["accounts", "categories", "transactions"]) {
    if (!Array.isArray(data[key])) throw new Error(`Die Sicherung ist unvollständig (${key} fehlt).`);
  }
  return { exportedAt: payload.exportedAt, state: upgradeState(data) };
}
