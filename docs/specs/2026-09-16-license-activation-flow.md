# Lizenz-Aktivierungsablauf

- The admin starts the activation in a popup so the user does not need to copy
  the verification URL manually.
- After the external authorization, the adapter stores the entitlement in its
  protected native configuration and the admin shows a confirmation.
- The raw entitlement token is never rendered in the admin UI.
- Denied, expired, and timed-out activations are shown as actionable errors.
