# License overview

The repository uses a hybrid licensing model:

- The root [MIT License](../LICENSE) applies to the general adapter core.
- [MIT exclusions](exclusions.md) identify separately licensed components.
- [Sponsor-required components](SPONSOR-REQUIRED.md) lists the affected source
  paths and their usage terms.
- [Dependencies](dependencies.md) explains how third-party package licenses are
  tracked.
- [Third-party notices](THIRD-PARTY-NOTICES.md) records bundled dependencies,
  license families and external service references.
- [Assets](assets.md) documents project-owned and third-party visual assets.

The root [LICENSE](../LICENSE) file is unmodified, standard MIT text — the
carve-out for sponsor-required components lives only here and in the affected
files' own headers, not in the license text itself (same pattern as evcc's
sponsor-token model). `io-package.json` declares `licenseInformation.type` as
`limited`: the adapter is MIT-licensed, but some functionality is unavailable
without a Sponsoring Entitlement. These texts have not been reviewed by legal
counsel.
