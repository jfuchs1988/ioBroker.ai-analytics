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

`package.json` points consumers to the root license instead of declaring the
entire mixed package as MIT-only. `io-package.json` marks the adapter as
commercial while naming MIT as the core license. This platform metadata does
not override the exclusions in the root license. Source files excluded from the
MIT grant carry an explicit sponsor-required header. These texts have not been
reviewed by legal counsel.
