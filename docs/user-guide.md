# Campus Find User Guide

## Prerequisites

- Windows PowerShell.
- Node.js 20.9 or later and npm.
- A MongoDB Atlas connection string supplied through the team's secure channel.
- Repository access and, for staff/administrator demonstrations, an account that
  already has the corresponding role.

Do not place passwords, account tokens, or the MongoDB URI in screenshots,
documents, Git commits, or chat messages.

## Environment configuration

Open PowerShell and move to the web application:

```powershell
Set-Location 'D:\Massey\CampusLostFound\web'
Copy-Item .env.example .env.local
```

Open `.env.local` locally and replace the placeholder `MONGODB_URI` with the
real connection string. Do not commit this file. The application can appear to
work without a newly created `.env.local` only when `MONGODB_URI` is already
present in the current process or operating-system environment; the server
still requires the variable.

## Install and database bootstrap

Install the locked dependencies:

```powershell
npm install
```

For a new or empty course database, add the standard categories and campus
locations:

```powershell
npm run db:bootstrap
```

This second command writes to the configured database. It is idempotent:
running it again adds missing standard records but does not overwrite existing
administrator edits. Obtain approval before pointing it at a shared database.

## Start the development application

```powershell
npm run dev
```

Open `http://localhost:3000`. Leave that PowerShell window running. Stop the
server with `Ctrl+C`.

For production mode, build before starting:

```powershell
npm run build
npm start
```

The error `Could not find a production build in the '.next' directory` means
`npm start` was used before a successful `npm run build`.

## Student workflow

1. Select **Create account**. Enter a 2–80 character display name, a valid email,
   and a 10–128 character password, then confirm the same password.
2. After signing in, open **Profile** and choose contact, campus, and notification
   preferences.
3. Select **Report item**, choose **Lost** or **Found**, and enter the public
   title, description, category, campus location, date, colours, and tags.
4. Add private ownership questions and evidence separately. Choose privacy
   settings for the public photo, event date, and campus location.
5. Optionally select up to five JPEG, PNG, or WebP images. Check the local
   previews, then submit the report. Each stored image must be no larger than
   3 MiB after safe re-encoding.
6. Open **My reports** to see the report history and select the new report.
7. On an open report, choose **Find possible matches**. Review the score and the
   positive factor explanations; a suggestion is not proof of ownership.
8. Use **Browse** to open another user's report. Select the ownership Claim
   action, answer the verification questions, and choose **Submit claim**.
9. Open **My claims** to track pending, approved, rejected, withdrawn, or
   completed recovery requests.
10. Open **Notifications**, follow **View report** or **View claim**, and use
    **Mark as read**. The unread badge should decrease after a successful update.

## Staff workflow

Use an active staff or administrator account.

1. Open **Report handling** and filter the report queue.
2. Open a report and select **Verify report** after checking its content.
3. For a Found item held by the campus team, enter the **Storage location** and
   save it. Keep operational details factual and appropriately restricted.
4. Open **Claim reviews**, choose a pending Claim, and review the protected
   question responses.
5. Add an optional internal note and choose **Approve Claim** or **Reject Claim**,
   then confirm the decision.
6. After an approved recovery is physically completed, choose **Mark handover
   complete** and confirm. The report and Claim should show the completed
   recovery state.

## Administrator workflow

Use an active administrator account.

1. Open **Admin overview**. Explain the Reports, Claims and recovery, and Accounts
   totals. Each section includes a doughnut chart and exact numeric legend.
2. Select **Refresh overview** to reload all three statistic groups.
3. Open **Manage accounts** and search for a member. Add Staff access to a
   registered student or remove it from a Staff account. The affected user must
   sign in again. You can also suspend, restore, or deactivate a member with an
   appropriate reason. Administrators cannot target their own account or grant
   administrator access through this page.
4. Open **Manage reference data**. Create or edit categories and campus
   locations; deactivate records instead of deleting them so old reports retain
   their references.
5. Open **Report moderation** or **Review flagged reports**. Filter the pending
   flag queue, inspect the linked report, then dismiss the flag or hide the
   report. A hidden report leaves recovery and audit records intact.
6. Demonstrate that every detail page has the consistent top-left in-application
   back link, without relying on the browser's Back button.

## Image upload rules

- Accepted formats: JPEG, PNG, and WebP.
- Maximum: five images per report.
- Maximum stored size: 3 MiB per image.
- The browser preview exists only for confirmation before upload.
- The server checks file signature, decodes the image, normalises orientation,
  and re-encodes it without EXIF metadata.
- Stored images use protected `/api/report-images/<id>` paths. Old external URLs
  are read only for migration compatibility.

## Explainable matching demonstration

1. Prepare one open Lost report and one open Found report belonging to different
   users. Give them overlapping category, public location/date, colour, tags,
   and wording.
2. Open the owner's report and select **Find possible matches**.
3. Explain that the maximum score is 100: category 25, location 15, date 15,
   colours 15, tags 10, and text similarity 20.
4. Explain that the rules first admit candidates scoring at least 35, up to
   five are shown, and the local AI model can rerank up to 30 admitted
   candidates by public wording. Point out the AI-assisted or rule-fallback
   label; neither label means ownership has been proven.
5. Point to the factor explanations. Confirm that private answers, reporter
   identity, contact information, serial number, and exact private location are
   not used.
6. Reproduce the independent synthetic evaluation in PowerShell:

```powershell
Set-Location 'D:\Massey\CampusLostFound-project-quality-polish\web'
npm run evaluate:matching
npm run evaluate:matching:ai
```

The second command downloads the model on first use; inference is local after
that. The measured comparison and limitations are in
`docs/ai-matching-evaluation.md`.

## Common errors and recovery

| Symptom | Likely cause | Recovery |
| --- | --- | --- |
| Database health or sign-in fails | Missing/invalid `MONGODB_URI`, Atlas network rule, or unavailable cluster | Check `.env.local` locally, Atlas access, and server terminal; restart `npm run dev` |
| Production build not found | `npm start` used first | Run `npm run build`, then `npm start` |
| Image selection or upload is rejected | Wrong type, over five files, over 3 MiB stored size, or damaged image | Use a valid JPEG/PNG/WebP and reduce dimensions/file size |
| An image preview is blank | Stale server/client bundle or invalid local file | Restart the development server, reselect the file, and check terminal/network errors |
| HTTP 429 / too many requests | Basic abuse limit reached | Wait for the displayed/retry interval; do not repeatedly submit |
| Update says the record changed | Optimistic concurrency prevented a stale write | Use the page's Refresh action, review the latest state, then retry |
| Staff/admin links are absent | Account has the wrong role or is inactive | Sign in with the authorised role; an administrator can configure Staff access in Manage accounts |
| Notification cannot be marked read | Session expired or server/database request failed | Sign in again, use **Retry**, and check the server terminal |

## Privacy and security notes

- Public report views omit ownership answers and restricted identity/contact
  details.
- Password hashes, session token hashes, image binary data, internal notes, and
  private verification fields are not ordinary API response fields.
- A possible match never approves a Claim.
- Administrators hide or restore reports rather than deleting recovery history.
- The legacy image audit is read-only by default:
  `npm run db:audit-legacy-images`. Its destructive `--apply` option requires a
  backup and separate approval.
