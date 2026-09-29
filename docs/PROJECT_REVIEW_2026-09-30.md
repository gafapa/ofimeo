# Project review — 30 September 2026

## Scope

Review of the browser application, Go relay, dependency manifests, deployment
configuration and CI. The initial working tree was clean. This is a source and
dependency review with automated verification, not a penetration test or a
complete audit of every editor and file format.

## Findings and changes

| Priority | Finding | Change |
| --- | --- | --- |
| High | PDF.js 5.7.284 is in the affected range of GHSA-hq66-cqwq-w95j. Its scripting vulnerability matters particularly because the supplied CSP allows inline scripts and evaluation. Actual exploitability depends on the PDF.js integration. | Upgrade PDF.js to 6.3.289; verify PDF loading, annotations and export. |
| High | Initial `npm audit` reported 14 affected package entries: five high and nine moderate. Entries include dependency propagation and are not 14 independent exploitable flaws. | Update PDF.js and use scoped overrides for patched image-size, Nano ID and UUID, plus a lodash-es override. |
| High | Initial `govulncheck` found eight vulnerabilities with call paths in the relay, including malformed STUN input, Unicode normalization and Go standard library HTTP/TLS processing. | Upgrade the affected Go modules and require Go 1.26.6; align the Docker builder with that version. |
| Medium | The Moodle file proxy checked the escaped path for literal dot segments only. Encoded or double encoded traversal could pass the endpoint restriction and be normalized by an upstream server. | Inspect decoded path segments, reject backslashes and terminal dot segments, and bound decoding to eight passes. Add regression cases. |
| Medium | Import proxy transport failures logged `url.Error`, including the full upstream URL and potentially private sharing tokens. | Log the underlying failure without its URL wrapper. Add a regression test for private path and token leakage. |
| Low | Mail merge PDF export left its message listener registered when the export timed out. | Remove the listener in `finally` for success, error and timeout; explicitly check the reply origin. |
| Low | Browser fixture paths used file URL `pathname`, which produced invalid paths on Windows. | Use Node's `fileURLToPath` in file import and PDF review tests. |
| Maintenance | Security checks and recurring dependency updates were missing from CI configuration. | Add npm audit and govulncheck gates, read-only CI repository permissions, and weekly Dependabot updates. Group Tiptap and Univer packages. |

Security references:

- [PDF.js advisory](https://github.com/advisories/GHSA-hq66-cqwq-w95j)
- [image-size parser advisory](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq)
- [UUID advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
- [STUN parser advisory](https://pkg.go.dev/vuln/GO-2026-6163)
- [Unicode normalization advisory](https://pkg.go.dev/vuln/GO-2026-5970)
- [IDNA advisory](https://pkg.go.dev/vuln/GO-2026-5026)

Additional compatible updates: docx 9.8.1, lib0 0.2.119 and lucide 1.49.0.
PDF.js 6 removed `PDFDocumentProxy.destroy()`, so PDF validation, stored exports
and search indexing now release documents through `loadingTask.destroy()`.
The PDF test helper uses the same API and explicitly locates the standard fonts.
Contributor requirements now specify Node 22.13+ and Go 1.26.6+.

The dependency overrides need to stay documented and tested: some replace a
major version under a dependency with an unchanged release. Remove them when
the upstream packages adopt patched compatible versions. ExcelJS uses UUID v4;
the reported UUID issue concerns v3/v5/v6 with caller-provided buffers.

## Follow-up improvements

1. **Reduce CSP script permissions.** The nginx policy allows `unsafe-inline`
   and `unsafe-eval`. Legal page scripts and diagram shape execution should be
   refactored before removing those allowances. They weaken protection against
   injection; removing them immediately would break supported features.
2. **Align React and its type packages.** Runtime React/React DOM are 18.3.1;
   their type packages target version 19. Use matching major versions in a
   dedicated compatibility change, including the Excalidraw integration.
3. **Expand unit coverage beyond spelling.** `test:unit` currently runs spelling
   rules and translation consistency. Add fast behavior tests for link parsing,
   permission derivation, signed message rejection and malicious imports;
   browser and relay integration tests already cover several of these areas.
4. **Plan coordinated editor updates.** Univer 1.0.3 and newer Playwright,
   marked and React releases were available during this review. Update Univer
   as one group and handle major runtime upgrades with editor round-trip tests.
5. **Review public TURN deployment.** Public mode permits private destination
   addresses, and link-local unicast destinations are not explicitly denied.
   Define an allowed destination policy for public deployments while preserving
   the local peer connections required by school networks.
6. **Review credential persistence for shared school devices.** Nextcloud app
   passwords and Moodle tokens persist in browser storage by design. Provide
   an optional session-only login policy and retain sign-out/revocation tests.
7. **Review PWA upgrades during editing.** The worker uses `autoUpdate`,
   `skipWaiting` and `clientsClaim`. Test deployment of a new build while an
   editor has pending IndexedDB writes and active collaboration, and consider
   an explicit update prompt if an automatic reload can interrupt that work.
8. **Measure installation performance on school networks.** The final PWA
   precaches 867 entries totaling about 39 MiB. Consider caching less frequently
   used editors on demand, after testing that the advertised offline behavior
   still works. Build warnings also identify dependency `use client` directives;
   these are nonblocking in this browser-only application.

## Verification

Before changes, TypeScript checking, 232 spelling rule tests, all four
translation catalogs, `go vet` and the relay tests passed. Dependency scans
identified the alerts described above. Final verification after dependency
installation and the production build:

- `npm audit --audit-level=high`: zero vulnerabilities, down from 14 affected
  package entries.
- `npm run test:unit`: 232/232 rules pass; no missing translations or placeholder
  mismatches across Spanish, Galician, French and German.
- `go vet ./...` and `go test ./...`: pass with the updated toolchain and modules,
  including the new proxy regression cases.
- `govulncheck` 1.8.0: zero reachable vulnerabilities and zero findings in imported
  packages. It still reports 18 findings elsewhere in required modules that the
  analyzed code does not call; this is not a claim that every module is free of
  advisories. Recheck after adding new relay features.
- `npm run build`: passes, including TypeScript and service worker generation;
  updated third-party license notices are included.
- `node scripts/third-party-notices.mjs --check`: all 599 production packages
  have license metadata.
- Browser verification: 27 distinct Chromium cases pass across the main run
  and targeted reruns after adapting the PDF helper and Windows fixture paths.
  Covered smoke tests, PDF annotations and collaboration, sheet charts,
  presentations, mail merge, DOCX round trips, read-only links, Unicode PDF
  export, password-protected PDFs, page operations, Markdown, file imports and
  table-of-contents PDF export. The entire browser suite was not run.
- Docker is not installed in this environment, so the image was not built
  locally. The official `golang:1.26.6-bookworm` image tag was checked and exists;
  the existing CI Docker job remains the image build and startup gate.
