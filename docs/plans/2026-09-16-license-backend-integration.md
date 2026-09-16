# Plan: Adapter-Lizenzdienst

1. Add a bounded HTTPS client using the existing request helpers and unit tests.
2. Persist installation identity/token through protected native configuration and retain offline evaluation.
3. Add startup/daily renewal and activation commands over the existing sendTo/state bridge.
4. Add the backend URL and activation status control to admin configuration, then run unit tests, lint, and admin build.
