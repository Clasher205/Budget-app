/** „Mehr“-Menü für die Handy-Navigation. */
import { icon } from "../ui.js";
import { SECTIONS } from "./settings.js";

export function render() {
  const links = [["#/budget", "Budget je Kategorie", "budget"], ["#/fixkosten", "Fixkosten & Abos", "calendar"],
    ...SECTIONS.map(([k, l, i]) => [`#/einstellungen/${k}`, l, i])];
  return `<div class="page-head"><h1>Mehr</h1></div><section class="card more-menu">
    ${links.map(([href, label, ic]) => `<a href="${href}">${icon(ic)}${label}</a>`).join("")}</section>
    <p class="subtle small">Budget-App · Alle Daten bleiben auf diesem Gerät. Keine Anmeldung, kein Server, keine Werbung.</p>`;
}
