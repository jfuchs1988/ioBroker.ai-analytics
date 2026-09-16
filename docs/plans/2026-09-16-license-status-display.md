# Plan: Lizenzstatus-Anzeige

1. Extend entitlement responses and protected adapter metadata with the GitHub
   login and expiry values.
2. Publish and render a non-secret stored-token status in the admin.
3. Verify adapter tests, lint, and the admin build; deploy the backend response
   extension separately before relying on the username display.
