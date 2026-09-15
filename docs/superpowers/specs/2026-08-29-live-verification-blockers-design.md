# Live Verification Blockers Design

## Context

Manual verification stopped after the owner-history step because the administrator header became unreadable, a stored report image rendered as a broken image, and the matching action was not discoverable from the owner-history list.

## Scope

This is a focused course-project refinement. It adds no dependencies, database collections, routes, roles, or automatic AI behaviour.

## Design

### Administrator navigation

Keep every authorised destination visible. Allow the navigation row to wrap when its real content no longer fits, prevent individual link labels from shrinking or breaking, and hide the non-essential display name at crowded widths. The header may grow to a second row instead of overlapping text.

### Protected report images

Keep the existing upload format and protected image route. Normalise both Node `Buffer` values and MongoDB BSON `Binary` values before validating the stored byte length. Invalid or missing binary values continue to fail closed as not found.

### Intelligent matching entry point

Keep matching manually activated on the owner-only report detail page. Add an explicit owner-history card link: open reports use `View report and find matches`; other statuses use `View report details`. No matching API request is made from the history page.

## Verification

- Component tests cover administrator navigation wrapping and the owner-history action copy and destination.
- Service tests cover BSON `Binary` image bytes and malformed stored data.
- Existing image route and matching-panel tests must remain green.
- Run lint, TypeScript without emit, production build, dependency audit, and the design detector on changed UI files.

