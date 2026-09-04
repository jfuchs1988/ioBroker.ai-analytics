# Third-party notices

This file records third-party software that is used at runtime, in the Admin
build, or by the development/test toolchain. The versioned `package-lock.json`
is the complete package inventory. License identifiers below are the values
reported by the corresponding package metadata.

## Runtime dependency

| Package | License | Source |
|---|---|---|
| `@iobroker/adapter-core` | MIT | https://github.com/ioBroker/adapter-core |

Its transitive runtime dependencies retain their upstream licenses. The
installed npm packages and `package-lock.json` provide the exact versions and
license metadata.

## Bundled Admin code

The Admin custom component is built with Vite and Module Federation. It bundles
code from the following direct project dependencies:

| Package | License | Source |
|---|---|---|
| `@iobroker/gui-components` | MIT | https://github.com/ioBroker/ioBroker.gui |
| `@iobroker/json-config` | MIT | https://github.com/ioBroker/json-config |
| `@module-federation/runtime` | MIT | https://github.com/module-federation/core |
| `@module-federation/vite` | MIT | https://github.com/module-federation/core |
| `react` | MIT | https://github.com/facebook/react |
| `react-dom` | MIT | https://github.com/facebook/react |
| `@mui/material` | MIT | https://github.com/mui/material-ui |
| `@mui/icons-material` | MIT | https://github.com/mui/material-ui |
| `cropperjs` | MIT | https://github.com/fengyuanchen/cropperjs |

The generated bundle retains upstream attribution comments where the upstream
package includes them. In particular, the `@iobroker/gui-components` and
`cropperjs` notices are present in `admin/custom/assets/`.

## Other license families in the dependency tree

The lockfile currently contains packages under these additional licenses or
license expressions. They are primarily transitive build/test dependencies;
the list is included here so a future bundling change cannot silently hide the
review requirement:

- Apache-2.0 / Apache 2.0
- BSD, BSD-2-Clause and BSD-3-Clause
- BlueOak-1.0.0
- ISC
- MPL-2.0
- Python-2.0
- WTFPL
- `(MIT AND Zlib)` and other dual-license expressions
- GPL-containing dual-license expressions, including `(MIT OR GPL-3.0-or-later)`

If a package from this group becomes part of the shipped runtime or Admin
bundle, its license text and any required NOTICE file must be included in the
release package. Do not assume that a package's SPDX identifier alone replaces
the required copyright and license notices.

## Platform and service references

The adapter integrates with ioBroker's public adapter APIs and can call
third-party AI endpoints selected by the user. Those are not bundled code:

- ioBroker History, InfluxDB and SQL adapters are external runtime services.
- Anthropic, OpenAI, OpenRouter and OpenCode Zen are external API services.
- Their terms, privacy rules, rate limits and trademarks remain with their
  respective providers and must be reviewed before operational use.

This notice is an engineering inventory, not legal advice.
