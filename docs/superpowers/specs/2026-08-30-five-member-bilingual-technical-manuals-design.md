# Five-Member Bilingual Technical Manuals Design

## Purpose

Create five independent bilingual Word technical manuals for the CampusLostFound project. Each manual documents one non-AI vertical workstream so that a five-person team can understand, implement, test, explain, and demonstrate its assigned responsibilities without overstating contribution.

## Deliverables

The final deliverables are five `.docx` files stored outside the source repository in `Team_Division_Bilingual_Documents/final`:

1. `01_成员1_身份认证_Profile与账号安全_中英双译版.docx`
2. `02_成员2_报告搜索_图片与隐私_中英双译版.docx`
3. `03_成员3_Claim与通知系统_中英双译版.docx`
4. `04_成员4_Staff审核与找回流程_中英双译版.docx`
5. `05_成员5_管理员统计_参考数据与举报审核_中英双译版.docx`

## Content Source of Truth

- Source repository: `D:/Massey/CampusLostFound`
- Source branch: `develop`
- Verified merge commit: `e0aaa8b`
- Documentation must describe implemented code only.
- No Git authorship or individual contribution is to be fabricated.
- The explainable matching algorithm remains a shared course feature and is outside the five primary workstreams.

## Workstream Boundaries

### Member 1 - Identity, Profile, Account Security

Authentication, registration, logout, revocable sessions, cookie security, role and status access, profile preferences, and administrator account-status management.

### Member 2 - Reports, Search, Images, Privacy

Report creation, browsing, detail, owner history, filters, privacy-safe projections, uploaded-image validation, storage, read access, and preview behavior. Matching score computation is excluded.

### Member 3 - Claims and Notifications

Member claim submission, verification answers, owned-claim history, withdrawal, notification delivery, unread state, pagination, and mark-as-read. Staff claim decisions are excluded.

### Member 4 - Staff Review and Recovery

Staff report verification, custody and storage, staff claim queue, approval, rejection, handover readiness, completion, and report/claim recovery-state transitions.

### Member 5 - Administrator Overview, Reference Data, Moderation

Administrator statistics, categories, campus locations, report flags, moderation decisions, visibility control, audit events, and optimistic concurrency. Account-status management remains with Member 1.

## Document Structure

Each manual uses the same structure:

1. Cover and document metadata
2. Scope and responsibility boundary
3. Course-requirement mapping
4. User roles and scenarios
5. Feature walkthroughs
6. Architecture and data flow
7. Repository map
8. Data models and constraints
9. API contracts and error states
10. Frontend components and UI states
11. Backend services and access control
12. Selected code explanations with file and line references
13. Security, privacy, accessibility, and reliability
14. Automated test explanation
15. Integration contracts with other workstreams
16. Git workflow and review checklist
17. Demonstration script in Chinese and English
18. Honest contribution-evidence checklist
19. Limitations and future work

## Bilingual Format

- Chinese explanation appears first, immediately followed by its English translation.
- Code identifiers and source paths remain in English.
- Tables use bilingual column headings where space permits.
- Figure captions use `图 N / Figure N`.
- The English text is a faithful translation, not a shortened summary.

## Visual System

- Document archetype: technical reference handbook.
- Design preset: `compact_reference_guide`.
- First-page pattern: `editorial_cover` with restrained campus-green accents.
- Page geometry: US Letter portrait, 1-inch margins, 6.5-inch content width.
- Base typography: Calibri 11 pt with explicit Chinese font fallback.
- Code: Consolas 8.5-9 pt in light neutral blocks.
- Tables: fixed DXA geometry, blue-gray headers, repeated header rows.
- Running header: project name and member workstream.
- Footer: bilingual document label and page number.

## Visual Evidence

Each manual contains at least six useful visuals selected from:

- workstream architecture diagram;
- user workflow diagram;
- request-to-database data-flow diagram;
- model or state-transition diagram;
- repository ownership map;
- annotated UI representation based on implemented pages;
- formatted code excerpt with highlighted callouts;
- test pyramid or verification map.

Visuals must explain relationships, not decorate the page. Actual UI screenshots are used when a stable local view is available; otherwise the document uses clearly labelled diagrams derived from the implemented routes and components.

## Code Explanation Standard

Every selected excerpt states:

- exact source path and verified line range;
- purpose and caller;
- inputs, validation, branch behavior, and output;
- database or browser-side effects;
- security and privacy implications;
- corresponding test file;
- why the implementation fits the course scope.

No full source file is copied into a manual. Excerpts are short enough to teach the design without turning the manual into a code dump.

## Quality Gates

- No `TBD`, `TODO`, invented endpoint, invented model field, or invented screenshot.
- All five files open successfully and contain the expected headings and images.
- Every DOCX is rendered to page PNGs.
- Every rendered page is visually inspected for clipping, overlap, broken tables, unreadable code, and missing glyphs.
- Accessibility audit checks heading structure, table headers, and image alternative text.
- Final output folder contains only the five requested DOCX deliverables.

