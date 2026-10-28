# Budget-PWA: Kontext für Claude

## Wer und was
- Nutzer: Lucca, Student mit Nebenbusiness. **Keine Programmierkenntnisse.** Erkläre auf Deutsch, einfach und konkret
  (welcher Klick, welcher Befehl). Bitte um Screenshots, wenn etwas auf seinem Bildschirm unklar ist.
- Projekt: installierbare Web-App (PWA) für Handy (iPhone/Android) und Windows-Laptop. Nachfolger der lokalen
  Streamlit-App im Ordner `budget-app` (Python), die weiterhin existiert.
- Daten liegen **nur im Gerät** (IndexedDB). Kein Server, keine Cloud, kein Tracking. Der Abgleich zwischen Geräten
  läuft über eine Sicherungsdatei (JSON). Die Content-Security-Policy in `index.html` (`connect-src 'self'`) muss so
  bleiben.

## Datenschutz: unbedingt einhalten
- Niemals echte Sicherungsdateien, Kontoauszüge oder CSVs des Nutzers öffnen, außer er verlangt es ausdrücklich.
- Zum Testen nur erfundene Daten (z. B. `../budget-app/beispieldaten/`).
- Keine Fremdbibliotheken von CDNs, keine Analytics, keine Netzwerkaufrufe einbauen.

## Kontenmodell des Nutzers
Hauptkonto (alle Einnahmen, gleichzeitig Freizeit-Topf), Essenskonto (Ausgaben-Topf, z. B. 250 €), Sparkonto (Sparziel),
N26-Geschäftskonto (Bereich Business). Kernfunktion ist die **Kursanzeige**: Soll bis heute = Budget ÷ Tage × vergangene
Tage. Rest pro Tag = verbleibend ÷ verbleibende Tage (inkl. heute).

## Technik
- Reines HTML/CSS/JS (ES-Module), kein Build. Beträge als **ganze Cent** (Number). Datum als ISO-String `JJJJ-MM-TT`.
- Rechenlogik in `js/logic/` ist rein und mit `node --test tests/*.test.js` getestet. Alle Tests müssen grün sein.
- Seiten in `js/pages/`: `render(ctx, sub)` liefert HTML, `bind(root, ctx)` hängt Ereignisse an. Änderungen am State
  laufen immer über `ctx.commit(fn, meldung)`. Das speichert und rendert neu.
- `data-bind="key"` an Selects/Inputs schreibt in `ctx.ui[key]` und rendert neu (für Filter).
- Nutzertexte immer mit `esc()` ausgeben.
- **Bei jeder Änderung an App-Dateien `VERSION` in `sw.js` hochzählen** und neue Dateien in die `FILES`-Liste
  eintragen (ein Test prüft die Liste).
- State-Format ändern: Feld in `createState` ergänzen, `upgradeState` muss alte Stände ergänzen, und
  `FORMAT_VERSION` nur bei inkompatiblen Änderungen erhöhen.
- Oberfläche auf Deutsch, Beträge `1.234,56 €`, Datum `TT.MM.JJJJ` (Helfer in `js/logic/format.js`).
- Mobil zuerst: Jede Seite muss bei 390 px Breite ohne waagrechtes Scrollen funktionieren.
- Lokal testen: `python -m http.server 8600`, Playwright mit Chromium (`/opt/pw-browsers/...` in der Cloud-Umgebung).

## Hosting
GitHub Pages aus einem öffentlichen Repository (nur Code, keine Daten). Der Nutzer hat das GitHub-Konto `Clasher205`.

## Offene Ideen
- Bankanbindung (FinTS) nur lokal denkbar, N26 hat kein FinTS. Im Browser technisch nicht direkt möglich (CORS),
  daher vorerst CSV.
- Optional: verschlüsselte Sync-Datei in eigenem Cloud-Speicher (vom Nutzer bisher nicht gewünscht).
