# Campus Find

159.333 Computer Science Project

A full-stack campus lost-and-found web application for students, staff, and
administrators. It combines privacy-aware reports, claims, notifications and
moderation with five bounded, locally executed AI-assisted features. Every
suggestion remains reviewable and has a deterministic fallback.

## Install and run

Use Node.js 24.19.0 and npm, Git, and a MongoDB Atlas database.
For database-backed use, create a database user and allow your current IP in
Atlas Network Access. Use a separate course/test database, not the team's live
database. The [web setup guide](web/README.md#database-prerequisites) explains
the transaction requirement and common connection problems.

1. Clone the repository and open the web application directory:

   ```powershell
   git clone https://github.com/lionel23cedric-jpg/CampusLostFound.git
   cd CampusLostFound/web
   ```

2. Install the locked dependencies with `npm ci`.
3. Copy `.env.example` to `.env.local`: use `Copy-Item .env.example .env.local`
   in PowerShell, or `cp .env.example .env.local` on macOS/Linux.
4. Replace the `MONGODB_URI` placeholder in `.env.local` with your database
   connection string. Keep credentials out of Git.
5. For a fresh database, run `npm run db:bootstrap`. This writes missing
   standard categories and campus locations to the configured database and
   preserves existing records.
6. Run `npm run dev`, then open [localhost:3000](http://localhost:3000).
7. Create a student account in the application. For Staff or Administrator
   access, follow the [role setup instructions](web/README.md#staff-and-administrator-setup).

For a production build, run `npm run build` followed by `npm start`. The
[web setup guide](web/README.md#quality-and-security-checks) includes verification
commands and production configuration details. Production builds use Webpack.

## Project documentation

- [Submission evidence and dated verification](docs/submission-evidence/README.md)
- [Web application setup](web/README.md)
- [AI matching evaluation](docs/ai-matching-evaluation.md)
- [AI feature suite, privacy boundaries, and fallbacks](docs/ai-feature-suite.md)
- [System architecture](docs/architecture.md)
- [Database ERD and privacy boundaries](docs/erd.md)
- [Role-based user guide](docs/user-guide.md)
- [Requirement and test matrix](docs/test-matrix.md)
- [Team responsibilities](TEAM.md)
- [Project decisions](project_management/decision_log.csv)
- [Contribution record](project_management/contribution_log.csv)
- [Project design](docs/superpowers/specs/2026-09-15-project-quality-polish-design.md)

The setup guide, architecture, ERD, user guide and AI feature documents describe
the current implementation. Dated files under `docs/superpowers` retain design
plans and verification evidence; an earlier plan may describe work that was
later changed. A plan records intent, while its verification record states what
was checked. The contribution and decision logs retain the project's history.
