# Gerätezuordnungen im Chat lernen

Status: Approved
Datum: 2026-09-03

## Ziel

Der Nutzer kann der KI im normalen Chat erklären, wofür ein oder mehrere Datenpunkte stehen. Der Adapter übernimmt diese Angaben strukturiert in den bestehenden Katalog, sodass die Geräte-Tabelle unmittelbar den bestätigten Namen, die Kategorie und den Raum zeigt.

## Verhalten

- Die KI darf nur bereits entdeckte Katalogeinträge ändern.
- Ein Schreibvorgang erfolgt nur aufgrund einer ausdrücklichen Erklärung oder Korrektur des Nutzers.
- Mehrere Zuordnungen können atomar in einem Werkzeugaufruf übergeben werden; unbekannte Objekt-IDs verhindern den gesamten Schreibvorgang.
- Pro Eintrag sind `description`, `category` und `room` einzeln oder gemeinsam änderbar. Mindestens eines dieser Felder muss gesetzt sein.
- Erfolgreiche Änderungen setzen `needsReview=false`, `confidence=high`, `classificationSource=user` und einen Zeitstempel `userConfirmedAt`.
- Fremde ioBroker-Objekte werden nicht verändert. Persistiert wird ausschließlich im Katalog von `ai-analytics`.

## Onboarding ohne Heuristik

Es gibt keine Hersteller-, Adapter-, Objekt-ID- oder Namensdefaults. Wenn das
Onboarding-Modell nicht erreichbar ist, wird ein neuer Treffer lediglich als
`needsReview`-Eintrag mit neutraler Metadatenbeschreibung angelegt. Kategorie,
Raum und Analyse-Rollen werden nicht aus Namen geraten, sondern durch die KI
oder den Nutzer gesetzt.

## Nicht-Ziele

- Keine Änderung von `common.name` oder anderen Metadaten fremder Adapter.
- Keine freie Erzeugung neuer Katalogeinträge durch die KI.
- Keine Interpretation des konkreten Verbrauchers hinter einer Shelly- oder Homematic-Seriennummer.
