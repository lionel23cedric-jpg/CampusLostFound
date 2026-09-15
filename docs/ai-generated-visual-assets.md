# AI-Generated Visual Assets

The five contextual photographs in `web/public/illustrations` were generated with OpenAI's built-in image-generation tool on 15 September 2026. They are decorative interface assets only and do not represent real Massey University people, property, events, or facilities.

## Processing

- Generation mode: `photorealistic-natural`
- Final format: WebP
- Final dimensions: 960 by 640 pixels
- WebP quality: 84
- Metadata: EXIF, ICC, and XMP removed during conversion with Sharp
- Privacy controls: no readable names, IDs, forms, screens, personal data, or university branding

## Authentication (`auth-campus-service.webp`)

> Candid documentary photograph of a university student arriving at a welcoming campus lost-property service point while other students cross a sunlit courtyard in the background. Believable contemporary university courtyard and service entrance, leafy New Zealand campus atmosphere without identifiable branding. Photorealistic natural editorial photography, 3:2 landscape, clear soft daylight, centred action safe for banner cropping. No university logo, readable ID, sign, screen, personal data, text, or watermark.

## Reports (`reports-found-item.webp`)

> Candid documentary photograph of a student near a campus library entrance photographing recently found everyday items before submitting a lost-and-found report. Active library forecourt with a campus bench, trees, brick and glass architecture, and distant students. The phone display faces away; a found umbrella, headphones, and reusable bottle remain visible. Photorealistic natural editorial photography, 3:2 landscape, bright daylight. No university logo, readable display, sign, personal data, text, or watermark.

## Claims (`claims-item-handover.webp`)

> Candid documentary photograph of a campus staff member carefully returning a recovered backpack to a relieved student after verification at a lost-property service counter. Bright practical service room with organised shelves; natural two-person handover with realistic hands and materials. Photorealistic editorial photography, 3:2 landscape, warm daylight. No university logo, readable ID badge, form, personal data, text, or watermark.

## Notifications (`notifications-campus-match.webp`)

> Candid documentary photograph of a university student walking through a lively campus courtyard and checking a possible-match notification on a phone. Leafy courtyard with bicycles, brick campus buildings, blue sky, and students moving naturally in the background. Photorealistic natural editorial photography, 3:2 landscape, lively daylight. No university logo, readable phone screen, signage, personal data, text, or watermark.

## Administration (`administration-review.webp`)

> Candid documentary photograph of two campus staff members reviewing lost-property operations in a bright service office. Organised unlabelled storage, recovered everyday objects, and an angled abstract dashboard with no readable data. Photorealistic editorial workplace photography, 3:2 landscape, professional daylight. No university logo, readable dashboard data, labels, personal data, text, or watermark.

## Use in the Application

The existing `ContextIllustration` component selects these assets by page context. New descriptive filenames prevent browsers and the Next.js image optimizer from reusing the previous photographs after deployment. This does not change authentication, reporting, claims, notifications, administrator workflows, routing, or database behaviour.

## Pre-existing Home Hero

`web/public/campus-find-hero.webp` is a metadata-free WebP conversion of the pre-existing `campus-find-hero.png` project asset. It is not included among the five OpenAI-generated contextual photographs documented above. The repository did not contain a verifiable record of the original image's creator or licence, so the team must confirm its provenance before publishing the application outside the course demonstration. On 15 September 2026, the image was converted with the project's existing Sharp dependency at 1536 by 1024 pixels and WebP quality 84; its composition was not replaced or regenerated.
