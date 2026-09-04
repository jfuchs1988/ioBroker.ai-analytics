# OpenCode Zen Provider

## Ziel

OpenCode Zen soll als vorausgefüllter OpenAI-kompatibler Anbieter auswählbar sein.

## Anforderungen

- Provider-Wert `opencode` verwendet standardmäßig `https://opencode.ai/zen/v1`.
- Die sechs kostenlosen Zen-Modelle werden als Auswahl angeboten.
- Der Modellname bleibt zusätzlich frei editierbar.
- Die automatische Endpoint-Vorgabe gilt für Chat und optionales Onboarding.
- Bestehende benutzerdefinierte URLs und Modelle bleiben nutzbar.
- API-Schlüssel werden nicht in Code, Tests, Logs oder Dokumentation aufgenommen.
- Die vier MiMo/Ling/Nemotron-Modelle verwenden `/chat/completions`; beide Muse-Modelle verwenden `/responses` mit Responses-API-Wire-Format.

## Modelle

`mimo-v2.5-free`, `ling-3.0-flash-fin-free`, `nemotron-3-ultra-free`, `nemotron-3.5-lightning-free`, `muse-spark-1.3-contributor-free`, `muse-spark-1.2-contributor-free`
