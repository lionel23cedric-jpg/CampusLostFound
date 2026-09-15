# Contextual Photography Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all five repetitive still-life illustrations with distinct, natural campus documentary photographs while preserving the existing page component and layout.

**Architecture:** Generate each 3:2 scene independently with the built-in image-generation tool, inspect it before acceptance, and use the already-installed Sharp dependency to create metadata-stripped 960 by 640 WebP assets. Replace the five existing binary files with newly named assets and update only the five-entry `ContextIllustration` source map so browser image caches cannot retain the previous photographs; business behaviour remains unchanged.

**Tech Stack:** Built-in image generation, Sharp 0.35.4, Next.js 16.3.5 `Image`, CSS Modules, Vitest, ESLint, TypeScript.

## Global Constraints

- Work only in `D:\Massey\CampusLostFound-project-quality-polish`.
- Generate five independent natural editorial campus photographs.
- Use a 3:2 landscape composition with the important action near the centre.
- Do not include university logos, brand marks, readable screens, readable forms, personal data, slogans, captions, or watermarks.
- Keep the `ContextIllustration` markup, page copy, workflows, and layout unchanged; update only its five source paths.
- Final assets must be 960 by 640 WebP at quality 84.
- Record the final prompts and disclose AI-generated visual assets.

---

### Task 1: Generate five distinct campus photographs

**Files:**
- Generate: one source image for each of `auth`, `reports`, `claims`, `notifications`, and `administration`
- Stage: `web/.imagegen-staging/auth.png`
- Stage: `web/.imagegen-staging/reports.png`
- Stage: `web/.imagegen-staging/claims.png`
- Stage: `web/.imagegen-staging/notifications.png`
- Stage: `web/.imagegen-staging/administration.png`
- Inspect: `web/public/illustrations/*.webp`

**Interfaces:**
- Consumes: the five approved scene briefs.
- Produces: five selected project-bound PNG source images under `web/.imagegen-staging`.

- [ ] **Step 1: Generate the authentication photograph**

```text
Use case: photorealistic-natural
Asset type: responsive website authentication banner
Primary request: candid documentary photograph of a university student arriving at a welcoming campus lost-property service point while other students cross a sunlit courtyard in the background
Scene/backdrop: believable contemporary university courtyard and service entrance, leafy New Zealand campus atmosphere without identifiable branding
Subject: one student approaching the service point with natural posture and everyday belongings; background students provide life without posing
Style/medium: photorealistic natural editorial photography with real skin, fabric, timber, and stone texture
Composition/framing: 3:2 landscape, eye-level medium-wide frame, primary action centred and safe for a shallow banner crop
Lighting/mood: clear soft daylight, welcoming and practical, richer foliage green, brick red, sky blue, and warm neutral colour
Constraints: no university logo, no readable ID, no readable sign, no readable screen, no personal data, no text, no watermark
Avoid: staged stock-photo smiles, tabletop still life, illustration, excessive blur, dramatic cinema grading
```

- [ ] **Step 2: Generate the report photograph**

```text
Use case: photorealistic-natural
Asset type: responsive website report workflow banner
Primary request: candid documentary photograph of a student near a campus library entrance photographing recently found everyday items before submitting a lost-and-found report
Scene/backdrop: active library forecourt with campus bench, trees, brick and glass architecture, a few distant students
Subject: student crouching naturally and using a phone whose screen faces away; found umbrella, headphones, and reusable bottle arranged where discovered
Style/medium: photorealistic natural editorial photography with believable hands, clothing, weathered bench, and object texture
Composition/framing: 3:2 landscape, medium-wide environmental frame, student and objects near the centre with safe banner crop
Lighting/mood: bright overcast daylight with fresh blue, yellow, green, and terracotta accents
Constraints: no university logo, no readable phone display, no readable sign, no personal data, no text, no watermark
Avoid: theft implication, staged product layout, tabletop still life, illustration, excessive blur
```

- [ ] **Step 3: Generate the Claim photograph**

```text
Use case: photorealistic-natural
Asset type: responsive website ownership Claim banner
Primary request: candid documentary photograph of a campus staff member carefully returning a recovered backpack to a relieved student after verification at a lost-property service counter
Scene/backdrop: bright practical campus service room with organised shelves softly visible behind the counter
Subject: natural two-person handover, staff member and student both holding the backpack briefly, calm professional expressions
Style/medium: photorealistic editorial photography with realistic hands, fabric wear, timber grain, and natural skin texture
Composition/framing: 3:2 landscape, waist-up medium frame, handover centred and safe for a shallow banner crop
Lighting/mood: warm daylight balanced with blue and rust clothing accents, reassuring and privacy-aware
Constraints: no university logo, no readable ID badge, no readable form, no personal data, no text, no watermark
Avoid: ceremonial posing, gift-box appearance, handshake cliché, illustration, excessive blur
```

- [ ] **Step 4: Generate the notification photograph**

```text
Use case: photorealistic-natural
Asset type: responsive website notification centre banner
Primary request: candid documentary photograph of a university student walking through a lively campus courtyard and checking a possible-match notification on a phone with a quiet expression of relief
Scene/backdrop: active leafy courtyard with bicycles, brick campus buildings, blue sky, and other students moving naturally in the background
Subject: one student holding a phone at a natural angle with the display unreadable, everyday bag visible, no posed gaze toward camera
Style/medium: photorealistic natural editorial photography with realistic skin, hair, fabric, paving, and foliage texture
Composition/framing: 3:2 landscape, medium environmental portrait, student centred with safe banner crop and meaningful background depth
Lighting/mood: lively late-morning daylight, richer blue, green, amber, and terracotta colour
Constraints: no university logo, no readable phone screen, no readable signage, no personal data, no text, no watermark
Avoid: exaggerated celebration, stock-photo pose, tabletop still life, illustration, excessive blur
```

- [ ] **Step 5: Generate the administration photograph**

```text
Use case: photorealistic-natural
Asset type: responsive website administrator workspace banner
Primary request: candid documentary photograph of two campus staff members reviewing lost-property operations together in a bright service office
Scene/backdrop: organised campus office with unlabelled storage trays, a few recovered everyday objects, and an abstract dashboard viewed obliquely so no data is readable
Subject: two staff members collaborating naturally, pointing toward grouped storage and an angled monitor without posing for camera
Style/medium: photorealistic editorial workplace photography with real skin, fabric, paper, storage, and screen reflection texture
Composition/framing: 3:2 landscape, medium-wide frame, people and operational context centred and safe for a shallow banner crop
Lighting/mood: professional daylight with forest green, navy, warm wood, and restrained orange accents
Constraints: no university logo, no readable dashboard data, no readable labels, no personal data, no text, no watermark
Avoid: generic corporate handshake, staged stock-photo pose, oversized charts, tabletop still life, illustration, excessive blur
```

- [ ] **Step 6: Inspect every generated result**

Reject any result with malformed hands, extra fingers, implausible object interaction, accidental logos, readable or garbled text, exposed personal details, unsafe edge composition, repeated still-life staging, or a visual style inconsistent with the other accepted photographs.

- [ ] **Step 7: Copy accepted outputs into fixed project staging paths**

Use each built-in image tool result's returned local output path as the source and copy the five accepted files to `web/.imagegen-staging/auth.png`, `reports.png`, `claims.png`, `notifications.png`, and `administration.png`. Do not leave a project-consumed asset only under the image tool's default output directory.

---

### Task 2: Convert and replace the five project assets

**Files:**
- Replace with: `web/public/illustrations/auth-campus-service.webp`
- Replace with: `web/public/illustrations/reports-found-item.webp`
- Replace with: `web/public/illustrations/claims-item-handover.webp`
- Replace with: `web/public/illustrations/notifications-campus-match.webp`
- Replace with: `web/public/illustrations/administration-review.webp`
- Update: `web/src/components/context-illustration.tsx`
- Update: `web/src/components/context-illustration.test.tsx`

**Interfaces:**
- Consumes: five accepted source-image paths from Task 1.
- Produces: five newly named public URLs so existing browser and Next.js image caches cannot retain the old photographs.

- [ ] **Step 1: Convert each accepted source through Sharp**

Run from `web`:

```powershell
node -e "const sharp=require('sharp'); const files={auth:'auth-campus-service',reports:'reports-found-item',claims:'claims-item-handover',notifications:'notifications-campus-match',administration:'administration-review'}; Promise.all(Object.entries(files).map(([source,target])=>sharp('.imagegen-staging/'+source+'.png').resize(960,640,{fit:'cover',position:'attention'}).webp({quality:84,smartSubsample:true}).toFile('public/illustrations/'+target+'.webp'))).catch(error=>{console.error(error);process.exit(1)})"
```

- [ ] **Step 2: Validate format, dimensions, and size without changing metadata**

```powershell
node -e "const sharp=require('sharp'); Promise.all(process.argv.slice(1).map(async p=>({path:p,meta:await sharp(p).metadata()}))).then(v=>console.log(JSON.stringify(v,null,2)))" public/illustrations/auth-campus-service.webp public/illustrations/reports-found-item.webp public/illustrations/claims-item-handover.webp public/illustrations/notifications-campus-match.webp public/illustrations/administration-review.webp
```

Expected: every image reports `format: webp`, `width: 960`, `height: 640`; no EXIF, GPS, or XMP metadata is retained.

- [ ] **Step 3: Inspect all five final WebP files**

View each converted asset at original detail and confirm the centre crop retains the intended action, faces and hands are natural, no text artefact exists, and all five scenes are visually distinct.

- [ ] **Step 4: Update the five-entry source map and its test**

Point each context at its descriptive new filename, leaving the component markup and presentation unchanged. Remove the five superseded binary files.

- [ ] **Step 5: Commit the asset replacement and cache-safe mapping**

```powershell
git add -A web/public/illustrations web/src/components/context-illustration.tsx web/src/components/context-illustration.test.tsx
git commit -m "style(ui): refresh contextual campus photography"
```

---

### Task 3: Record provenance and verify the application

**Files:**
- Create: `docs/ai-generated-visual-assets.md`
- Test: `web/src/components/context-illustration.test.tsx`

**Interfaces:**
- Consumes: the final five assets and exact prompts from Task 1.
- Produces: transparent course-project disclosure and verification evidence.

- [ ] **Step 1: Record image provenance**

Create `docs/ai-generated-visual-assets.md` with the generation date, built-in AI image tool disclosure, five final file paths, the five prompt specifications from Task 1, Sharp conversion settings, privacy restrictions, and a statement that no real personal data or university trademarks were supplied.

- [ ] **Step 2: Run component and full project checks**

```powershell
cd web
npx vitest run src/components/context-illustration.test.tsx
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
npm audit --audit-level=low
```

Expected: all checks pass and audit reports zero vulnerabilities.

- [ ] **Step 3: Inspect representative pages**

Inspect `/register` plus authenticated report, Claim, notification, and administrator pages at desktop width. Confirm useful crops, readable foreground content, no layout shift, no text overlap, no sensitive information, and no console image errors. Record mobile-only checks that still require the user's responsive browser mode.

- [ ] **Step 4: Commit the disclosure**

```powershell
git add docs/ai-generated-visual-assets.md
git commit -m "docs: record generated visual asset provenance"
```
