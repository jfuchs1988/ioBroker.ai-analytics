# Dependency licenses

Third-party dependencies retain their own licenses. The
[third-party notices](THIRD-PARTY-NOTICES.md) summarize shipped and relevant
license families. `package-lock.json` is the
canonical, versioned dependency inventory for runtime, Admin build and test
tooling.

## Runtime

The direct runtime dependency is `@iobroker/adapter-core`. Its transitive
dependency tree is resolved by npm and recorded in `package-lock.json`.

## Admin and development

React, ioBroker Admin components, Vite, Mocha, ESLint and other build/test
packages are development dependencies. Generated Admin assets may contain code
bundled by Vite under the respective upstream licenses.

GitHub exposes the machine-readable dependency inventory and SPDX SBOM at:

- https://github.com/jfuchs1988/ioBroker.ai-analytics/network/dependencies
- https://github.com/jfuchs1988/ioBroker.ai-analytics/dependency-graph/sbom

Dependency updates must include `package-lock.json`; do not copy dependency
license text into source files unless the upstream license requires it.
