/** Speicherung im Gerät (IndexedDB) und Datei-Helfer (Download, Teilen, Datei lesen). */
import { createState, upgradeState } from "./state.js";

const DB_NAME = "budget-app";
const STORE = "state";
const KEY = "main";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const result = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(result?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function loadState() {
  const stored = await withStore("readonly", (s) => s.get(KEY));
  return stored ? upgradeState(stored) : createState();
}

export async function saveState(state) {
  await withStore("readwrite", (s) => s.put(state, KEY));
}

/** Bittet den Browser, die Daten nicht automatisch zu löschen. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) return await navigator.storage.persist();
    return await navigator.storage?.persisted?.();
  } catch {
    return false;
  }
}

export function downloadFile(name, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Über das Teilen-Menü des Geräts senden (z. B. an sich selbst); false, wenn nicht unterstützt. */
export async function shareFile(name, content, type) {
  const file = new File([content], name, { type });
  if (!navigator.canShare?.({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title: name });
    return true;
  } catch (err) {
    if (err.name === "AbortError") return true;
    return false;
  }
}

export function readFileBytes(file) {
  return file.arrayBuffer().then((buf) => new Uint8Array(buf));
}
