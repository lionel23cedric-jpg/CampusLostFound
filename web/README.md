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
