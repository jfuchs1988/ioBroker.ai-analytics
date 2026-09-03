# Sponsor-required components

The following components are excluded from the MIT License in the repository
root. They may be used in a running ioBroker.ai-analytics installation only
with a valid sponsor entitlement once technical enforcement is enabled.

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

The exact entitlement duration, token format, trial period, contributor
entitlements and technical enforcement are deliberately specified separately
before technical enforcement is activated. Until then, this condition is contractual
and not technically enforced.

No warranty is provided. The sponsor-required components are provided "as is"
to the extent permitted by applicable law.
