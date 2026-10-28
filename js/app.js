/** App-Rahmen: Laden/Speichern, Navigation, Rendering, Service Worker. */
import { loadState, requestPersistence, saveState } from "./storage.js";
import { createState } from "./state.js";
import { icon, toast } from "./ui.js";
import * as course from "./pages/course.js";
import * as overview from "./pages/overview.js";
import * as transactions from "./pages/transactions.js";
import * as importPage from "./pages/import.js";
import * as budgetPage from "./pages/budget.js";
import * as fixedPage from "./pages/fixed.js";
import * as settings from "./pages/settings.js";
import * as more from "./pages/more.js";

const ROUTES = {
  "": { page: course, title: "Kurs", nav: "kurs" },
  uebersicht: { page: overview, title: "Übersicht", nav: "uebersicht" },
  buchungen: { page: transactions, title: "Buchungen", nav: "buchungen" },
  import: { page: importPage, title: "Import", nav: "import" },
  budget: { page: budgetPage, title: "Budget", nav: "mehr" },
  fixkosten: { page: fixedPage, title: "Fixkosten", nav: "mehr" },
  einstellungen: { page: settings, title: "Einstellungen", nav: "mehr" },
  mehr: { page: more, title: "Mehr", nav: "mehr" },
};

const BOTTOM_NAV = [["#/", "Kurs", "course", "kurs"], ["#/uebersicht", "Übersicht", "overview", "uebersicht"],
  ["#/buchungen", "Buchungen", "list", "buchungen"], ["#/import", "Import", "upload", "import"], ["#/mehr", "Mehr", "more", "mehr"]];
const SIDE_NAV = [["#/", "Kurs", "course", ""], ["#/uebersicht", "Übersicht", "overview", "uebersicht"],
  ["#/buchungen", "Buchungen", "list", "buchungen"], ["#/import", "Import", "upload", "import"],
  ["#/budget", "Budget", "budget", "budget"], ["#/fixkosten", "Fixkosten", "calendar", "fixkosten"],
  ["#/einstellungen", "Einstellungen", "settings", "einstellungen"]];

const ctx = {
  state: null,
  ui: {},
  async commit(fn, message) {
    const result = fn(ctx.state);
    ctx.state.meta.updated = new Date().toISOString();
    await saveState(ctx.state);
    if (message) toast(message);
    rerender();
    return result;
  },
  async replaceState(state) {
    ctx.state = state;
    ctx.ui = {};
    await saveState(state);
    rerender();
  },
  async resetState() {
    await ctx.replaceState(createState());
  },
  rerender: () => rerender(),
};

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  return { name: parts[0] in ROUTES ? parts[0] : "", sub: parts[1] || "" };
}

function renderNav(route) {
  const current = ROUTES[route.name];
  document.querySelector(".bottom-nav").innerHTML = BOTTOM_NAV.map(([href, label, ic, key]) =>
    `<a href="${href}" class="${current.nav === key ? "active" : ""}" ${current.nav === key ? 'aria-current="page"' : ""}>${icon(ic)}<span>${label}</span></a>`).join("");
  document.querySelector(".sidebar nav").innerHTML = SIDE_NAV.map(([href, label, ic, key]) =>
    `<a href="${href}" class="${route.name === key ? "active" : ""}">${icon(ic)}<span>${label}</span></a>`).join("");
}

let lastRoute = null;

function rerender() {
  const route = parseRoute();
  const key = `${route.name}/${route.sub}`;
  const keepScroll = key === lastRoute;
  const scroll = window.scrollY;
  renderNav(route);
  const { page, title } = ROUTES[route.name];
  document.title = `${title} · Budget`;
  const main = document.querySelector("main");
  const view = document.createElement("div");
  try {
    view.innerHTML = page.render(ctx, route.sub);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="box bad">Diese Seite konnte nicht angezeigt werden: ${err.message}</div>`;
  }
  main.replaceChildren(view);
  bindCommon(view);
  page.bind?.(view, ctx);
  window.scrollTo(0, keepScroll ? scroll : 0);
  lastRoute = key;
}

/** Gemeinsame Bindungen: data-bind (Auswahl → ctx.ui) und data-bind-check (Checkbox → ctx.ui). */
function bindCommon(view) {
  view.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.bind) { ctx.ui[el.dataset.bind] = el.value; rerender(); }
    if (el.dataset.bindCheck) { ctx.ui[el.dataset.bindCheck] = el.checked; rerender(); }
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  navigator.serviceWorker.register("./sw.js").then((reg) => {
    const showUpdate = (worker) => {
      if (document.querySelector(".update-bar")) return;
      const bar = document.createElement("div");
      bar.className = "update-bar";
      bar.innerHTML = 'Eine neue Version der App ist da. <button>Jetzt aktualisieren</button>';
      bar.querySelector("button").addEventListener("click", () => worker.postMessage("skipWaiting"));
      document.body.prepend(bar);
    };
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const worker = reg.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdate(worker);
      });
    });
  }).catch((err) => console.warn("Service Worker nicht registriert:", err));
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!reloading) { reloading = true; location.reload(); }
  });
}

async function start() {
  try {
    ctx.state = await loadState();
  } catch (err) {
    document.querySelector("main").innerHTML = `<div class="box bad">Der Gerätespeicher ist nicht verfügbar (${err.message}).
      Im privaten Modus mancher Browser funktioniert die App nicht.</div>`;
    return;
  }
  window.addEventListener("hashchange", rerender);
  rerender();
  if (ctx.state.transactions.length) requestPersistence();
  registerServiceWorker();
}

start();
