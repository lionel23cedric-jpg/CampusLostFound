# Local security patch verification — 7 October 2026

## Tested version and scope

The tested working tree was based on `d3e5054d1aa69ff3bc97169c29045664ae037b91` (develop). It included the HTTP response headers and sensitive-API no-store configuration in `web/next.config.ts`, the accompanying tests, and the dependency updates recorded with this document. No business workflow or model was changed.

The verification ran on Windows with Node.js 24.15.0, npm 11.12.1, and Vitest 4.1.11 at 01:46–01:49 NZDT on 7 October 2026. This is local verification, not a production browser acceptance record. The prior 29 September acceptance record remains a separate historical snapshot.

## Dependency remediation

- Next.js and eslint-config-next: 16.3.5 → 16.3.8.
- source-map-js: 1.2.1 → 1.2.2, within the existing transitive dependency range.
- Corresponding Next.js platform/compiler packages were updated by npm. No new direct dependency was added.
- The pre-patch production audit reported one critical and one high advisory. Both were absent from the post-patch audit.

## Results

| Check | Result |
| --- | --- |
| `npm test` | 183 test files and 3,050 tests passed |
| `npm run lint` | Passed, exit 0 |
| `node node_modules/typescript/bin/tsc --noEmit` | Passed, exit 0 |
| `npm run build` | Next.js 16.3.8 production build passed, exit 0 |
| `npm audit --omit=dev --json` | Zero known production-dependency vulnerabilities, exit 0 |
| `npm run evaluate:matching` | 2 files and 6 tests passed |
| `npm run evaluate:matching:ai` | Actual packaged Xenova/all-MiniLM-L6-v2 inference completed, exit 0 |

Both matching runs used the existing 12-case, 60-comparison synthetic Lost/Found fixture. Results: TP 24, FP 5, FN 0, TN 31; precision 0.827586, recall 1.000000, F1 0.905660, accuracy 0.916667, top-match accuracy 1.000000. Equal results do not demonstrate an AI improvement over the baseline. They do not measure duplicate-detection accuracy on real campus reports.

A non-fatal MODULE_TYPELESS_PACKAGE_JSON warning remains in the local AI evaluation script. The production audit excludes development dependencies and is time-dependent; zero reported vulnerabilities does not prove absence of security risks.

## Reproducibility and remaining checks

Run the commands above from `web` using the committed lockfile. The verification used an existing installation updated with npm, not a fresh `npm ci`. Preserve authorised database configuration in ignored `.env.local`; do not publish credentials or private data. Original timestamped logs and machine-readable Vitest results are retained in the team's local verification evidence folder. This public summary omits local machine paths.

No deployment or signed-in browser acceptance is asserted by this record. After publishing the patch, verify the deployed commit and repeat the relevant role-based browser checks before describing the release as accepted.

## SHA-256 of tested files

| File | SHA-256 |
| --- | --- |
| web/package.json | 78931218AE9585526394ED6229A6D9B15E5A5A30F1087D231D6881C42C0A1287 |
| web/package-lock.json | B5A7309FB12955D67BFDD1D057294833B7E8EE2266489272A031CEB2E0E2F03B |
| web/next.config.ts | ED1B7CDD151ECA9BC3B0408FFEECF0F8DE81D455AA563421C229B4D204E68C44 |
| web/next-config.test.ts | D0E3F0B6D7DE58853B10DC2D2AE652303511997412DC485A5822F298ADF067AB |
