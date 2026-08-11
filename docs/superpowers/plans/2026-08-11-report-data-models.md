# Report Data Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add validated, indexed Mongoose models for managed categories, campus locations, shared lost/found reports and separately protected ownership-verification data.

**Architecture:** Public member-visible report content lives in `itemReports`; sensitive ownership evidence lives in a one-to-one `privateVerificationDetails` collection. Category and CampusLocation provide controlled references. Every model follows the existing default-Mongoose-import and compiled-model-reuse pattern used by User and Profile.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, Mongoose 9, Node.js 20.9+, npm.

## Global Constraints

- Implement only Category, CampusLocation, ItemReport and PrivateVerificationDetails.
- Lost and found records share ItemReport and are distinguished by `reportType`.
- Public report data is member-only; anonymous access is outside this change.
- Sensitive private fields must use `select: false` and live outside ItemReport.
- Do not add routes, services, repositories, pages, uploads, Claim or matching models.
- Do not add dependencies.
- Do not connect to Atlas or write test records during schema validation.
- Preserve `.env.local` as ignored and never inspect or stage it.
- The four model files already exist as uncommitted work in progress because writing-plans was installed after implementation began; execution must review and validate them against this plan before committing.

---

### Task 1: Controlled Category and CampusLocation Models

**Files:**
- Create/review: `web/src/models/category.ts`
- Create/review: `web/src/models/campus-location.ts`
- Reference: `web/src/models/user.ts`
- Reference: `web/src/models/profile.ts`

**Interfaces:**
- Produces: `categorySchema`, `Category`, `CategoryModel`.
- Produces: `campusLocationSchema`, `CampusLocation`, `CampusLocationModel`.
- Category fields: `name`, `description`, `isActive`, timestamps.
- CampusLocation fields: `campusName`, `locationName`, `description`, `isActive`, timestamps.

- [ ] **Step 1: Run in-memory model validation against the work in progress**

Run from `web/`:

```powershell
node --no-warnings --experimental-strip-types --input-type=module -e "import assert from 'node:assert/strict'; const { CategoryModel, categorySchema } = await import('./src/models/category.ts'); const { CampusLocationModel, campusLocationSchema } = await import('./src/models/campus-location.ts'); const category = new CategoryModel({ name: 'Electronics' }); await category.validate(); assert.equal(category.isActive, true); const location = new CampusLocationModel({ campusName: 'Manawatu', locationName: 'Library' }); await location.validate(); assert.equal(location.isActive, true); assert.ok(categorySchema.indexes().some(([fields, options]) => fields.name === 1 && options.unique === true && options.collation?.strength === 2)); assert.ok(campusLocationSchema.indexes().some(([fields, options]) => fields.campusName === 1 && fields.locationName === 1 && options.unique === true && options.collation?.strength === 2)); console.log('reference models valid');"
```

Expected: `reference models valid`.

- [ ] **Step 2: Verify the implementation uses exact validation and indexes**

Required schema shape:

```ts
categorySchema.index(
  { name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);

campusLocationSchema.index(
  { campusName: 1, locationName: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);
```

Confirm these exact validation options in `categorySchema`:

- `name`: `required`, `trim`, `minlength: 2`, `maxlength: 80`.
- `description`: `trim`, `maxlength: 300`, `default: null`.
- `isActive`: Boolean, `required: true`, `default: true`.

Confirm these exact validation options in `campusLocationSchema`:

- `campusName`: `required`, `trim`, `minlength: 2`, `maxlength: 80`.
- `locationName`: `required`, `trim`, `minlength: 2`, `maxlength: 120`.
- `description`: `trim`, `maxlength: 300`, `default: null`.
- `isActive`: Boolean, `required: true`, `default: true`.

- [ ] **Step 3: Run lint for the two model files**

Run:

```powershell
npm.cmd run lint -- src/models/category.ts src/models/campus-location.ts
```

Expected: exit code 0 with no ESLint errors.

- [ ] **Step 4: Commit the controlled reference models**

```powershell
git add web/src/models/category.ts web/src/models/campus-location.ts
git commit -m "feat(reports): add category and campus location models" -m "Refs #8"
```

---

### Task 2: Shared Lost and Found ItemReport Model

**Files:**
- Create/review: `web/src/models/item-report.ts`

**Interfaces:**
- Consumes string model references: `User`, `Category`, `CampusLocation`.
- Produces: `REPORT_TYPES`, `REPORT_STATUSES`, `itemReportSchema`, `ItemReport`, `ItemReportModel`.
- Report types: `lost`, `found`.
- Statuses: `draft`, `open`, `claim_pending`, `resolved`, `closed`.

- [ ] **Step 1: Run focused ItemReport validation**

Run from `web/`:

```powershell
node --no-warnings --experimental-strip-types --input-type=module -e "import assert from 'node:assert/strict'; import mongoose from 'mongoose'; const { ItemReportModel, itemReportSchema } = await import('./src/models/item-report.ts'); const ids = { reporterId: new mongoose.Types.ObjectId(), categoryId: new mongoose.Types.ObjectId(), campusLocationId: new mongoose.Types.ObjectId() }; const base = { ...ids, reportType: 'lost', title: 'Black laptop bag', publicDescription: 'Lost near the main campus library.', occurredAt: new Date(), colors: ['Black'] }; const valid = new ItemReportModel(base); await valid.validate(); assert.equal(valid.status, 'draft'); assert.equal(valid.privacySettings.showPhoto, true); const rejectsField = async (document, field) => { try { await document.validate(); return false; } catch (error) { return Boolean(error?.errors?.[field]); } }; assert.equal(await rejectsField(new ItemReportModel({ ...base, reportType: 'missing' }), 'reportType'), true); assert.equal(await rejectsField(new ItemReportModel({ ...base, colors: [] }), 'colors'), true); assert.equal(await rejectsField(new ItemReportModel({ ...base, photoUrls: Array(6).fill('https://example.com/item.jpg') }), 'photoUrls'), true); assert.equal(await rejectsField(new ItemReportModel({ ...base, status: 'resolved' }), 'resolvedAt'), true); assert.ok(itemReportSchema.indexes().some(([fields]) => fields.title === 'text' && fields.publicDescription === 'text' && fields.tags === 'text')); console.log('item report valid');"
```

Expected: `item report valid`.

- [ ] **Step 2: Verify array validators and privacy defaults**

Required implementation:

```ts
const privacySettingsSchema = new Schema(
  {
    showPhoto: { type: Boolean, default: true, required: true },
    showEventDate: { type: Boolean, default: true, required: true },
    showCampusLocation: { type: Boolean, default: true, required: true },
  },
  { _id: false },
);

validator: (values: string[]) =>
  values.length >= 1 && values.length <= 5;

validator: (values: string[]) => values.length <= 10;
```

Use the first validator for colours, the second for tags, and `values.length <= 5` for photo URLs. Photo strings must match `/^https?:\/\/\S+$/i`.

- [ ] **Step 3: Verify resolved-state and search indexes**

Required validator and indexes:

```ts
validator: function (
  this: { status?: (typeof REPORT_STATUSES)[number] },
  value: Date | null,
) {
  return this.status !== "resolved" || value !== null;
}

itemReportSchema.index({ reporterId: 1, createdAt: -1 });
itemReportSchema.index({ reportType: 1, status: 1, categoryId: 1, occurredAt: -1 });
itemReportSchema.index({ campusLocationId: 1, status: 1, occurredAt: -1 });
itemReportSchema.index(
  { title: "text", publicDescription: "text", tags: "text" },
  { name: "item_report_search", weights: { title: 5, tags: 3, publicDescription: 1 } },
);
```

- [ ] **Step 4: Run lint for ItemReport**

```powershell
npm.cmd run lint -- src/models/item-report.ts
```

Expected: exit code 0.

- [ ] **Step 5: Commit ItemReport**

```powershell
git add web/src/models/item-report.ts
git commit -m "feat(reports): add shared item report model" -m "Refs #8"
```

---

### Task 3: Private Ownership Verification Model

**Files:**
- Create/review: `web/src/models/private-verification-details.ts`

**Interfaces:**
- Consumes string model reference: `ItemReport`.
- Produces: `privateVerificationDetailsSchema`, `PrivateVerificationDetails`, `PrivateVerificationDetailsModel`.
- One private record per ItemReport through a unique `reportId` index.

- [ ] **Step 1: Run focused private-data validation**

Run from `web/`:

```powershell
node --no-warnings --experimental-strip-types --input-type=module -e "import assert from 'node:assert/strict'; import mongoose from 'mongoose'; const { PrivateVerificationDetailsModel, privateVerificationDetailsSchema } = await import('./src/models/private-verification-details.ts'); const valid = new PrivateVerificationDetailsModel({ reportId: new mongoose.Types.ObjectId(), distinguishingFeatures: ['Small scratch beneath the handle'], verificationQuestions: [{ question: 'What is attached to the keyring?', expectedAnswer: 'A blue tag' }] }); await valid.validate(); const rejectsField = async (document, field) => { try { await document.validate(); return false; } catch (error) { return Boolean(error?.errors?.[field]); } }; assert.equal(await rejectsField(new PrivateVerificationDetailsModel({ reportId: new mongoose.Types.ObjectId(), distinguishingFeatures: [], verificationQuestions: [{ question: 'What colour is the tag?', expectedAnswer: 'Blue' }] }), 'distinguishingFeatures'), true); assert.equal(privateVerificationDetailsSchema.path('distinguishingFeatures').options.select, false); assert.equal(privateVerificationDetailsSchema.path('exactLocationDetails').options.select, false); assert.equal(privateVerificationDetailsSchema.path('serialNumber').options.select, false); assert.equal(privateVerificationDetailsSchema.path('privateNotes').options.select, false); const questions = privateVerificationDetailsSchema.path('verificationQuestions'); assert.equal(questions.schema.path('expectedAnswer').options.select, false); assert.ok(privateVerificationDetailsSchema.indexes().some(([fields, options]) => fields.reportId === 1 && options.unique === true)); console.log('private verification valid');"
```

Expected: `private verification valid`.

- [ ] **Step 2: Verify exact private-field constraints**

Confirm these exact private-field rules:

- `distinguishingFeatures`: 1-10 strings; each is trimmed and at most 200 characters; the array path has `select: false`.
- `exactLocationDetails`: optional trimmed string, at most 500 characters, `default: null`, `select: false`.
- `serialNumber`: optional trimmed string, at most 200 characters, `default: null`, `select: false`.
- `verificationQuestions`: 1-5 embedded documents and `{ _id: false }` on the embedded schema.
- `question`: required trimmed string, 5-200 characters.
- `expectedAnswer`: required trimmed string, 1-500 characters, `select: false`.
- `privateNotes`: optional trimmed string, at most 2000 characters, `default: null`, `select: false`.

- [ ] **Step 3: Run lint for the private model**

```powershell
npm.cmd run lint -- src/models/private-verification-details.ts
```

Expected: exit code 0.

- [ ] **Step 4: Commit the private model**

```powershell
git add web/src/models/private-verification-details.ts
git commit -m "feat(reports): add private verification model" -m "Refs #8"
```

---

### Task 4: Full Regression, Security and Scope Verification

**Files:**
- Review: `web/src/models/category.ts`
- Review: `web/src/models/campus-location.ts`
- Review: `web/src/models/item-report.ts`
- Review: `web/src/models/private-verification-details.ts`
- Review: `docs/superpowers/specs/2026-08-11-report-data-models-design.md`

**Interfaces:**
- Consumes all four model modules.
- Produces a clean, reviewable Issue #8 branch with no Atlas test data and no dependency changes.

- [ ] **Step 1: Run full lint**

```powershell
npm.cmd run lint
```

Expected: exit code 0.

- [ ] **Step 2: Run the production build**

```powershell
npm.cmd run build
```

Expected: Next.js compilation and TypeScript checks succeed; `/api/health/database` remains a dynamic route.

- [ ] **Step 3: Run dependency security audit**

```powershell
npm.cmd audit
```

Expected: `found 0 vulnerabilities`.

- [ ] **Step 4: Verify secrets and scope**

```powershell
git status --short --ignored web/.env.local
git diff --check
git diff --stat develop...HEAD
git log --oneline develop..HEAD
```

Expected:

```text
!! web/.env.local
```

The branch must contain only the design/plan documentation and the four model files. No package manifest, route, page or environment file may be changed.

- [ ] **Step 5: Push and create the pull request after user approval**

```powershell
git push -u origin feature/issue-8-report-data-models
```

The pull request targets `develop`, references all verification evidence, and ends with `Closes #8`.
