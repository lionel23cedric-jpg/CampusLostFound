# Illustrated public homepage redesign

## Goal and scope

Replace the current generic split hero and repeated card grid at `/` with a distinctive Campus Find notice-wall homepage. The approved direction is the original warm paper-and-clay noticeboard composition, strengthened with a cohesive set of illustrated everyday objects. Only the public homepage changes. Student, Staff, and Administrator homepages, account flows, APIs, data models, and AI features remain unchanged.

## Visual design

- Use a warm paper canvas, deep campus green ink, and a restrained clay-orange accent consistent with the existing brand.
- Lead with an oversized editorial headline, `Lost. Found. Back together.`, not a conventional split hero.
- Place a single tall clay poster on the right with a large backpack illustration and a smaller pinned note with keys. These are illustrative objects, not sample reports or live data.
- Draw all objects as native inline SVG with the same rounded stroke weight, limited palette, and no photographic or generated-image dependencies. A small set of matching bottle, headphones, and keys illustrations supports the recovery explanation below.
- Keep the layout intentionally asymmetric on desktop but orderly in reading order on mobile. Do not overlap text with illustrations, and do not rely on visual position to convey meaning.
- Use numbered, paper-like action strips instead of three equal rounded cards. Avoid invented counts, fake notices, testimonial claims, or decorative controls that look clickable.

## Page content and interactions

The homepage offers three prominent real links:

1. `Report a lost item` → `/reports/new`.
2. `Report a found item` → `/reports/new`.
3. `Browse reports` → `/reports`.

The two report actions deliberately use the existing form route; this redesign does not add unsupported URL parameters or change form defaults. Existing authentication handling for protected routes remains authoritative.

A lower `How things find their way home` section explains report, possible match, and verified recovery in three connected steps. The step links lead respectively to `/reports/new`, `/reports`, and `/claims`; they must not promise automatic recovery or a guaranteed AI match. A contrasting privacy band states that exact locations and ownership evidence do not belong in public report details. The existing site header and global navigation remain untouched.

## Code boundaries

- `web/src/app/page.tsx` owns semantic section structure, page copy, and links.
- `web/src/app/page.module.css` owns responsive composition, spacing, colour application, and visual treatment. Prefer existing CSS variables.
- `web/src/components/home/home-object-illustration.tsx` contains the presentation-only inline SVG variants (backpack, keys, bottle, and headphones). It does not fetch data or handle business state.
- No new package, API route, database call, client-side state, or image service is needed.

## Accessibility and responsiveness

- Preserve one `main#main-content`, one clear `h1`, semantic sections, and visible keyboard focus on every link.
- Decorative SVGs are hidden from assistive technology; nearby text communicates every action and process step.
- Make link hit areas at least 44 CSS pixels high and maintain readable colour contrast.
- At narrow widths down to 320 CSS pixels, stack the poster, note, and action strips without horizontal scrolling or text/image collisions.
- Respect the existing reduced-motion preference; no motion is required to understand or use the page.

## Verification

- Update the homepage test to assert the new heading, all three real routes, one main landmark, privacy message, and illustrative—not live—content.
- Run the relevant homepage test, TypeScript check, ESLint, and production build according to the repository scripts.
- Inspect desktop and mobile rendering, including keyboard focus and image/text separation.
- Leave the unrelated existing changes in `web/next.config.ts`, `web/next-config.test.ts`, and `web/package-lock.json` untouched.

## Out of scope

No role-specific dashboard redesign, new live feed, item-reporting logic change, image upload change, AI matching change, or backend mutation is part of this homepage task.
