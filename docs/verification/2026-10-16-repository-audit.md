# Repository audit 16 October 2026

The audit started from local commit `59da62a94a1eb60c1199cc865bd0ea18421c1a8b`.
Its tree was identical to GitHub release
`58b2ad4b50e902d84d5ab41960f8626a6a7988a7` and the current `develop` tree
when the remote references were checked. The worktree was clean before edits.
The changes are proposed on `fix/repository-audit-2026-10-16`. Publishing this
branch does not merge the repairs into `main` or update the production release.

Codex assisted with the review, patches and local verification. The humanizer
skill was used when editing explanatory prose. This record describes that
assistance and the observed checks; individual contribution records retain
their existing authorship and dates.

## Reproduced issues and repairs

| Finding | Observed problem | Repair and check |
| --- | --- | --- |
| Long text exceeded the encoder limit | A permitted 1,800-character input produced 902 tokens. Real inference failed with a `512 by 902` positional-embedding error. | Limit the encoder input to 512 tokens and preserve the final separator. A real-model regression checks that the long input produces the same finite, normalised vector as its bounded prefix. Saved report text is unchanged. |
| Image suggestions trusted the declared MIME type | A request could carry empty, corrupt or mismatched bytes under an accepted image MIME type. The route did not use the existing signature and decoder checks. | Reuse the report image validator before inference. Only decoded, re-encoded, metadata-free JPEG, PNG or WebP data within the existing 3 MiB and 20-million-pixel limits reaches the classifier. |
| Multipart bodies were parsed before enforcing a size limit | Both image routes called `request.formData()` before checking file size, allowing unnecessary buffering of a larger request. | Reuse a bounded stream reader for JSON and multipart data. Limit an image request to 3 MiB plus 16 KiB of form overhead, check declared length, and cancel streamed overflow even if that header is missing or falsely small. |
| Inference paths had no request-frequency limit | Matching, smart search, wording/tag suggestions, image categories and duplicate scans could repeatedly run models without using the existing rate limiter. | All five paths share 10 AI requests per account per minute in one process. HTTP 429 includes `Retry-After`; ordinary browsing remains available. Route regressions check that rejected requests do not call the inference service. |
| Webpack rewrote an ONNX server module URL | Production page-data collection failed on the report-assistant route with `ERR_INVALID_URL` for `/_next/static/media/ort.wasm.bundle.min...mjs`. | Keep `onnxruntime-web` in `serverExternalPackages`, as documented by the installed Next.js version. Existing explicit model and WASM tracing remains in place. |
| The default production build depended on a failing Turbopack worker | The Windows Turbopack CSS worker exited before its IPC connection was established, including with normal local process permissions and one Node runtime. | Use the verified Webpack production path for `npm run build`. Keep the original Turbopack failure documented; this changes the supported build command rather than claiming to fix the upstream worker. |
| Locked development dependencies had patched advisories | The initial full npm audit reported six high-severity package entries. Both installed `brace-expansion` copies were affected. | Update only `brace-expansion` 1.1.18 → 1.1.21 and 5.0.9 → 5.0.12 within their existing dependency ranges. No install scripts ran and no direct dependency was added. |
| Setup and security wording had become stale | The README advertised Node 20.9 although locked jsdom 30 requires a newer supported runtime. Earlier audit counts could be mistaken for present results. | Document the tested Node 24.19.0 runtime, use `npm ci`, include tests and TypeScript in the checklist, and distinguish dated audits from current advisories. |
| Source attribution and root ignores were incomplete | The packaged MiniLM folder lacked a source/licence note and a licence copy. Only the web subdirectory ignored local environment files. | Add the pinned upstream model link and Apache 2.0 licence text; extend root ignores for environment files while retaining `.env.example`. |

## Verification

Initial checks ran locally on Windows with Node.js 24.19.0. The final
`npm run build` also passed with the installed Node.js 24.15.0 runtime. These
checks did not perform a live recovery, change database records, alter GitHub
settings or publish a release.

| Check | Observed result |
| --- | --- |
| Complete Vitest suite, `--pool=threads --maxWorkers=4` | 183 files and 3,078 tests passed, including 14 new regression cases. |
| Focused multipart, model, image and AI route tests | 64 tests passed. |
| Focused browse and matching route tests | 33 tests passed. |
| ESLint | Passed. |
| TypeScript, `tsc --noEmit` | Passed. |
| Production build, `npm run build` | Passed with the final script selecting Webpack; all 41 static pages generated and build traces completed. The direct `next build --webpack` check also passed after the ONNX server-package fix. |
| Built app on a temporary localhost port | Homepage and login returned HTTP 200. Anonymous POST requests to both AI suggestion endpoints returned HTTP 401 with `Cache-Control: no-store`. The server was stopped after the check. |
| External CommonJS ONNX runtime | Loaded the packaged MiniLM model and returned finite output with shape `[1, 3, 384]`, checking the runtime format used by the production server. |
| Build traces for all five AI paths | Each contains the ONNX package, WASM loader and binary, and packaged model files. |
| Packaged MiniLM evaluation | 12 cases, 60 comparisons; TP 24, FP 18, FN 0, TN 18; precision 0.571429, recall 1, F1 0.727273, accuracy 0.7, top-match accuracy 1. The repairs do not establish better matching accuracy. |
| Twenty simultaneous short-text embedding calls | All returned finite 384-dimensional vectors. No concurrent-session failure was reproduced. |
| `npm audit --omit=dev` | Zero reported production vulnerabilities on this date. |
| Full `npm audit` after patching | Five high-severity package entries remain in the same development-tool dependency chain, described below. |
| `git diff --check` | Passed. |

## Remaining build and dependency checks

The original default Turbopack build failed while starting its CSS worker: the Node
process exited before the IPC connection was established. It failed both in
the restricted environment and with normal local process permissions, and
using one Node runtime throughout did not resolve it. Its root cause is still
unresolved. The Webpack production build passed after the ONNX server-package
repair, and `npm run build` now selects that supported path. The Webpack result
does not establish that the optional Turbopack build succeeds.

The remaining dependency chain is `eslint-config-next` →
`@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces`. The
[GitHub advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no
patched `braces` release at the time of this check. These are five affected
package entries from one advisory chain, rather than five unrelated flaws in
the application. npm proposes a major downgrade of the Next ESLint config;
that incompatible change was not applied. Recheck when a compatible upstream
fix is available.

The compatible `brace-expansion` patches are identified in the
[upstream advisory](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr).

## Repository contents and evidence

The large ONNX files are used by the application and its real-model checks.
The contextual photographs and Administrator illustrations are referenced by
components. They were retained. Dated plans and verification files remain
available because they record the project history; the root README now
distinguishes current guides, plans and test evidence. No contribution records,
commit history or submitted report was rewritten during this repair.

Among tracked environment and credential-file name patterns, only
`web/.env.example` was present. That observation does not amount to a complete
secret scan of every historical commit.

The rate limiter remains process-local. A multi-instance deployment needs a
shared counter to enforce one allowance across instances. The real-model
evaluation remains small and synthetic; the test count does not measure
accuracy on real campus reports. The Word report and existing release links
still describe their named releases. If these repairs are included in the
submission, record the eventual merged revision and its separate verification
date instead of attributing these changes to the older release.
