# Five-Member Bilingual Technical Manuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use the documents skill to implement this plan. Every DOCX must pass render-and-inspect verification before delivery.

**Goal:** Produce five detailed, visually verified, bilingual Word technical manuals that document the five non-AI CampusLostFound workstreams using the implemented `develop` code as evidence.

**Architecture:** A single reproducible Python document builder consumes verified module metadata, source excerpts, and generated diagrams. Shared style and document helpers enforce one layout system, while each member definition supplies its own routes, models, services, components, tests, workflows, and demonstration script.

**Tech Stack:** Python, python-docx, Pillow/Matplotlib where available, bundled LibreOffice renderer, PNG diagrams, TypeScript source evidence, Git.

## Global Constraints

- Source evidence is read from `D:/Massey/CampusLostFound` at merge commit `e0aaa8b`.
- Output is exactly five `.docx` files.
- Content is Chinese-English bilingual with Chinese first and faithful English immediately after.
- AI matching is outside the five primary scopes.
- No dependency, production code, database schema, or runtime configuration is changed.
- No individual Git contribution is fabricated.
- Every final document is rendered and every page visually inspected.

---

### Task 1: Establish Source Inventory and Line-Referenced Evidence

**Files:**
- Create: `Team_Division_Bilingual_Documents/work/source_inventory.json`
- Create: `Team_Division_Bilingual_Documents/work/excerpts.json`

**Interfaces:**
- Consumes: tracked files under `D:/Massey/CampusLostFound/web/src`
- Produces: module file lists, route lists, model fields, test lists, and bounded code excerpts for the document builder

- [ ] Record the exact source commit and repository status.
- [ ] Enumerate the five workstream paths without overlaps.
- [ ] Extract representative implementations and tests with verified one-based line numbers.
- [ ] Validate that every recorded file exists and every line range is in bounds.

### Task 2: Build Shared Visual Assets

**Files:**
- Create: `Team_Division_Bilingual_Documents/work/assets/member1/*.png`
- Create: `Team_Division_Bilingual_Documents/work/assets/member2/*.png`
- Create: `Team_Division_Bilingual_Documents/work/assets/member3/*.png`
- Create: `Team_Division_Bilingual_Documents/work/assets/member4/*.png`
- Create: `Team_Division_Bilingual_Documents/work/assets/member5/*.png`

**Interfaces:**
- Consumes: source inventory and workstream definitions
- Produces: architecture, workflow, data-flow, repository-map, state, and test visuals at document-safe dimensions

- [ ] Generate at least six instructional visuals for each workstream.
- [ ] Use consistent colors, fonts, arrow styles, figure sizes, and bilingual labels.
- [ ] Open every PNG and verify that labels are legible and not clipped.

### Task 3: Implement the Reproducible DOCX Builder

**Files:**
- Create: `Team_Division_Bilingual_Documents/work/build_manuals.py`

**Interfaces:**
- Consumes: source inventory, excerpts, visual assets, and five member definitions
- Produces: five DOCX files using one style system

- [ ] Configure the `compact_reference_guide` preset with exact page, typography, list, table, header, footer, and color tokens.
- [ ] Implement real Word headings, numbering, tables, code blocks, captions, page breaks, headers, and page-number fields.
- [ ] Implement bilingual prose helpers that keep Chinese and English pairs together where practical.
- [ ] Add image alternative text and repeating table headers.
- [ ] Add each manual's content and selected code explanations.
- [ ] Save the five documents to the final output directory.

### Task 4: Structural and Content Validation

**Files:**
- Create: `Team_Division_Bilingual_Documents/work/validation_report.json`

**Interfaces:**
- Consumes: five generated DOCX files
- Produces: machine-readable validation results

- [ ] Confirm exactly five DOCX files exist and are non-empty.
- [ ] Confirm required headings, bilingual markers, figures, tables, and code-source references appear in each file.
- [ ] Scan for `TBD`, `TODO`, placeholder member names presented as real people, and internal tool tokens.
- [ ] Run the document accessibility audit and apply safe fixes for table headers and image alt text when required.

### Task 5: Render and Visually Inspect Every Page

**Files:**
- Create: `Team_Division_Bilingual_Documents/work/rendered/member1/page-*.png`
- Create: `Team_Division_Bilingual_Documents/work/rendered/member2/page-*.png`
- Create: `Team_Division_Bilingual_Documents/work/rendered/member3/page-*.png`
- Create: `Team_Division_Bilingual_Documents/work/rendered/member4/page-*.png`
- Create: `Team_Division_Bilingual_Documents/work/rendered/member5/page-*.png`

**Interfaces:**
- Consumes: five structurally validated DOCX files
- Produces: rendered page images and a completed visual QA record

- [ ] Render each document using the packaged `render_docx.py` tool.
- [ ] Inspect every page at full resolution for clipping, overlap, broken tables, missing glyphs, and poor page breaks.
- [ ] Correct the builder for any repeated defect and regenerate all affected documents.
- [ ] Re-render corrected documents and record the final page count and inspection result.

### Task 6: Deliver Clean Final Documents

**Files:**
- Final: `Team_Division_Bilingual_Documents/final/01_成员1_身份认证_Profile与账号安全_中英双译版.docx`
- Final: `Team_Division_Bilingual_Documents/final/02_成员2_报告搜索_图片与隐私_中英双译版.docx`
- Final: `Team_Division_Bilingual_Documents/final/03_成员3_Claim与通知系统_中英双译版.docx`
- Final: `Team_Division_Bilingual_Documents/final/04_成员4_Staff审核与找回流程_中英双译版.docx`
- Final: `Team_Division_Bilingual_Documents/final/05_成员5_管理员统计_参考数据与举报审核_中英双译版.docx`

**Interfaces:**
- Consumes: final visually approved documents
- Produces: user-facing deliverables only

- [ ] Remove temporary render and work artifacts from the final directory.
- [ ] Verify filenames, file sizes, and modified timestamps.
- [ ] Present each final DOCX once with an output citation.

