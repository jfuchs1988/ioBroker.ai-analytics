# Adapter-Lizenzdienst-Integration

- The adapter creates and stores one random UUID `installationId` in protected native configuration.
- Activation uses the backend's `/v1/activation-sessions`, polling, and `/v1/entitlements/issue` contract. Only the admin response/state exposes the URL and code; logs never contain either.
- A local expiry check calls `/v1/entitlements/renew` only during the final 24 hours of a token's validity. Offline `evaluateLicense` remains authoritative while the service is unavailable or renewal is not yet due.
- New tokens replace `licenseToken` through the adapter native-object API and refresh `info.licenseStatus`.
- `licenseBackendUrl` defaults to the HTTPS production endpoint and rejects credentials, query strings, and non-HTTPS URLs.
