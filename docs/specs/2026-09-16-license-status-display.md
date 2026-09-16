# Lizenzstatus-Anzeige

- The admin must clearly distinguish a stored entitlement from an empty token
  field without rendering the raw token.
- When available, the display includes the GitHub login and token expiry.
- The adapter stores the login and expiry metadata received from the backend in
  protected native configuration and publishes only non-secret status data.
