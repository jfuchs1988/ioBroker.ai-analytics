# Implementierungsplan: Provider-Modellerkennung und Sponsoring

> **Status: abgeschlossen (2026-09-02).** Die Modellauflistung, OpenRouter-Gratisfilterung, Admin-Autocomplete-Felder, Anbieter-/Sponsoring-Links und `.github/FUNDING.yml` sind umgesetzt. Die Checkboxen darunter sind der ursprüngliche Arbeitsplan; maßgeblich für den aktuellen Stand sind Code, Changelog und Architektur-Dokumentation.

1. Unit-Tests für Provider-URL-Auflösung, Modelllisten, OpenRouter-Gratisfilter und Fehlerfälle ergänzen.
2. Unit-Tests für das Admin-Kommando und strukturelle Tests für Admin-Konfiguration, Sponsoring-Links und Funding-Datei ergänzen.
3. OpenAI-kompatible und Anthropic-Modellabfragen implementieren; OpenRouter-Default-URL dabei korrigieren.
4. Provider-Router und Admin-Message-Bus um `listProviderModels` ergänzen.
5. Beide Modellfelder auf `autocompleteSendTo` mit manueller Eingabe als Fallback umstellen und Anbieter-Links ergänzen.
6. Sponsoring-Link im Custom-Tab, in der JSON-Konfiguration, in `package.json` und `.github/FUNDING.yml` ergänzen.
7. README, Baustein-/Laufzeitsicht, Risiken, Dokumentationsindex und Changelog aktualisieren.
8. Vollständige Unit- und Adapter-Tests ausführen.

Eine neue ADR ist nicht erforderlich: Die Modellerkennung konkretisiert die bereits mit ADR-0007 beschlossene Provider-Abstraktion; Sponsoring-Link und Funding-Metadaten ändern weder Laufzeitarchitektur noch Lizenzmodell.
