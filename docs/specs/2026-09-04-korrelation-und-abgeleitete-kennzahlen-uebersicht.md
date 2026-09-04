# Korrelationen und abgeleitete Kennzahlen — Übersicht und Zerlegung

Status: Grobe Skizze, kein Implementierungs-Spec
Datum: 2026-09-04
Quelle: [Roadmap Punkt 7](../roadmap.md) (Nutzen hoch, Risiko hoch, Status offen)

## Warum eine Zerlegung

Der Roadmap-Punkt bündelt drei sachlich unterschiedliche Fähigkeiten mit
unterschiedlichem Risiko. Statt eines einzelnen großen Specs bekommt jede ihr
eigenes Spec → Plan → Umsetzung. Dieses Dokument hält nur die Aufteilung und
die Reihenfolge fest.

## Gemeinsame Grundlage: Objekt-Beziehungen im Katalog

B und C brauchen eine Möglichkeit, zusammengehörige Katalogeinträge zu
gruppieren, bevor irgendetwas korreliert werden kann — B über eine neue
Energie-Rolle (PV-Erzeugung/Netzbezug/Netzeinspeisung/Batterie/Verbrauch),
C größtenteils über das bereits vorhandene `room`-Feld.

Entscheidung (bestätigt): Gruppierung läuft **hybrid** wie das bestehende
`needsReview`-Muster beim Onboarding — eine automatische Vorschlagsstufe
(heuristisch/LLM-gestützt aus Namen und Adaptertyp) markiert Vorschläge,
der Nutzer bestätigt oder korrigiert sie im Admin-UI (Geräte-Tab), bevor sie
für Korrelation genutzt werden. Keine automatische Korrelation auf
unbestätigten Gruppierungen — passt zur bestehenden Leitlinie
"nachvollziehbare Analytics mit begrenztem und testbarem KI-Einsatz".

## Sub-Projekt A: Abgeleitete Kennzahlen

**Beispiele:** Laufzeit, Eigenverbrauch, Wirkungsgrad (z. B. COP einer
Wärmepumpe).

**Risiko: niedrig bis mittel.** Laufzeit ist bereits heute berechenbar ohne
jede Gruppierung (`boolean_state`-Einschaltdauer aus `periodValue.js`,
Phase-2-Infrastruktur der Anomalieerkennung). Eigenverbrauch/Wirkungsgrad
brauchen jeweils nur ein **Paar** von Objekten mit klaren Rollen (z. B.
"PV-Erzeugung" + "Netzeinspeisung" für Eigenverbrauch) — die kleinste
mögliche Ausprägung der gemeinsamen Grundlage oben, kein N-er-Gruppenmodell
nötig.

**Nicht-Ziel:** keine benutzerdefinierten Formeln/Skriptsprache — nur ein
kleines, festes Set fachlich definierter Kennzahlen.

## Sub-Projekt B: Energie-Korrelation

**Beispiel:** PV, Netzbezug, Batterie und Verbraucher gemeinsam auf
Auffälligkeiten prüfen (z. B. Energiebilanz stimmt nicht: Verbrauch steigt,
ohne dass PV, Netzbezug oder Batterie das erklären — mögliches defektes
Gerät).

**Risiko: hoch.** Braucht das volle N-er-Gruppen-/Rollenmodell aus der
gemeinsamen Grundlage, ein Energiebilanz-Modell mit Fehlertoleranzen, und
robusten Umgang mit unvollständiger Rollenbelegung (nicht jede Installation
hat Batterie oder getrennte Einspeise-/Bezugszähler). Größter noch offener
Entwurfsaufwand der drei Teile.

## Sub-Projekt C: HVAC-Korrelation

**Beispiel:** Raumtemperatur, Heizung und Fensterzustand pro Raum
korrelieren (z. B. Fenster offen + Heizung an + Temperatur fällt trotzdem
nicht — mögliche Fehlfunktion oder vergessenes Fenster).

**Risiko: mittel.** Gruppierung existiert bereits über das `room`-Feld,
braucht also **nicht** die neue Gruppierungs-Infrastruktur aus B. Der
Aufwand liegt in der eigentlichen Korrelationslogik (welche
Raum-Zustandskombinationen sind auffällig) und in Räumen mit unvollständiger
Sensor-/Aktor-Abdeckung.

## Nicht-Ziele (für alle drei Teile)

- Keine automatische, unbeaufsichtigte Korrelationssuche über beliebige
  Objektpaare (Kombinatorik + Rauschen) — nur explizit gruppierte/bestätigte
  Beziehungen.
- Keine zeitversetzte/kausale Analyse (z. B. "Heizung reagiert 20 Minuten
  verzögert") in der ersten Ausbaustufe.
- Keine geräteübergreifenden Standard-Rollentaxonomien Dritter — eigenes,
  bewusst kleines Rollen-Vokabular je Teilprojekt.

## Empfohlene Reihenfolge

**A → C → B.**

- A zuerst: Laufzeit ist ohne jede neue Infrastruktur nutzbar (sofortiger
  Wert), Eigenverbrauch/Wirkungsgrad validieren die neue
  Paar-Gruppierung im kleinstmöglichen, risikoärmsten Fall, bevor B sie auf
  N-er-Gruppen ausweitet.
- C danach: kein neues Gruppierungsmodell nötig (nutzt `room`), eigenständiger
  Nutzenschritt, unabhängig von A/B umsetzbar.
- B zuletzt: profitiert davon, dass das Gruppierungs-/Bestätigungsmuster aus
  A bereits in Produktion erprobt ist, bevor es auf das komplexere
  Energiebilanz-Modell ausgeweitet wird.

Jedes Sub-Projekt bekommt beim Start seine eigene Spec/Plan-Runde; dieses
Dokument wird dabei referenziert, nicht dupliziert.
