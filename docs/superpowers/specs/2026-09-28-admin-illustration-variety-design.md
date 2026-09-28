# Administrator Illustration Variety Design

## Goal

Replace the single repeated administrator banner with four distinct images so
each administrator workspace is easier to recognise while preserving Campus
Find's calm, practical campus identity.

## Image set

All four assets use realistic editorial campus photography, natural daylight,
warm neutral colours, a landscape 3:2 composition, and enough visual breathing
room for the existing wide banner crop. Images contain no readable interface
text, institutional logos, watermarks, futuristic control rooms, or sensitive
personal information.

| Administrator workspace | Asset | Scene |
| --- | --- | --- |
| Operations overview | `admin-operations-overview.png` | A composed campus lost-property operations desk with organised trays, a laptop, a notebook, and a small selection of everyday recovered items. |
| Accounts and staff | `admin-accounts-staff.png` | Two campus administrators reviewing an access roster together at a desk, with staff badges and office materials visible but no readable data. |
| Reference data | `admin-reference-data.png` | A structured work surface with a campus map, location markers, category cards, labels, and organised stationery. |
| Report moderation | `admin-report-moderation.png` | An administrator comparing report photographs and records on a monitor beside tagged lost-property items, without readable personal content. |

## Implementation

- Extend `ContextIllustration` with four explicit administrator illustration
  kinds while retaining the existing shared component and responsive sizing.
- Update only the four administrator call sites to use their corresponding
  asset.
- Keep the existing page structure, copy, routes, permissions, statistics,
  controls, and behaviour unchanged.
- Save the generated project assets in `web/public/illustrations/` and reference
  them through Next.js `Image` as before.

## Verification

- Confirm all four pages resolve different local image paths.
- Verify each image loads and crops cleanly at desktop and phone widths.
- Run the affected component tests, lint, TypeScript check, production build,
  and the Impeccable detector once after the UI changes are complete.

