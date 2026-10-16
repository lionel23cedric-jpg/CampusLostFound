# Campus Find Project Team

## Project information

- Course: 159.333 Computer Science Project
- Project: Campus Find, a campus lost-and-found web application
- Supervisor: Binglan Han
- Group: Group 13
- Team size: 5 members
- Group coordinator: Luyang Liu

## Delivered workstreams

Each member completed an allocated module and handed the work to Luyang Liu
for integration. He combined the modules, resolved integration issues, submitted
the shared code and assembled the final report. This table follows the final
report's contribution sections rather than the preliminary allocation.

| Team member | Student ID | Delivered workstream | Main responsibility |
|---|---:|---|---|
| Zheyu Feng | 25007580 | Identity, profile and AI-assisted homepage | Registration, login, sessions, profile settings, role/account-status checks and public homepage design and implementation with AI assistance |
| Tianyu Li | 25008551 | Reports, search, images and privacy | Report creation, browsing/filtering, Smart Search, owner history, protected images and public/private data boundaries |
| Xinrui Han | 25007620 | Student dashboard, Claims and notifications | Dashboard summary/navigation, Claim submission/tracking/withdrawal, private answers, notification lists, unread counts and read updates |
| Zhikai Wang | 25008100 | Staff handling, recovery and image-category suggestions | Report verification, custody, Claim decisions, handover, completed recovery and user-confirmed image-category suggestions |
| Luyang Liu | 25007541 | Administrator development, coordination and final integration | Account/Staff-access management, reference data, moderation, most overview functions, assisted chart/duplicate-review work, integration, release checks, report editing, selected Figma diagrams and workflow evidence |

The shared matching feature combines deterministic factors with local MiniLM
text comparison and a labelled rule fallback. All members are responsible for
understanding its place in the workflow. Shared understanding does not imply
that every member independently implemented the matching engine.

## Evidence boundaries

- The final report's Sections 13, 14 and 16 describe verification, module delivery and each member's reflection.
- [Contribution evidence](docs/submission-evidence/contributions.md) links the delivered modules to source files and dated integration milestones; the [CSV ledger](project_management/contribution_log.csv) provides a compact record.
- Git currently shows `Luyang LIU` and `Cedric` with the same email address. They are treated as one repository identity, not as two team members.
- The contribution names come from the group's module handovers and report. Commits identify when work entered the shared repository, not exclusive individual authorship or personal completion dates.
- Personal working hours were not consistently timed. This record does not reconstruct hours from commit activity or command runtimes. Each member remains responsible for checking their own contribution and reflection.

## Collaboration rules

1. Link development work to a branch, commit, pull request, test result, document, or meeting record.
2. Do not push unfinished work directly to `main`; integrate through the agreed branch and review process.
3. Update the contribution log after meaningful work and use only evidence the member can verify.
4. Record important architecture, security, database, and scope decisions in the decision log.
5. Every member must understand the overall architecture, database, matching function, testing process, and final demonstration.
6. Have at least one other member review a pull request before merging it.
7. Never commit private credentials, passwords, API keys, or local environment files.
8. All members contribute to the final report and video presentation.

## Branch naming convention

- `feature/short-description`
- `fix/short-description`
- `test/short-description`
- `docs/short-description`

## Commit message convention

- `feat:` new functionality
- `fix:` bug fix
- `docs:` documentation
- `test:` testing
- `refactor:` code restructuring without changing behaviour
- `style:` interface or formatting change
- `chore:` configuration or project maintenance
