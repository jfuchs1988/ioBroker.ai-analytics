# ADR-0028: Tagesbudget in EUR statt Rohtoken

[← ADR-Übersicht](adr-index.md)

## Status

Angenommen (2026-09-04)

## Kontext

[ADR-0022](0022-manuelle-preise-unbegrenzte-verbrauchshistorie.md) führte manuell gepflegte Preise und eine nach Zweck getrennte Verbrauchs-Historie ein, ließ das Tagesbudget selbst aber als rohe Tokenzahl (`dailyTokenBudget`) bestehen. Nutzer-Feedback zeigte: eine Tokenzahl ist als Ausgabenobergrenze kaum greifbar (z. B. "5" wurde versehentlich als Budget in EUR interpretiert und war praktisch sofort erschöpft), während die Kosten für Chat/Prüfung und Onboarding ohnehin schon separat aus Preisen berechnet werden. Zusätzlich war die Anzeige "Aktuelles Budget (heute)" bis zum nächsten Chat-/Onboarding-Aufruf veraltet, weil sie nur beim Verbrauchen oder Zurücksetzen neu berechnet wurde, nicht beim Adapterstart nach einer Konfigurationsänderung.

## Entscheidung

1. Das Feld heißt jetzt `dailyBudgetEur` und wird als EUR-Betrag interpretiert, nicht mehr als Tokenzahl. `isBudgetExceeded` vergleicht die aus Preisen berechneten Ist-Kosten des Tages (Chat + Onboarding) gegen dieses Limit.
2. Ohne konfigurierten Preis (alle vier Preisfelder 0) bleibt die berechnete Kostensumme immer 0, das Limit würde also nie greifen. Ein Admin-UI-Validator (`validatorNoSaveOnError`) verhindert deshalb das Speichern eines Budgets > 0, solange kein Preis für Chat oder Onboarding gesetzt ist.
3. `usage.todaySummary` wird jetzt zusätzlich beim Adapterstart (`refreshTodaySummary`) aus dem persistierten `usage.history`-Eintrag von heute neu berechnet, damit eine geänderte Preis- oder Budget-Konfiguration sofort nach dem Neustart sichtbar ist statt erst nach der nächsten Anfrage.
4. Alle Kostenanzeigen (Settings-Zusammenfassung, Chat-Tab-Budgetzeile, Verbrauchszeile pro Nachricht, Kosten-im-Zeitraum-Zeile) zeigen Beträge jetzt einheitlich mit `€`-Zeichen und deutscher Zahlenformatierung (Tausenderpunkt, Komma als Dezimaltrennzeichen), gerundet auf die bisher schon verwendete Nachkommastellenzahl (4 bzw. 6) statt auf die 2 Nachkommastellen, die `Intl.NumberFormat`s Currency-Style standardmäßig verwenden würde.

## Konsequenzen

**Positiv:** Das Budget bildet jetzt ab, was Nutzer tatsächlich interessiert (Ausgaben in EUR), konsistent mit der bereits vorhandenen Kostenberechnung aus ADR-0022. Die Validierung verhindert ein wirkungsloses, aber scheinbar aktives Limit. Die Anzeige ist nach Konfigurationsänderungen sofort aktuell.

**Negativ:** Bestehende Installationen mit einem gesetzten `dailyTokenBudget` verlieren diesen Wert stillschweigend (Adapter-Neustart legt `dailyBudgetEur` mit Default 0 an) — bei einer Beta-Vorabversion ohne Migrationsmechanismus bewusst in Kauf genommen. Das Budget bleibt weiterhin nur eine Näherung auf Basis der *aktuell* konfigurierten Preise (siehe ADR-0022), nicht der zum Zeitpunkt des Verbrauchs gültigen.
