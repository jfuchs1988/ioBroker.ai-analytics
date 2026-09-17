# Plan: Einmalige Wertpruefung beim Neu-Einlesen

1. Bestehenden Discovery-Flow um eine persistente Einmaloption erweitern.
2. Die Option bei vollem Re-Scan und bei „Nur Updates einlesen“ auswerten.
3. Value-Kind- und Datenqualitaets-Backfill im Einmalmodus fuer alle passenden
   Eintraege ausfuehren.
4. Manuell bestaetigte Value-Kinds und Datenqualitaetswerte schuetzen.
5. Die Option erst nach erfolgreicher Ausfuehrung beider Pruefungen deaktivieren.
6. Admin-Konfiguration, Settings-CSV und How-To-Hinweise ergaenzen.
7. Fokus- und Regressionstests sowie `npm test`, Lint und Admin-Build ausfuehren.
