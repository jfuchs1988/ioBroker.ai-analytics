# ioBroker.ai-analytics

`ioBroker.ai-analytics` combines historical Smart Home analytics with a
proactive AI check. It discovers ioBroker objects that are already recorded by
History, InfluxDB, or SQL, builds a semantic catalog, answers questions about
the recorded data, and explains unusual observations.

## Features

- Natural-language questions about historical consumption and device usage
- Period comparisons for gauges, switches, daily counters, cumulative totals,
  and event counts
- Automatic discovery of objects with enabled history logging
- Semantic onboarding with a review conversation instead of guessing
- Proactive checks with a statistical anomaly pre-analysis before the LLM
- Data-quality fields for writability, write pattern, update frequency, and
  completeness
- Device catalog management in the ioBroker Admin UI
- CSV export/import for catalog maintenance
- Anthropic, OpenAI, OpenRouter, and local OpenAI-compatible providers
- Optional separate provider for onboarding
- Daily token budget and usage history
- Offline-capable sponsorship entitlement foundation; enforcement starts at
  `0.1.0` according to the documented entitlement contract

## Requirements

- ioBroker with JavaScript controller 5 or newer
- Node.js 18 or newer
- At least one active `history`, `influxdb`, or `sql` logging adapter
- An API key for a supported cloud provider, or a reachable local
  OpenAI-compatible endpoint such as Ollama, LM Studio, or LocalAI

The adapter only analyzes objects that are already enabled for history logging.
It does not enable logging or change foreign ioBroker objects.

## Installation

When the adapter is available in the ioBroker repository, install it from the
Admin adapter list and create an instance. During development, installation can
also use a GitHub release archive or a local package:

```bash
npm install
npm run pack:release
```

The resulting archive can be installed with the ioBroker URL/file installer.

## Configuration

Configure the adapter in the ioBroker Admin UI:

- Chat/check provider, model, API key, and optional base URL
- Optional independent onboarding provider
- Proactive-check interval and silent/no-result behavior
- Daily token budget and manually maintained token prices
- Optional value-kind and data-quality backfills
- Sponsorship entitlement token for the future stable release policy

The token field is protected and encrypted by ioBroker. It is not included in
the settings CSV export.

## Providers and Privacy

OpenRouter is a convenient entry point for currently free tool-capable models,
but free availability, rate limits, and provider data policies can change.
OpenCode Zen is linked as an alternative but is not automatically classified
as permanently free. Local OpenAI-compatible endpoints avoid sending Smart
Home data to a cloud provider.

The adapter does not expose raw database query languages to the model. It uses
curated tools and catalog metadata instead. Review the privacy and retention
terms of any cloud provider before sending personal Smart Home data.

## Supported History Sources

The adapter uses the generic ioBroker History API and supports active logging
from History, InfluxDB, and SQL adapters. The relevant device/data-source
documentation is available at:

- [ioBroker History adapter](https://github.com/ioBroker/ioBroker.history)
- [ioBroker InfluxDB adapter](https://github.com/ioBroker/ioBroker.influxdb)
- [ioBroker SQL adapter](https://github.com/ioBroker/ioBroker.sql)

## Sponsoring and License

The repository contains an MIT-licensed core and separately documented
`sponsor-required` AI components. All `-beta` versions remain free. The
technical entitlement policy starts with `0.1.0`: Ed25519-signed JWS tokens are
issued by a separate sponsorship web application, have 35 days of technical
validity, represent 30 days of sponsorship, and include a 30-day grace period.
After the grace period, one chat request per local day remains available and
proactive AI checks are disabled. Tokens are not instance-bound.

Support the project through [GitHub Sponsors](https://github.com/sponsors/jfuchs1988).
See [LICENSE](LICENSE), [sponsor-required terms](LICENSES/SPONSOR-REQUIRED.md),
and the [entitlement architecture](docs/specs/2026-09-03-hybrid-license-and-entitlements.md).

## Development

```bash
npm install
npm test
npm run lint
npm run build:admin
```

`npm test` runs the unit suite and the adapter test. The adapter test currently
also documents a deprecated `@iobroker/testing` smoke-test behavior; the
repository additionally contains proxyquire-based orchestrator and flow tests.

## Documentation

- [Documentation index](docs/README.md)
- [Product roadmap](docs/roadmap.md)
- [Architecture](docs/architecture/arc42-index.md)
- [Changelog](CHANGELOG.md)
- [Contributing guide](CONTRIBUTING.md)

## Status

Current development version: `0.0.1-beta.30`. The adapter is in beta and a
manual acceptance test on a real ioBroker installation remains part of the
release process.

German documentation: [README.de.md](README.de.md).
