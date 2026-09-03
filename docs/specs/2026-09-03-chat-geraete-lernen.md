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

## Sichere Defaults beim Onboarding

- `sun2000.*`, `0_userdata.*.Huawei.*` und `viessmannapi.*` erhalten den Raum `Keller` und lösen keine Rückfrage aus.
- Shelly-Datenpunkte mit `Switch`, `Power` oder `Energy` erhalten eine neutrale technische Beschreibung und lösen keine Rückfrage aus; der Raum bleibt offen.
- Homematic-Datenpunkte mit `LEVEL` erhalten eine neutrale Aktor-Beschreibung und lösen keine Rückfrage aus; der Raum bleibt offen.
- UniFi-`is_online`-Datenpunkte werden als Anwesenheitserkennung behandelt. Wenn der Objektbaum einen Client-/DNS-Namen liefert, wird dieser verwendet, sonst eine neutrale Beschreibung mit der MAC-Adresse.

Die Defaults sind bewusst als `classificationSource=default` und `confidence=low` gekennzeichnet. Sie sind nutzbar, ohne als nutzerbestätigte Wahrheit ausgegeben zu werden.

## Nicht-Ziele

- Keine Änderung von `common.name` oder anderen Metadaten fremder Adapter.
- Keine freie Erzeugung neuer Katalogeinträge durch die KI.
- Keine Interpretation des konkreten Verbrauchers hinter einer Shelly- oder Homematic-Seriennummer.
