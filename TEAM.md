# Campus Find Project Team

## Project information

- Course: 159.333 Computer Science Project
- Project: Campus Find, a campus lost-and-found web application
- Supervisor: Binglan Han
- Group: Group 13
- Team size: 5 members
- Group coordinator: Luyang Liu

## Confirmed responsibility allocation

The current allocation follows the revised Project Progress Report. It replaces
the broader role allocation in the original proposal.

| Team member | Student ID | Email | Current workstream | Main responsibility |
|---|---:|---|---|---|
| Zheyu Feng | 25007580 | 3371807105@qq.com | Identity, profile, and account security | Registration, login, sessions, profile settings, role checks, and account status controls |
| Tianyu Li | 25008551 | 863501837@qq.com | Reports, search, images, and privacy | Report creation, browsing, filters, owner history, protected images, and privacy boundaries |
| Xinrui Han | 25007620 | b61s@qq.com | Member Claims and notifications | Claim submission and withdrawal, notification lists, unread counts, and mark-as-read behaviour |
| Zhikai Wang | 25008100 | sanmao_email@126.com | Staff review and recovery | Report verification, custody records, Claim decisions, handover preparation, and completed recovery |
| Luyang Liu | 25007541 | 86801163@qq.com | Administrator tools and project leadership | Overview statistics, reference data, report moderation, integration checks, project coordination, and evidence collection |

All five members share responsibility for learning, testing, evaluating, and
explaining the deterministic item-matching feature.

## Evidence boundaries

- The current workstream allocation is recorded in the revised Project Progress Report.
- The original proposal records the team names, student IDs, email addresses, and group coordinator.
- Git currently shows `Luyang LIU` and `Cedric` with the same email address. They are treated as one repository identity, not as two team members.
- A responsibility allocation does not by itself prove implementation time or authorship. Each member must add their own dated task, branch or pull request, evidence, hours, and reflection to `project_management/contribution_log.csv` before final submission.
- Unknown individual hours and commit ownership are deliberately recorded as `Not recorded`; they are not inferred from the repository account.

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
