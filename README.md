# Budget – Töpfe & Kurs (PWA)

Private Budget-App als installierbare Web-App (PWA) für Handy und Laptop. Jedes Konto ist ein Budget-Topf
(z. B. Essen 250 €). Die App zeigt täglich, ob du im Kurs bist und wie viel du ab heute noch pro Tag ausgeben kannst.

**Datenschutz:** Die App besteht nur aus Dateien (HTML, CSS, JavaScript). Deine Daten liegen ausschließlich im
Speicher der App **auf dem jeweiligen Gerät** (IndexedDB). Es gibt keinen Server, keine Anmeldung, kein Tracking.
Eine Content-Security-Policy in `index.html` verbietet der App technisch jede Verbindung zu fremden Servern.

## Funktionen

- **Kurs:** Ausgaben-Töpfe und Sparziele pro Konto. Du siehst Soll bis heute, die Abweichung, den Rest pro Tag,
  ein Kursdiagramm und einen Monatsvergleich.
- **Import:** CSV aus dem Online-Banking (Encoding, Trennzeichen und deutsches Zahlenformat werden erkannt,
  Soll/Haben möglich), Zuordnung pro Konto merken, Vorschau, Duplikaterkennung, fehlerhafte Zeilen werden gemeldet.
- **Umbuchungen** zwischen eigenen Konten werden automatisch erkannt und zählen nicht als Ausgabe.
- **Buchungen:** offene Buchungen zuordnen und dabei Regeln erstellen; suchen, korrigieren, Umbuchungen markieren.
- **Übersicht:** Kennzahlen, Auffälligkeiten, Plan vs. Ist, Ausgaben pro Monat, Verteilung, größte Ausgaben.
- **Budget je Kategorie** mit Monatsabweichungen, **Fixkosten** mit 90-Tage-Vorschau und Abo-Vorschlägen.
- **Sicherung & Abgleich** zwischen Geräten per Datei, **Export** des Monatsberichts als Excel und CSV.
- Funktioniert **offline**, mit hellem und dunklem Design.

## Installieren

Die App muss einmal unter einer https-Adresse liegen (siehe „Veröffentlichen“). Danach:

- **iPhone:** Adresse in **Safari** öffnen → Teilen-Symbol → **„Zum Home-Bildschirm“**.
- **Android:** Adresse in **Chrome** öffnen → Menü ⋮ → **„App installieren“** (oder „Zum Startbildschirm hinzufügen“).
- **Windows-Laptop:** Adresse in **Edge** oder **Chrome** öffnen → in der Adressleiste auf das Installieren-Symbol
  klicken (oder Menü → „Apps“ → „Diese Website als App installieren“).

## Laptop und Handy abgleichen

Jedes Gerät hat seinen eigenen Datenstand. So bringst du sie auf denselben Stand:

1. Auf dem Gerät mit dem neuesten Stand: **Mehr → Sicherung & Abgleich → Sicherung herunterladen** (oder „teilen“,
   z. B. per AirDrop, Nearby Share oder an dich selbst per Mail).
2. Auf dem anderen Gerät: **Sicherung laden** und die Datei auswählen. Die Daten dort werden **ersetzt**.

Tipp: Importiere CSVs immer auf demselben Gerät (z. B. am Laptop) und übertrage danach die Sicherung aufs Handy.

## Daten aus der alten Laptop-App übernehmen

1. `tools/export_to_pwa.py` in den Ordner der alten App kopieren (dorthin, wo `app.py` liegt).
2. Dort in PowerShell ausführen: `.venv\Scripts\python export_to_pwa.py`
3. Es entsteht `budget-sicherung-aus-alter-app.json`. Diese Datei in der neuen App unter
   **Sicherung & Abgleich → Sicherung laden** öffnen.

Das Skript liest die alte Datenbank nur und verändert sie nicht.

## Veröffentlichen (GitHub Pages, kostenlos)

1. Auf github.com ein **öffentliches** Repository anlegen, z. B. `budget-app`. Öffentlich ist nur der Programmcode,
   deine Daten sind nicht darin.
2. Alle Dateien dieses Ordners hochladen (**Add file → Upload files**, Ordnerinhalt hineinziehen, **Commit changes**).
3. **Settings → Pages →** Source: „Deploy from a branch“, Branch `main`, Ordner `/ (root)` → **Save**.
4. Nach 1–2 Minuten ist die App unter `https://<dein-name>.github.io/budget-app/` erreichbar.

## Updates

Neue Dateien hochladen und in `sw.js` die Zeile `const VERSION = "v…"` hochzählen. Beim nächsten Öffnen zeigt die App
„Eine neue Version der App ist da“. Ein Tipp darauf aktualisiert sie. Deine Daten bleiben dabei erhalten.

## Entwicklung

- Kein Build-Schritt. Reines HTML/CSS/JavaScript (ES-Module), keine Fremdbibliotheken.
- Lokal starten: `python -m http.server 8600` im Ordner, dann `http://localhost:8600` öffnen.
- Tests (Node.js ≥ 20): `npm test` oder `node --test tests/*.test.js`

| Pfad | Inhalt |
|---|---|
| `index.html`, `css/app.css` | Grundgerüst und Design (mobil zuerst, Dark Mode) |
| `js/app.js` | Navigation, Speichern, Rendering, Service-Worker-Registrierung |
| `js/state.js` | Datenmodell und Aktionen (Import, Regeln, Töpfe, Sicherung) |
| `js/storage.js` | IndexedDB, Download/Teilen von Dateien |
| `js/logic/*.js` | Reine Rechenlogik: CSV, Regeln/Umbuchungen, Budget, Töpfe, Fixkosten, Export |
| `js/pages/*.js` | Seiten der App |
| `js/charts.js` | SVG-Diagramme |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA (offline, installierbar) |
| `tools/` | Übernahme aus der alten App, Icon-Generator |

## Bekannte Einschränkungen

- Kein automatischer Abgleich zwischen Geräten (bewusst, damit keine Cloud nötig ist).
- Wird die App auf einem Gerät gelöscht oder werden die Browserdaten gelöscht, sind die Daten dort weg. Deshalb
  regelmäßig Sicherungen erstellen. Die App erinnert nach 14 Tagen daran.
- Identische Buchungen (gleicher Tag, Betrag, Empfänger, Zweck) gelten als Duplikat.
- Gutschriften auf einem Ausgaben-Topf werden nicht gegengerechnet.
