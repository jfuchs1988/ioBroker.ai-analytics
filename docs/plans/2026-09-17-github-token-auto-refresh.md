# Plan: GitHub-Token und automatische Erneuerung

**Status:** Planung, noch keine Umsetzung

## Ziel

Der Nutzer meldet sich einmal ueber GitHub an. Danach stellt das Backend ein
Token mit 30 Tagen Laufzeit aus. Der Adapter speichert dieses Token dauerhaft
und erneuert es kurz vor Ablauf selbststaendig, ohne dass eine erneute
Anmeldung erforderlich ist.

## Verbindlicher Ablauf

1. Der Nutzer fuehrt einmalig die GitHub-Anmeldung durch.
2. Das Backend stellt ein Token mit einer Laufzeit von genau 30 Tagen aus.
3. Der Adapter speichert das Token zusammen mit seinem Ablaufzeitpunkt
   persistent in der ioBroker-Konfiguration.
4. Solange das Token gueltig ist, benoetigt der Adapter keinen Internetzugriff.
5. Erst wenn das Token hoechstens noch einen Tag gueltig ist, darf der Adapter
   das Backend zur Erneuerung kontaktieren.
6. Bei erfolgreicher Erneuerung speichert der Adapter das neue Token und den
   neuen Ablaufzeitpunkt atomar.
7. Bei fehlendem Internet bleibt das bisherige Token bis zu seinem Ablauf
   verwendbar. Es gibt keine regelmaessigen Heartbeats oder taeglichen
   Backend-Abfragen.
8. Nach Ablauf ohne erfolgreiche Erneuerung wird die KI-Funktion als nicht
   aktiviert behandelt; eine erneute Anmeldung ist erst dann erforderlich,
   wenn die automatische Erneuerung nicht mehr moeglich ist.

## Adapter-Anpassungen

1. Den bestehenden GitHub-Anmelde- und Tokenfluss analysieren.
2. Tokenwert und Ablaufzeitpunkt getrennt und dauerhaft speichern.
3. Eine Konfigurationsmigration vorsehen, die vorhandene Tokens nicht durch
   Standardwerte oder Updates ueberschreibt.
4. Die Erneuerung in einem zentralen Modul kapseln.
5. Ablaufzeit lokal pruefen, ohne dafuer das Backend zu kontaktieren.
6. Refresh-Aufrufe ausschliesslich im letzten Gueltigkeitstag ausfuehren.
7. Parallele Refresh-Aufrufe innerhalb einer Adapter-Instanz verhindern.
8. Netzwerk-, Ablauf- und Serverfehler getrennt behandeln.
9. Tokens niemals loggen, exportieren oder in Fehlermeldungen ausgeben.
10. Im Admin nur den Aktivierungsstatus, den GitHub-Benutzer und den Ablaufzeitpunkt
    anzeigen.
11. Bestehende Konfigurationen und Tokens bei Adapter-Updates erhalten.

## Backend-Aufgaben fuer das Backend-TODO/Worklog

1. Den bestehenden GitHub-Login und die Token-Ausstellung dokumentieren.
2. Einen sicheren Refresh-Endpunkt fuer bereits aktivierte Installationen
   definieren.
3. Den API-Vertrag fuer Installation, Token, Ablaufzeitpunkt und Refresh
   festlegen.
4. Neue Tokens weiterhin mit genau 30 Tagen Laufzeit ausstellen.
5. Refresh nur akzeptieren, wenn das aktuelle Token hoechstens einen Tag vor
   dem Ablauf steht.
6. Refresh-Aufrufe idempotent machen, damit Wiederholungen kein inkonsistentes
   Ergebnis erzeugen.
7. Alte Tokens nach einem erfolgreichen Refresh widerrufen oder eindeutig
   versionieren.
8. Refresh-Geheimnisse serverseitig geschuetzt und widerrufbar verwalten.
9. Tokenwerte, Refresh-Geheimnisse und GitHub-Zugangsdaten niemals loggen.
10. Fehlerfaelle definieren: unbekanntes Token, abgelaufenes Token, widerrufenes
    Token, zu frueher Refresh und temporaerer Serverfehler.
11. Migration und Rueckwaertskompatibilitaet fuer bereits ausgestellte Tokens
    festlegen.
12. Tests fuer Laufzeit, Refresh-Fenster, Idempotenz, Widerruf und Offline-
    Verhalten vorbereiten.

## Sicherheit und Persistenz

- Der Tokenwert wird wie ein API-Schluessel behandelt.
- Ein Adapter-Update darf die gespeicherten nativen Konfigurationswerte nicht
  loeschen oder neu initialisieren.
- Ein erfolgreicher Refresh ersetzt Tokenwert und Ablaufzeitpunkt gemeinsam.
- Der Adapter fuehrt keine unnoetigen externen Anfragen aus.
- Private Schluessel und serverseitige Refresh-Geheimnisse bleiben ausserhalb
  des Adapters.

## Nicht-Ziele

- Keine regelmaessige Internetverbindung waehrend der Tokenlaufzeit.
- Keine taegliche automatische Verlaengerung.
- Keine erneute GitHub-Anmeldung bei einem normalen Adapter-Update.
- Keine automatische Reparatur eines bereits abgelaufenen Tokens ohne
  erreichbares Backend.

## Geplante Verifikation

1. Unit-Tests fuer lokale Ablaufberechnung und das eintaegige Refresh-Fenster.
2. Tests fuer Offline-Betrieb bei gueltigem Token.
3. Tests fuer Erhalt der Konfiguration nach Migration und Update.
4. Tests fuer parallele Refresh-Aufrufe und atomare Speicherung.
5. Tests fuer abgelaufene Tokens und fehlgeschlagene Backend-Aufrufe.
6. Backend-API- und Sicherheitstests gemaess dem Backend-TODO/Worklog.
