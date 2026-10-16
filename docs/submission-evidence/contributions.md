# Contribution evidence

The group used a central integration workflow. Each member completed an
allocated module and sent it to Luyang Liu, who combined the modules and
submitted the shared code. Names below follow the group's handovers and final
report. Repository commits establish integration dates, not exclusive personal
authorship, hours worked or the date a member finished locally.

The [CSV ledger](../../project_management/contribution_log.csv) records the
milestones. Each member's separate contribution, challenge and learning
reflection remains in the course report. Working hours were not consistently
timed and are not reconstructed here.

## Zheyu Feng

Delivered registration/login, sessions, profile settings and role/account-status
checks, together with the AI-assisted public homepage. The identity services and
session resolver entered the repository on 11 August (`bca9fdb`, `773780f`), the
profile API on 25 August (`55d43fa`), and the current notice-board homepage on
6 October (`d3e5054`).

Source: [authentication](../../web/src/lib/auth/service.ts),
[session resolution](../../web/src/lib/auth/current-user.ts),
[profile interface](../../web/src/components/profile/profile-settings-client.tsx),
[homepage](../../web/src/app/page.tsx) and
[object illustrations](../../web/src/components/home/home-object-illustration.tsx).
Identity and profile API/service tests support those boundaries. Homepage AI
assistance does not imply authorship of the matching or image-inference modules.

## Tianyu Li

Delivered reports, browsing/filtering, Smart Search, owner history, protected
images and privacy controls. Integration milestones include browse/search state
on 17 August (`08ce783`), protected images on 28 August (`a14a8f2`), owner history
on 29 August (`89b22f1`) and semantic discovery on 28 September (`c132bcf`).

The [report browser](../../web/src/components/reports/report-browser.tsx) and
its [regressions](../../web/src/components/reports/report-browser.test.tsx)
cover the stale-response problem described in his reflection: an obsolete
request must not replace results or errors for the current query.

His supplied 4 October verification note records an authorised Codex-assisted
run of 41 files/918 tests and two-account browser checks in a separate working
directory. It is not a new test run performed for this page. Its server revision,
cross-member image access, forced live fallback and multi-page history were not
established by that note.

## Xinrui Han

Delivered the Student dashboard, Claims and notifications. Claimant workflows
entered the repository on 24 August (`277abc4`) and owned notification/read
updates on 25 August (`c287bb3`). The
[Student dashboard](../../web/src/components/dashboard/student-dashboard.tsx)
appears in the 28 September workspace-separation commit (`db6b640`); this is a
repository milestone, not an independently recorded personal completion date.

Source: [claimant service](../../web/src/lib/claims/claimant-service.ts),
[Claim form](../../web/src/components/claims/claim-submission-client.tsx),
[notification service](../../web/src/lib/notifications/service.ts) and
[notification interface](../../web/src/components/notifications/notification-centre.tsx).
Claim, notification, API, service and model tests support the integrated paths.
Luyang's 14 October workflow recapture documents Claim progression and notification
read updates; it is not a separate full dashboard acceptance test.

## Zhikai Wang

Delivered Staff handling, Claim review and recovery, with image-category
suggestions. Integration milestones are 24 August Staff Claim review
(`207ca0f`), 29 August verification/storage and custody release
(`26e6210`, `5a9230c`), and 28 September image analysis/confirmation
(`85cf8ce`, `a554ea1`).

Source: [Staff report service](../../web/src/lib/staff-reports/service.ts),
[Staff Claim service](../../web/src/lib/claims/staff-service.ts) and
[image classifier](../../web/src/lib/ai/image-classifier.ts).
His supplied 7 October demonstration showed verified storage and a completed
recovery. A book photograph's category percentages demonstrate a suggestion
screen, not measured classification accuracy. The course report preserves those
screenshots and the complementary 14 October integrated case.

## Luyang Liu

Delivered account/Staff-access management, reference data, moderation and most
overview functions. The overview donut chart used coding assistance and the
duplicate-review feature used Codex assistance. Integration milestones include
25 August overview aggregation (`ac5d5d8`), 28 and 29 August reference data and
moderation (`aef8b54`, `ab9f962`, `bce4e33`), 22 September Staff controls
(`ca9bfb9`) and 28 September duplicate review (`e247f60`).

He also coordinated the group, received and integrated four members' modules,
resolved cross-module issues, organised release checks and assembled the final
report, selected Figma diagrams and screenshot evidence. These responsibilities
are additional to his own administrator module.

The [11 October administrator audit](../superpowers/verification/2026-10-11-administrator-workspace-audit.md)
records the targeted repairs later released through PR #62. The 14 October
synthetic workflow captures link reports, Claims, Staff handling, recovery and
notifications. The [15 October manual record](manual-2026-10-15/README.md)
adds production association and representative responsive, keyboard and
administrator observations. Command runtimes and screenshot dates are not
personal timesheets.

## Shared feature and verification boundaries

The matcher combines structured rules and local MiniLM text comparison; a
labelled rule ranking remains available when inference fails. Suggestions do
not establish ownership or replace Staff review. Members are expected to
understand this shared workflow without claiming five independent matching
implementations.

The [16 October repository audit](../verification/2026-10-16-repository-audit.md)
records later assisted repairs and checks. Those repairs must not be attributed
retroactively to an earlier member handover or demonstration.
