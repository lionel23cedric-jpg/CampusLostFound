# Administrator Illustration Variety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Give each administrator workspace a distinct, course-appropriate campus operations banner without changing page behaviour.

**Architecture:** Generate four project-local raster assets with one consistent editorial photography direction. Reuse the existing \`ContextIllustration\` component by adding four explicit source keys, then change only the four administrator call sites.

**Tech Stack:** Next.js Image, React, TypeScript, CSS Modules, Vitest, built-in image generation.

## Global Constraints

- Preserve all administrator page structure, copy, routes, permissions, statistics, controls, and behaviour.
- Use realistic editorial campus photography, natural daylight, warm neutral colours, and landscape 3:2 composition.
- Do not include readable interface text, institutional logos, watermarks, futuristic control rooms, or sensitive personal information.
- Store every final asset in \`web/public/illustrations/\`; add no dependencies and no database changes.

---

### Task 1: Generate four administrator assets

**Files:**
- Create: \`web/public/illustrations/admin-operations-overview.png\`
- Create: \`web/public/illustrations/admin-accounts-staff.png\`
- Create: \`web/public/illustrations/admin-reference-data.png\`
- Create: \`web/public/illustrations/admin-report-moderation.png\`

**Interfaces:**
- Consumes: the existing 3:2 banner crop in \`ContextIllustration\`.
- Produces: four 1536×1024 local PNG assets with stable paths for Task 2.

- [ ] **Step 1: Generate the operations-overview image**

Use built-in image generation with this prompt:

\`\`\`text
Use case: photorealistic-natural
Asset type: wide administrator dashboard banner for a university lost-and-found web application
Scene/backdrop: bright contemporary campus service office
Subject: an organised lost-property operations desk with labelled-looking but unreadable trays, a laptop showing abstract charts, a notebook, keys, a reusable bottle and a small bag
Style/medium: realistic editorial photography, candid and credible rather than staged
Composition/framing: landscape 3:2, layered scene with a clear central operational focus, suitable for a shallow wide crop
Lighting/mood: natural daylight, calm, capable, high-quality campus service
Color palette: forest green, warm cream, muted terracotta and natural wood
Constraints: no readable text, no logos, no watermark, no futuristic interfaces, no personal data
\`\`\`

- [ ] **Step 2: Generate the accounts-and-staff image**

Use the same visual direction with two diverse campus administrators reviewing an access roster together at a desk, staff badges turned away or unreadable, laptop and office materials visible, and no lost-property shelving as the main subject.

- [ ] **Step 3: Generate the reference-data image**

Use the same visual direction with a structured work surface holding a campus map, location markers, category cards, neutral labels and organised stationery; include hands arranging the materials, but no readable map or label text.

- [ ] **Step 4: Generate the moderation image**

Use the same visual direction with one campus administrator comparing abstract report photographs and record cards on a monitor beside tagged everyday lost-property items; show a careful review task without readable personal or report data.

- [ ] **Step 5: Inspect and save every final asset**

Verify subject, visual consistency, wide-crop safety, absence of readable text/logos, and output dimensions. Copy each selected output into the exact project path above without overwriting unrelated assets.

### Task 2: Map each asset to its administrator workspace

**Files:**
- Modify: \`web/src/components/context-illustration.tsx:5-13\`
- Modify: \`web/src/components/context-illustration.test.tsx:24-30\`
- Modify: \`web/src/components/admin/admin-overview-client.tsx:266\`
- Modify: \`web/src/components/admin/admin-account-management-client.tsx:715\`
- Modify: \`web/src/components/admin/admin-reference-data-client.tsx:63\`
- Modify: \`web/src/components/admin/admin-moderation-client.tsx:92\`

**Interfaces:**
- Consumes: four PNG paths from Task 1.
- Produces: \`IllustrationKind\` values \`adminOverview\`, \`adminAccounts\`, \`adminReference\`, and \`adminModeration\`.

- [ ] **Step 1: Write the failing source-mapping test**

Replace the single administrator case in \`context-illustration.test.tsx\` with:

\`\`\`tsx
["adminOverview", "/illustrations/admin-operations-overview.png"],
["adminAccounts", "/illustrations/admin-accounts-staff.png"],
["adminReference", "/illustrations/admin-reference-data.png"],
["adminModeration", "/illustrations/admin-report-moderation.png"],
\`\`\`

- [ ] **Step 2: Run the focused test and verify failure**

Run: \`npm test -- --run src/components/context-illustration.test.tsx\`

Expected: TypeScript or assertion failure because the four illustration keys are not mapped yet.

- [ ] **Step 3: Add the four shared image sources**

In \`context-illustration.tsx\`, replace \`administration\` with:

\`\`\`ts
adminOverview: "/illustrations/admin-operations-overview.png",
adminAccounts: "/illustrations/admin-accounts-staff.png",
adminReference: "/illustrations/admin-reference-data.png",
adminModeration: "/illustrations/admin-report-moderation.png",
\`\`\`

- [ ] **Step 4: Update the four call sites**

Set the overview, accounts, reference-data and moderation pages to
\`adminOverview\`, \`adminAccounts\`, \`adminReference\` and \`adminModeration\`
respectively. Keep \`variant="banner"\` and \`priority\` unchanged.

- [ ] **Step 5: Run focused and project checks**

Run:

\`\`\`powershell
npm test -- --run src/components/context-illustration.test.tsx src/components/admin
npm run lint
npx tsc --noEmit
npm run build
\`\`\`

Expected: every command exits 0.

- [ ] **Step 6: Verify the rendered result**

Open all four administrator routes at desktop and phone widths. Confirm each
page loads a different image, the shallow banner crop preserves the intended
subject, and there are no console errors or layout shifts. Run the Impeccable
detector once over the changed UI targets.

- [ ] **Step 7: Commit**

\`\`\`powershell
git add web/public/illustrations/admin-*.png web/src/components/context-illustration.tsx web/src/components/context-illustration.test.tsx web/src/components/admin/admin-overview-client.tsx web/src/components/admin/admin-account-management-client.tsx web/src/components/admin/admin-reference-data-client.tsx web/src/components/admin/admin-moderation-client.tsx
git commit -m "feat(admin): vary workspace imagery"
\`\`\`

