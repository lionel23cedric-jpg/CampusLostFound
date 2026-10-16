# Production and representative manual verification, 15 October 2026

Coordinator: Luyang Liu (Cedric), Group 13. Timezone: Pacific/Auckland.

These 18 screenshots were supplied during guided checks. The image files are
unchanged; [SHA256SUMS.json](SHA256SUMS.json) identifies their bytes. A screenshot
documents visible state. The coordinator's confirmations of scrolling, keyboard
traversal and collapse behaviour are recorded separately below.

## Production release association

| Screenshot | Observation |
| --- | --- |
| [Overview](DEPLOYMENT-2026-10-15/01-production-overview.png) | Ready production deployment; domain `campus-lost-found-flame.vercel.app`; source `main`/`58b2ad4`, created 11 October. |
| [Deployment history](DEPLOYMENT-2026-10-15/02-production-history.png) | Visible production list starts with the 11 October `58b2ad4` release. Older failed September builds are followed by successful builds. |
| [Deployment details](DEPLOYMENT-2026-10-15/03-production-details.png) | Ready, Latest and Production Current for `58b2ad4`. |

These captures retrospectively support association of the 14 October
TEST-DEMO-01 demonstration with release `58b2ad4`. The original workflow
screenshots do not contain a commit stamp. This is a historical observation,
not evidence of the later 16 October deployment or a complete domain-assignment
history.

## Responsive homepage

| Screenshot | Observed area |
| --- | --- |
| [320 x 800 top](RESPONSIVE-2026-10-15/01-home-320x800-top.png) | Logo, account links, headline and introduction. |
| [320 x 800 actions](RESPONSIVE-2026-10-15/02-home-320x800-actions.png) | Clue card and vertically stacked Lost, Found and Browse actions. |
| [320 x 800 recovery explanation](RESPONSIVE-2026-10-15/03-home-320x800-recovery-explanation.png) | Three recovery stages, descriptions and icons. |
| [320 x 800 privacy/footer](RESPONSIVE-2026-10-15/04-home-320x800-privacy-footer.png) | Privacy explanation and footer. The dimension input is 320 pixels; the separate 375px ruler hint does not establish a 375px test. |
| [390 x 800 top](RESPONSIVE-2026-10-15/05-home-390x800-top.png) | Upper homepage, with the remainder reviewed by the coordinator. |

The visible sections have no obvious text overlap or truncation. The coordinator
confirmed that homepage content needed no horizontal scrolling at 320 pixels
and reported the 390px full-page review as normal. The images are device
simulation captures, not physical-phone tests or measured DOM overflow checks.

## Keyboard checks

| Screenshot | Visible evidence |
| --- | --- |
| [Homepage Sign in focus](KEYBOARD-2026-10-15/01-home-sign-in-focus.png) | Focus outline on the Sign in link. |
| [Login navigation result](KEYBOARD-2026-10-15/02-login-navigation-result.png) | Login screen after the instructed Tab/Enter navigation. |
| [Login submit focus](KEYBOARD-2026-10-15/03-login-submit-focus.png) | Focus outline on Sign in securely. |
| [Login email focus](KEYBOARD-2026-10-15/04-login-email-focus.png) | Focus outline on Email address. |

The coordinator confirmed forward and reverse Tab traversal through the specified
login controls. Keystrokes were not independently logged. No credentials were
entered and no successful sign-in or form validation result is claimed.

## Administrator observations

| Screenshot | Visible evidence |
| --- | --- |
| [Overview totals](ADMIN-2026-10-15/00-overview-15-oct.png) | Update label 15 October, 12:34 am; Lost 15 + Found 25 = Submitted 40 and Unresolved 21 + Recovered 19 = 40. Matched 19 overlaps recovered. |
| [Duplicate scan](ADMIN-2026-10-15/01-duplicate-scan-summary.png) | AI-assisted output; 20 pairings grouped into nine review targets; dates, short IDs and factors. |
| [Grouped targets](ADMIN-2026-10-15/02-grouped-duplicate-targets.png) | Same-title targets `300cae` and `8be27f` are distinguished from closest match `300ca8`; alternate-pair controls are collapsed. |
| [Existing pending flags](ADMIN-2026-10-15/03-existing-pending-flags.png) | Flags dated 9 October for distinct targets; recovery Resolved and visibility Visible. These flags were not created during this check. |
| [Alternate pairing expanded](ADMIN-2026-10-15/04-alternate-pair-expanded.png) | Target `300cae`, closest match `300ca8` and alternate `300cab`, with identifying details and factors. |
| [Moderation at 320 x 800](ADMIN-2026-10-15/05-moderation-320x800-top.png) | Representative upper content and full Scan button; navigation is a separately scrollable strip. |

The coordinator confirmed that the expanded pairing could collapse and that
only the navigation strip needed horizontal movement. The image alone does not
show the later collapse or all content below the viewport.

Scanning changes no report visibility. In the released client, a target becomes
queued after a successful submission or an existing-pending response; scanning
does not preload every flag as a disabled button. The pending uniqueness index
is scoped to report and submitting member. An enabled button beside an existing
queue record does not establish an index failure. No Send, Dismiss, Hide,
Restore, account-role change or reference-data save was performed in this pass.

## Interpretation and retained sources

The 100% labels are combined similarity scores, not confirmed duplication or
ownership probabilities. Flag review, report visibility and recovery are
separate state dimensions. These checks do not establish all-route keyboard
access, screen-reader/contrast conformance, real-device behaviour or complete
Administrator write-path acceptance.

The source archive remains `Submission_Manual_Evidence_2026-10-15.zip`, SHA-256
`e85eb6cff20bb0b62ce57266f7edaebf1ad9e33ba587def5a9de725b69bd56e6`.
This repository page replaces the archive's older report-name and citation-letter
instructions. The captured images and their original dates are unchanged.
