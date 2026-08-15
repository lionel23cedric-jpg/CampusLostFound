# Authentication Frontend Design

## Goal

Replace the generated `Hello world!` page with a polished, responsive authentication experience that lets campus users register, sign in, see their authenticated account summary and sign out through the existing secure backend.

The interface should make the Campus Lost and Found purpose immediately clear, demonstrate accessible frontend engineering, and provide a stable visual foundation for later report, claim and administration screens.

## Scope

This change adds:

- A public home page with a real product introduction and authentication calls to action.
- A registration page for display name, email, password and password confirmation.
- A login page for email and password.
- A protected starter dashboard showing safe current-user information and future workflow entry points.
- Shared responsive navigation with signed-in and signed-out states.
- Logout behaviour using the existing session endpoint.
- A typed browser API boundary, safe form error handling and automated UI tests.
- Updated application metadata and a cohesive responsive visual system.

This change consumes the existing authentication endpoints. It does not change password hashing, session storage, cookie policy, current-user resolution or authentication API response contracts.

## Chosen approach

Use focused React client components inside the existing Next.js App Router application. A small authentication session provider will call the same-origin `GET /api/auth/me` endpoint once, expose a loading/authenticated/unauthenticated state to navigation and protected pages, and accept the safe user returned by successful registration or login.

Thin page modules will compose reusable authentication components. A typed browser client will own fetch calls and public API-error normalisation. The existing server-side Zod contracts remain the authority for accepted credentials; browser validation improves feedback but never replaces server validation.

This approach was selected because it:

- Reuses the tested backend rather than duplicating session resolution in page code.
- Keeps the HttpOnly cookie inaccessible to React and browser storage.
- Prevents every component from implementing a different fetch and error format.
- Provides enough reuse for login, registration, navigation and dashboard without introducing a large state-management framework.

Rejected alternatives:

- Reading Mongoose models or session cookies directly in UI components would couple presentation to secure server internals.
- A Redux-style global store would add substantial machinery for one small session object.
- Independent `GET /api/auth/me` calls in every component would duplicate loading and error logic.
- A UI component framework would increase dependency and visual-template overhead when the required interface can be implemented with the existing React and Tailwind stack.

## Visual direction

The approved direction is **Campus Noticeboard**.

The interface uses:

- A warm off-white background suggesting paper and campus noticeboards.
- Deep campus green for primary actions, navigation and trust signals.
- Muted warm orange for small highlights and status accents.
- Editorial display typography for major marketing headings, paired with a highly legible system sans-serif for controls and body copy.
- Softly bordered notice cards and restrained shadows rather than generic dashboard glass effects.
- Realistic campus lost-and-found language so the purpose is obvious without explanation.

The style remains professional rather than playful. Decorative elements never compete with forms, and authentication controls retain conventional layouts and labels.

The two rejected visual directions were:

- **University Utility Portal:** dependable and clear, but too institutional and visually generic.
- **Split Welcome:** polished and contemporary, but more product-marketing oriented and less connected to a campus community noticeboard.

## Information architecture

### `/`

The public home page contains:

- A shared site header and `Campus Find` identity.
- A concise hero explaining the campus recovery problem.
- Primary `Create an account` and secondary `Sign in` actions.
- Three short workflow cards: report an item, receive possible matches and recover securely.
- A privacy callout explaining that ownership-verification details are not publicly exposed.
- A small preview of future lost-and-found activity using clearly labelled illustrative content, not simulated live database records.
- A footer with the project purpose and navigation.

Report browsing is represented as a clearly marked upcoming workflow until a real report-list endpoint and page exist. The page will not contain a dead link or imply that example notices are live records.

### `/login`

The login page contains:

- Email and password fields.
- A password visibility control.
- A submit button with pending state.
- A link to registration for users without an account.
- A return-home link.

Successful login updates the shared session state and navigates to `/dashboard`. An already authenticated user who opens `/login` is redirected to `/dashboard` after session resolution.

### `/register`

The registration page contains:

- Display name, email, password and password-confirmation fields.
- Short password guidance matching the existing 10-128 character server contract.
- A password visibility control.
- A submit button with pending state.
- A link to login for existing users.
- A return-home link.

Password confirmation is a frontend-only field and is never sent to the API. Password values are not trimmed because the existing backend intentionally preserves password whitespace. Successful registration updates session state and navigates to `/dashboard`.

### `/dashboard`

The dashboard is a protected starter page. It contains:

- A personalised greeting using the safe profile display name.
- Account summary cards for email, role, account status and verification state.
- A last-login value when one exists, with a clear first-login fallback.
- Clearly labelled future workflow cards for reporting, searching and claim management.
- A logout action in shared navigation.

Until the report frontend exists, future workflow cards are informational rather than broken navigation links.

An unauthenticated visitor sees a stable loading state while the current session is resolved, then is redirected to `/login`. The redirect replaces history so the browser Back button does not immediately reopen the protected view.

## Component and module boundaries

The intended responsibilities are:

- `src/lib/auth/browser-client.ts`: typed same-origin register, login, current-user and logout calls plus safe public error parsing.
- `src/components/auth/auth-session-provider.tsx`: the single shared browser session state and refresh/update/logout operations.
- `src/components/auth/auth-navigation.tsx`: signed-in, signed-out and loading navigation states.
- `src/components/auth/password-field.tsx`: labelled password input and accessible show/hide control.
- `src/components/auth/form-message.tsx`: accessible field and form-level messages.
- Login and registration form components: form state, client validation, submission and navigation only.
- App Router page modules: metadata-friendly page composition and layout.

Names may be adjusted slightly during the implementation plan if a smaller file structure provides the same boundaries. Presentation components must not import Mongoose models, database connections, password utilities, token utilities or cookie internals.

## Authentication state flow

The root application layout mounts the session provider around the application shell.

On its first browser mount, the provider requests `GET /api/auth/me` with same-origin credentials:

- HTTP 200 stores the returned `PublicUser` and marks the session authenticated.
- HTTP 401 marks the session unauthenticated without showing an application error.
- Network or HTTP 500 failures produce an unavailable state that can be retried; they are not silently treated as a known logout.

Registration and login use their existing endpoints. The safe user returned by HTTP 201 or HTTP 200 is inserted into session state immediately, avoiding an unnecessary second current-user request.

Logout calls `POST /api/auth/logout`. After a successful or known server response, the provider refreshes or clears its user state as appropriate and navigates home. A network failure does not claim that logout succeeded; the user receives a generic retry message.

No raw session token is returned to, accepted by or stored in frontend code. Authentication relies only on the existing HttpOnly same-site cookie managed by Route Handlers.

## Browser API contract

The browser client consumes the existing response shapes:

```ts
type AuthSuccess = { user: PublicUser };

type PublicApiError = {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
  };
};
```

It verifies that a response is usable before returning it to a component. Unexpected bodies, non-JSON responses and network failures become a generic browser-safe error. Components do not render raw exception text or stack traces.

Requests use JSON content types where required and same-origin credentials. Only the server contract fields are sent:

- Registration sends `displayName`, `email` and `password`.
- Login sends `email` and `password`.
- Logout sends no credential body.

## Validation and error handling

Client validation provides fast feedback for:

- Required fields.
- Valid email shape.
- Display name length of 2-80 trimmed characters.
- Password length of 10-128 characters without trimming.
- Matching registration passwords.

Server validation remains authoritative. Field arrays returned by `VALIDATION_ERROR` are mapped to their matching controls. Known form-level errors are shown using their safe API messages:

- `EMAIL_ALREADY_REGISTERED`.
- `INVALID_CREDENTIALS`.
- `ACCOUNT_UNAVAILABLE`.
- `AUTHENTICATION_REQUIRED` where relevant.

Unknown status codes, malformed error bodies and internal failures display a generic message such as `We could not complete that request. Please try again.` Submitted passwords and internal error details are never included in visible diagnostics or console output.

During submission:

- The submit control is disabled.
- Its text communicates progress.
- Repeated submits are ignored.
- Safe text fields remain populated after failure.
- Password fields remain only in current component memory and are never persisted.

## Accessibility

The frontend targets WCAG 2.2 AA fundamentals:

- Every input has a persistent programmatic and visible label.
- Field instructions and errors use `aria-describedby`.
- Invalid fields use `aria-invalid`.
- Form-level errors use an appropriate live region or `role="alert"`.
- The first invalid field receives focus after client or mapped server validation.
- Password visibility buttons have state-aware accessible names and `aria-pressed`.
- All controls are keyboard reachable with visible focus styling.
- Heading levels, landmarks and link text reflect page structure.
- Colour is never the only indicator of state.
- Text and interactive controls meet AA contrast targets.
- Tap targets remain usable on small screens.
- Motion is restrained and disabled when `prefers-reduced-motion` requests it.

Forms use appropriate autocomplete values: `name`, `email`, `current-password` and `new-password`.

## Responsive behaviour

The interface is designed mobile first:

- On narrow screens, navigation collapses to a simple wrapped action row without requiring a JavaScript menu.
- Hero, notice previews and form panels become a single readable column.
- Forms remain full width with a controlled maximum width on larger screens.
- Dashboard cards move from one column to two or three columns as space allows.
- Content never depends on hover and does not create horizontal scrolling at 320 CSS pixels.

Desktop layouts may use asymmetric editorial spacing, but DOM order remains logical for screen readers and keyboard users.

## Security and privacy

- The frontend never reads, logs or stores the HttpOnly session cookie.
- Passwords are not placed in URLs, analytics, browser storage or error messages.
- User-controlled text is rendered through normal escaped React output; raw HTML injection APIs are not used.
- The interface consumes only the safe `PublicUser` contract and does not request password hashes or session records.
- Authentication API errors are treated as public contracts; unknown exceptions are hidden.
- Sign-in and registration forms use POST requests and never encode credentials in query parameters.
- Existing cookie `sameSite`, `secure`, lifetime and server-side revocation behaviour remain unchanged.
- `.env.local` is not read, modified or committed for this feature.

## Automated testing

Frontend interaction tests will use Vitest with a DOM test environment and React Testing Library development dependencies. Existing backend tests remain in their Node environment.

Tests cover:

- Browser-client success responses, known API errors, malformed responses and network failures.
- Session-provider loading, authenticated, unauthenticated and retryable failure states.
- Login client validation, exact request payload, pending state, success navigation and safe errors.
- Registration validation, password confirmation, exact request payload, pending state, success navigation and duplicate-email handling.
- Password visibility accessibility and autocomplete attributes.
- Protected dashboard loading and unauthenticated redirect behaviour.
- Safe rendering of `PublicUser` values without credential or session fields.
- Navigation changes between signed-out and signed-in states.
- Logout behaviour and failure feedback.
- Accessible labels, described errors, alert semantics and keyboard interaction.

All network calls are mocked. Automated tests do not read `.env.local`, connect to Atlas or create real users, profiles or sessions.

## Manual and final verification

Manual browser verification checks:

- Home, login, registration and dashboard layouts at mobile, tablet and desktop widths.
- Keyboard-only navigation and visible focus order.
- Reduced-motion behaviour.
- Loading, validation, API-error and authenticated views.
- No browser console errors or failed static-resource requests.

A live Atlas-backed registration/login/logout smoke test is optional and requires explicit user approval before it creates records. It is not performed by automated tests.

Final repository verification runs:

- `npm test`.
- `npm run lint`.
- `npm run build`.
- `npm audit`.
- `git diff --check` and a branch-scope review.
- An ignored-file check confirming `.env.local` remains ignored without reading its contents.

## Out of scope

- Password reset and account-recovery flows.
- Email verification implementation.
- Editing profiles, notification settings or campus preferences.
- Report creation, browsing, search, filtering or report details.
- Claim, ownership-review, handover and recovery workflows.
- Staff and administrator dashboards.
- Image upload or external media storage.
- Notifications and AI-assisted matching.
- Backend authentication contract or database-model changes.
- Production deployment.
