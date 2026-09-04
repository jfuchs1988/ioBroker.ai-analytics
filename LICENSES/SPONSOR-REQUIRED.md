# Sponsor-required components

The following components are excluded from the MIT License in the repository
root. During the beta phase they may be used free of charge. Starting with
version `0.1.0`, use requires a valid sponsor entitlement or another entitlement
issued by the copyright holder.

## Components

- `lib/agent.js`: iterative AI tool-use orchestration
- `lib/providers/`: LLM provider clients and provider discovery
- `lib/onboarding.js`: AI-assisted semantic onboarding
- `lib/scheduler.js`: periodic proactive analysis trigger
- `lib/anomalyDetector.js`: anomaly pre-analysis used by proactive checks
- `lib/promptContext.js`: AI prompt context construction
- `lib/providerHealthCheck.js`: provider capability checks

The adapter lifecycle, history discovery, catalog persistence, data access,
administration, logging, usage accounting and other components not listed
above remain MIT-licensed.

## Sponsoring terms

During the beta phase, the sponsor-required components may be used free of
charge. Starting with version 0.1.0, use requires an active
sponsorship or another entitlement issued by the copyright holder.
The intended standard channel is GitHub Sponsors:
https://github.com/sponsors/jfuchs1988

The entitlement contract uses offline-verifiable Ed25519 JWS tokens, 30 days of
sponsorship, 35 days of technical token validity and a 30-day grace period from
the end of sponsorship. After grace, one chat request per local day remains
available and proactive AI checks are disabled. Tokens are not instance-bound.
See the [entitlement specification](../docs/specs/2026-09-03-hybrid-license-and-entitlements.md)
for the complete contract.

The verification module is implemented but remains dormant for beta versions.
Production enforcement requires the separate issuing application and published
public signing keys. Trial and contributor entitlements remain undecided.

No warranty is provided. The sponsor-required components are provided "as is"
to the extent permitted by applicable law.
