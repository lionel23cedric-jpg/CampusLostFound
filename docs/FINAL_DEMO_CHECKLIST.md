# Final Demonstration Checklist

Use the production site: https://campus-lost-found-flame.vercel.app/

The order below keeps the demonstration short, shows the three roles clearly,
and gives an immediate source-code location if a marker asks how a button works.
Do not approve, reject, hide, deactivate, or delete real records during the demo.

## 1. Public home page

1. Open `/` while signed out.
2. Point out the campus recovery hero, visual recovery explanation, and direct
   Register/Sign in actions.
3. Explain that the page is informative and the working features require an
   authenticated role.

Code to open:

- UI route: `web/src/app/page.tsx`
- Page presentation: `web/src/app/page.module.css`
- Shared illustrations: `web/src/components/context-illustration.tsx`

## 2. Student role

### 2.1 Student dashboard and navigation

1. Sign in as a Student and open `/dashboard`.
2. Show Browse, My reports, Claims, Notifications, Dashboard, and Profile.
3. Explain that role-aware navigation is derived from the server-backed session.

Code to open:

- Role dashboard selection: `web/src/components/dashboard/dashboard-client.tsx`
- Student dashboard: `web/src/components/dashboard/student-dashboard.tsx`
- Navigation: `web/src/components/site-header.tsx`

### 2.2 Smart Search

1. Open **Browse**.
2. Enter a natural-language query such as `red backpack near library`.
3. Run the search and point to **AI-assisted search**.

Code to open:

- Search form and result label: `web/src/components/reports/report-browser.tsx`
- Client request: `web/src/lib/reports/browser-client.ts`
- Server ranking: `web/src/lib/reports/browse-service.ts`
- Shared embeddings: `web/src/lib/reports/local-embedding.ts`

If asked “what happens if I remove the Smart Search UI?”, remove only the
corresponding labelled form block from `report-browser.tsx`; do not delete the
service or API unless the feature itself is intentionally being removed.

### 2.3 Report form assistants

1. Open **Report item** and fill the minimum public report fields.
2. Run the description/tag helper and show **AI-assisted suggestion**.
3. Explain that the form changes only after **Apply suggestion**.
4. Select an image and press **Suggest category from first photo**.
5. Show the confidence-ranked **AI-assisted category suggestions** and explain
   that **Use this category** is still a human decision.
6. Do not submit the demonstration report.

Code to open:

- Form component: `web/src/components/reports/report-form.tsx`
  - `requestAssistantSuggestion` begins near line 257.
  - `requestImageCategorySuggestion` begins near line 312.
- Image button: `web/src/components/reports/report-image-picker.tsx` near line 176.
- Text API: `web/src/app/api/ai/report-assistant/route.ts`.
- Image API: `web/src/app/api/ai/image-category/route.ts` near line 31.
- Text logic: `web/src/lib/ai/report-assistant.ts`.
- Image model runtime: `web/src/lib/ai/image-classifier.ts` near line 221.

### 2.4 Intelligent matching

1. Open one of the Student's own Open reports.
2. Press **Find possible matches**.
3. Point to candidate scores, explanations, and **AI-assisted text comparison**.
4. Explain that matching never creates or approves a Claim automatically.

Code to open:

- Button and `loadMatches`: `web/src/components/reports/report-matches-panel.tsx`
  (component near line 30; button near line 92).
- Client request: `web/src/lib/reports/browser-client.ts`.
- Matching algorithm: `web/src/lib/reports/matching-service.ts`.
- Match API: `web/src/app/api/reports/[id]/matches/route.ts`.

## 3. Staff role

1. Sign out and sign in as Staff.
2. Open `/dashboard` and point to **Recovery Operations Desk**.
3. Show that the Staff navigation contains Report handling and Claim reviews,
   not Student submission tools or Administrator account controls.
4. Open `/staff/reports` and demonstrate the queue filters without changing a
   record.
5. Open `/staff/claims` and show the restricted Claim review queue without
   approving or rejecting a Claim.

Code to open:

- Staff home-page cards: `web/src/components/dashboard/staff-dashboard.tsx`.
- Report queue UI: `web/src/components/staff-reports/staff-report-list-client.tsx`.
- Report query/service: `web/src/lib/staff-reports/service.ts` near line 102.
- Claim queue UI: `web/src/components/claims/staff-claim-list-client.tsx`.
- Claim query/service: `web/src/lib/claims/staff-service.ts` near line 169.
- Server access boundary: `web/src/components/staff/staff-access-boundary.tsx`.

## 4. Administrator role

### 4.1 Operations overview and charts

1. Sign out and sign in as Administrator.
2. Open `/admin` and introduce it as **Campus Find Operations**, not a generic
   member dashboard.
3. Show the Reports, Claims, and Accounts statistics and their percentage donut
   charts.
4. Press **Refresh overview** and show the updated timestamp.

One-second code path:

1. UI and Refresh button: `web/src/components/admin/admin-overview-client.tsx`
   (`AdminOverviewClient` near line 104; button near line 249).
2. Chart rendering: `web/src/components/admin/overview-donut.tsx`.
3. Browser request: `web/src/lib/admin/browser-client.ts`,
   `getAdministratorOverview` near line 91.
4. Protected API: `web/src/app/api/admin/overview/route.ts`, `GET` near line 24.
5. Database aggregation: `web/src/lib/admin/overview-service.ts`, ending in
   `getAdministratorOverview` near line 141.
6. Cross-total validation: `web/src/lib/admin/overview-contract.ts`,
   `buildAdministratorOverview` near line 178.

If asked to remove a chart, remove the relevant `OverviewDonut` use from
`admin-overview-client.tsx`, not the underlying totals. If asked to change a
section title, edit its heading string in the same component; the API and
database aggregation do not need to change.

### 4.2 Accounts and Staff membership

1. Open **Accounts and staff**.
2. Show search, role/status filters, **Add Staff access**, **Remove Staff
   access**, Suspend, and Deactivate controls.
3. Explain that the client Administrator can manage Staff membership without
   editing MongoDB or seeing another person's password.
4. Do not change a real account during the demonstration unless the owner has
   selected a disposable test account.

Code to open:

- UI and confirmation flow:
  `web/src/components/admin/admin-account-management-client.tsx`.
- Client calls: `web/src/lib/admin/account-browser-client.ts`.
- Role endpoint: `web/src/app/api/admin/accounts/[userId]/role/route.ts`.
- Status endpoint: `web/src/app/api/admin/accounts/[userId]/status/route.ts`.
- Database service: `web/src/lib/admin/account-service.ts`.

### 4.3 Categories and campus locations

1. Open **Reference data**.
2. Show Category creation/search/edit controls.
3. Activate **Campus locations** and show its equivalent controls.
4. Explain that deactivation removes a choice from future report forms while
   retaining historical references.

Code to open:

- Tabs: `web/src/components/admin/admin-reference-data-client.tsx`.
- Category UI: `web/src/components/admin/category-management-panel.tsx`
  (create handler near line 308; update handler near line 416).
- Campus location UI:
  `web/src/components/admin/campus-location-management-panel.tsx`
  (create handler near line 321; update handler near line 433).
- APIs: `web/src/app/api/admin/categories` and
  `web/src/app/api/admin/campus-locations`.

### 4.4 Flags, visibility, and AI duplicate detection

1. Open **Moderation**.
2. Show the Flag queue and Report visibility filters.
3. Press **Scan for possible duplicates**.
4. Point to the similarity, explanation list, and **AI-assisted** label.
5. Explain that scanning is read-only and that **Send to moderation queue** is a
   separate human action. Do not press it during the demonstration.

Code to open:

- Scan button and result UI:
  `web/src/components/admin/admin-moderation-client.tsx` (component near line 17;
  button near line 103).
- Duplicate UI logic:
  `web/src/components/admin/admin-moderation-duplicates.tsx`.
- Protected API: `web/src/app/api/admin/ai/duplicates/route.ts`, `GET` near line 19.
- Candidate algorithm: `web/src/lib/ai/duplicate-detection.ts`.
- Existing flag/visibility UI:
  `web/src/components/admin/admin-moderation-flag-queue.tsx` and
  `web/src/components/admin/admin-moderation-report-list.tsx`.

## 5. Where the data is saved

The application stores persistent records in MongoDB through Mongoose models:

| Data | Collection/model code | Main create/update service |
| --- | --- | --- |
| User and role | `web/src/models/user.ts` | Auth services and `web/src/lib/admin/account-service.ts` |
| Report | `web/src/models/report.ts` | `web/src/lib/reports/service.ts` |
| Claim | `web/src/models/claim.ts` | `web/src/lib/claims/claimant-service.ts` and `staff-service.ts` |
| Category | `web/src/models/category.ts` | Administrator reference-data service |
| Campus location | `web/src/models/campus-location.ts` | Administrator reference-data service |
| Report flag | `web/src/models/report-flag.ts` | Administrator moderation service |
| Notification | `web/src/models/notification.ts` | Notification service |

To inspect records safely, use the Administrator/Staff interfaces or MongoDB
Compass with the project's authorised connection. Never print `.env.local`, the
MongoDB URI, password hashes, session-token hashes, or private ownership answers
during the presentation.

## 6. Fast answer pattern for any button

When asked “Where is this button implemented?”, answer in this order:

1. Use browser Developer Tools → Network and press the button.
2. Read the request path, for example `/api/admin/overview`.
3. In VS Code search the exact visible button label to find the React component.
4. Search the request path to find the browser client and API route.
5. Follow the imported service to the database/model code.

The typical path is:

`Button → React handler → browser client → /api route → role/session check → service → Mongoose model → MongoDB`

If asked to delete a line of UI or add a title, change the React component only.
If asked to change data behaviour, validation, authorisation, or persistence,
follow the full path and update its focused tests as well.

## 7. Final two-minute closing statement

“Campus Find separates Student recovery work, Staff operations, and
Administrator governance. It stores users, roles, reports, Claims, reference
data, flags, and notifications in MongoDB behind server-side role checks. The
five AI-assisted functions run with packaged local models: matching, Smart
Search, report wording and tags, image category suggestions, and duplicate
detection. Every result is labelled, explainable, bounded, and still requires a
human decision. The production application, 3,045 automated tests, TypeScript,
lint, build, dependency audit, and matching evaluation have all passed.”
