# Campus Lost and Found Web Application

The full-stack web application for the 159.333 Campus Lost and Found project.

## Technology stack

- Next.js App Router
- React and TypeScript
- Tailwind CSS
- MongoDB Atlas and Mongoose
- Zod validation

## Requirements

- Node.js 20.9 or later
- npm
- A MongoDB Atlas connection string

## Local setup

1. Run `npm install` to install dependencies.
2. Run `Copy-Item .env.example .env.local` to create a local environment file.
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

1. Create `.env.local` and run `npm install`.
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

The existing rules first select open, visible opposite-type reports with a
score of at least 35. A quantized MiniLM model then compares only their public
title and description, replacing at most the existing 20 text points and
reranking up to 30 rule-qualified candidates. If model loading or inference
fails, the original rule ranking remains available and the page says so.

Run `npm run evaluate:matching:ai` once during setup to download and cache the
model and reproduce the synthetic comparison. The first run needs internet
access; later inference runs locally. The model is not bundled into Git or the
source ZIP. Do not use private verification answers or contact information as
model input. A suggested match never approves a Claim.

## Quality and security checks

Run these commands before creating a pull request:

- `npm run lint`
- `npm run build`
- `npm audit`

The lockfile resolves patched versions of Next.js, Sharp, Vitest, js-yaml, and
PostCSS. Narrow npm overrides keep vulnerable transitive versions out of the
installed tree until their parent dependency ranges make those pins unnecessary.

## Guides and evidence

- The role-by-role setup and operation sequence is in
  [`../docs/user-guide.md`](../docs/user-guide.md).
- Requirement coverage and outstanding manual checks are in
  [`../docs/test-matrix.md`](../docs/test-matrix.md).
- The database relationships and privacy split are in
  [`../docs/erd.md`](../docs/erd.md).
- The local matching algorithm and generated metrics are in
  [`../docs/ai-matching-evaluation.md`](../docs/ai-matching-evaluation.md).
