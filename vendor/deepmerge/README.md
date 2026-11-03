# Patched build dependency

This private package derives from the CommonJS distribution of
[`deepmerge` 4.3.1](https://github.com/TehShrike/deepmerge/tree/v4.3.1), including
its bundled `is-mergeable-object` helper. The original MIT license is retained.
It replaces the resolver's merge dependency through an explicit npm override;
it is maintained in this repository and is not an upstream patched release.

The original `dist/cjs.js` SHA-256 is
`2e5160f84a1141bd927264afe4d15766f1e6cf07daef182b37ff53fea121de7d`.

## Security change

[GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)
has no upstream patched release at the time of integration. Both target and
source traversal now discard `__proto__`, `constructor` and `prototype` at
every recursive merge. Every output property is created as an own data
property, so inherited setters cannot alter the returned object's prototype.
The normal cloning, array, symbol and custom-merge contracts are retained.

The only installed consumer is `@rollup/plugin-node-resolve`, which uses the
function to clone constant defaults during Workbox's service-worker build.
This code does not run on document content in the browser. The all-severity
npm audit gate remains enabled. `scripts/test-dependencies.mjs` tests malicious
source and target objects, nested payloads and the resolver's actual defaults.

Remove this package and its override when the resolver uses a maintained,
patched dependency. Re-run a clean npm install, the dependency regressions,
the production build and the PWA/offline browser tests when replacing it.
