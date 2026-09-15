# Contextual Photography Refresh Design

## Goal

Replace all five repetitive still-life illustrations with distinct, natural campus documentary photographs that make Campus Find feel more human and visually varied without distracting from its workflows.

## Shared visual direction

- Use natural editorial photography with believable students, staff, campus paths, library areas, and service counters.
- Use a richer but coherent palette of foliage green, brick red, sky blue, warm timber, and soft daylight.
- Compose every image as a 3:2 landscape with the important action near the centre so the existing banner crop remains safe.
- Do not include university logos, brand marks, readable device screens, readable forms, personal information, slogans, captions, or watermarks.
- Avoid staged stock-photo poses, exaggerated emotions, dramatic cinematic grading, artificial depth of field, and repeated tabletop arrangements.
- Represent a diverse campus community naturally and respectfully.

## Five replacement scenes

### Authentication

A student arrives at a welcoming campus lost-property service point while other students cross a sunlit campus courtyard in the background. An ID lanyard and everyday belongings can establish context, but no identifying details or readable text may appear.

### Reports

A student crouches near a library entrance or campus bench to photograph a recently found umbrella, headphones, and reusable bottle with a phone. The screen faces away from the camera. The scene communicates observing and reporting rather than taking possession.

### Claims

A campus staff member verifies a recovery at a service counter and returns a small backpack or boxed personal item to a relieved student. The exchange should look careful, professional, and privacy-aware rather than ceremonial.

### Notifications

A student walking through a lively campus courtyard checks a phone and reacts with quiet relief after receiving a possible-match notification. The phone screen must be unreadable, and other students and campus activity provide depth and energy.

### Administration

Two campus staff members review lost-property operations together in a bright office or service room with organised unlabelled storage trays and an abstract dashboard visible at an angle. The image should communicate oversight, organisation, and teamwork without exposing data.

## Output and integration

- Generate each scene independently with the built-in image-generation tool.
- Inspect every result for subject accuracy, natural anatomy, privacy, text artefacts, composition, and visual distinction.
- Convert approved images with the repository's existing Sharp dependency to 960 by 640 WebP at quality 84.
- Retire `auth.webp`, `reports.webp`, `claims.webp`, `notifications.webp`, and `administration.webp`, replacing them with five newly named photographs in `web/public/illustrations`.
- Keep the existing `ContextIllustration` component structure unchanged and update only its five-entry source mapping. New filenames prevent browsers and the Next.js image optimizer from serving the previous images from cache.
- Record the final prompts and disclose that the five visual assets were generated with an AI image tool.

## Verification

- Confirm all five files decode as 960 by 640 WebP images and have reasonable file sizes.
- Run `context-illustration.test.tsx`, ESLint, TypeScript, the complete test suite, production build, and dependency audit.
- Inspect representative authentication, report, Claim, notification, and administrator pages at desktop width, checking crop safety, contrast, loading, and absence of text overlap.
- Record any mobile inspection that still requires the user's browser responsive mode.
