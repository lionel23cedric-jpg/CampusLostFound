# Campus Lost and Found Web Application

The full-stack web application for the 159.333 Campus Lost and Found project.

## Technology stack

- Next.js App Router
- React and TypeScript
- Tailwind CSS
- MongoDB Atlas and Mongoose
- Zod validation

## Requirements

- Node.js 24.19.0, the version used for local verification. The locked jsdom
  30 test dependency requires a supported Node 22, 24 or 26 release; Node 20
  cannot run the complete toolchain.
- npm
- A MongoDB Atlas connection string

## Database prerequisites

Use a separate course/test database that you are authorised to modify. In Atlas,
create a database user with read/write access to that database and add your
current IP address to Network Access. Obtain the application's connection string
from the cluster's Connect workflow, replace its placeholders and include the
intended database name. The database user is separate from your Atlas website
login. Follow [MongoDB's connection guide](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/)
if authentication or IP access fails.

Claim decisions, handover and account-role setup use multi-document transactions.
A plain standalone `mongod` is not a complete substitute: use Atlas or a
transaction-capable replica set. See the
[MongoDB transaction requirements](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/).

Tests and the production build can run without `.env.local`; protected APIs still
require a valid database configuration for signed-in operation. No shared
privileged account or production credential is included in the repository.

## Local setup

1. From `web`, run `npm ci` to install the versions in the lockfile.
2. Run `Copy-Item .env.example .env.local` in PowerShell, or
   `cp .env.example .env.local` on macOS/Linux.
3. Replace the placeholder in `.env.local` with a real MongoDB connection string.
4. Run `npm run dev` to start the development server.
5. Open `http://localhost:3000` in a browser.

Example environment variable:

`MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER_HOST/campus_lost_found?retryWrites=true&w=majority`

Never commit `.env.local`, passwords, connection strings, or other real credentials.

## Reference data setup

After configuring `.env.local`, initialise the standard report categories and
campus locations with:

`npm run db:bootstrap`

This command writes to the configured database. It is safe to run more than
once: existing records and administrator edits are preserved, while missing
standard records are added. It never runs automatically during tests, builds,
or application startup.

## Staff and administrator setup

Normal registration always creates a student account. For a fresh course
database, register the initial administrator, then use the setup command below
to grant that account administrator access. After signing in, that administrator
can use **Manage accounts** to add or remove Staff access for registered
students. Staff role changes revoke the affected user's sessions, so they must
sign in again. The interface cannot grant administrator access.

The role command is a dry run unless `--apply` is present. Check the email and
proposed transition first:

`npm run db:set-role -- --email admin@example.invalid --role administrator`

When the dry-run output is correct, repeat the approved command with
`--apply`:

`npm run db:set-role -- --email admin@example.invalid --role administrator --apply`

The command accepts only an existing active account. It permits student to
staff, student to administrator, and staff to administrator changes; it cannot
demote an administrator or assign an arbitrary role. An applied change is
transactional and revokes that account's existing sessions, so the user must
sign in again.

This command remains available for initial setup or recovery. Routine Staff
membership changes belong in the administrator's **Manage accounts** page;
ordinary registration cannot request a privileged role.

Recommended fresh-database order:

1. Create `.env.local` and run `npm ci` from `web`.
2. Run `npm run db:bootstrap` to add missing standard reference data.
3. Register the initial administrator and other accounts in the web UI.
4. Dry-run and then apply the administrator setup command after verifying its output.
5. Sign in as administrator and configure Staff membership in **Manage accounts**.
6. Have users sign in again and confirm their role-specific navigation.

Both `db:bootstrap` and `db:set-role -- --apply` write to the database named by
`MONGODB_URI`. Confirm that `.env.local` points to the intended course/test
database before running either write command. Never put real account details or
database credentials in source control.

## Legacy image reference audit

To count old external image URLs and invalid references without changing data,
run:

`npm run db:audit-legacy-images`

The default is always a dry run and prints counts rather than full image URLs.
After taking a database backup and obtaining separate approval, remove those
references with:

`npm run db:audit-legacy-images -- --apply`

Apply mode keeps only protected `/api/report-images/<id>` references. It uses
the report's current `updatedAt` value to avoid overwriting a concurrent edit.

## Local AI matching setup

The rules select open, visible opposite-type reports. A report enters the
bounded semantic shortlist when its rule score is at least 35 or its non-text
factors total at least 15, enough to reach 35 with the model's maximum 20 text
points. Quantized MiniLM compares only public title and description, replaces
the text factor, and reranks at most 30 candidates. Only final scores of at
least 35 are shown. If model loading or inference fails, the original rule
ranking remains available and the page says so.

The text encoder accepts at most 512 tokens, including its boundary tokens.
Longer input is truncated for inference only; the saved report stays intact.
Information after that boundary does not contribute to the semantic score.

Run `npm run evaluate:matching:ai` to load the packaged model and reproduce the
synthetic comparison. Runtime inference does not download model files or call
an external AI service. The pinned model is bundled into Git and the source
ZIP. Do not use private verification answers or contact information as model
input. A suggested match never approves a Claim.

## Quality and security checks

Run these commands before creating a pull request:

- `npm test`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `npm audit --omit=dev`
- `npm audit`

If child-process test workers do not start in a restricted Windows environment,
run `npm test -- --pool=threads --maxWorkers=2`. This runs the same test files
with thread workers.

`npm run build` uses Webpack. ONNX Runtime remains a server dependency so its
WASM helpers retain their Node file paths. Start the resulting production
server with `npm start`.

The Turbopack production path can be checked separately with
`npx next build --turbopack`. It is not the release build path because its CSS
worker exited before establishing a connection in the Windows audit.

On 16 October 2026, the production dependency audit reported no known
vulnerabilities. The full audit still reported five high-severity entries in
one development-tool chain: `eslint-config-next` → `@next/eslint-plugin-next`
→ `fast-glob` → `micromatch` → `braces`. The
[upstream braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
lists no patched release. The lockfile updates both affected copies of
`brace-expansion` to compatible patched versions. Recheck advisories before a
release; these results are dated observations.

## Guides and evidence

- The [submission evidence index](../docs/submission-evidence/README.md) links
  the dated results, contribution record and manual screenshots cited by the report.
- The role-by-role setup and operation sequence is in
  [`../docs/user-guide.md`](../docs/user-guide.md).
- Requirement coverage and outstanding manual checks are in
  [`../docs/test-matrix.md`](../docs/test-matrix.md).
- The database relationships and privacy split are in
  [`../docs/erd.md`](../docs/erd.md).
- The local matching algorithm and generated metrics are in
  [`../docs/ai-matching-evaluation.md`](../docs/ai-matching-evaluation.md).
