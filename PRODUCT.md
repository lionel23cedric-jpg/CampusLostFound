# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Students report lost or found items, browse possible matches, manage their own reports, and follow recovery progress.
- Campus staff verify reports, manage storage and handover activity, and communicate with claimants.
- Administrators oversee users, categories, reports, claims, flagged content, and system data.

## Product Purpose

Campus Noticeboard gives the Massey campus community one reliable place to report, discover, and recover lost property. Success means users can find plausible matches quickly while ownership evidence and sensitive contact or location details remain protected.

## Positioning

The product combines campus-specific report data with privacy-aware public views and separate private verification evidence, so discovery can be open to authenticated members without exposing the answers used to prove ownership.

## Operating Context

- Users may submit or search from a phone while moving around campus, or from a desktop while reviewing several reports.
- Reports use structured categories, campus locations, dates, colours, descriptions, photos, visibility settings, and recovery statuses.
- Account roles are student, staff, and administrator. Authentication uses revocable cookie sessions.

## Capabilities and Constraints

- Existing stack: Next.js App Router, TypeScript, React, MongoDB Atlas through Mongoose, Zod, CSS Modules, Vitest, and ESLint.
- Current delivered capabilities include authentication, report submission, privacy-safe report browsing APIs, database health checks, and responsive authenticated navigation.
- Public/member report responses must never expose passwords, session tokens, reporter identifiers, private verification details, serial numbers, exact private locations, or other restricted evidence.
- Real credentials remain only in ignored local environment files and must never be committed.
- Issue #20 adds report browsing and search frontend surfaces against the existing APIs; it does not change database models or create new backend contracts.
- Matching/claim management, notifications, administration, and the required AI-enhanced feature remain future work.

## Brand Commitments

- Product name: Campus Noticeboard.
- Preserve the existing calm, practical campus interface and its established design tokens, components, and plain-English voice.
- Avoid invented institutional claims, recovery statistics, testimonials, or endorsements.

## Evidence on Hand

- The repository contains implemented authentication, submission, and browsing API contracts with automated tests.
- The supplied course project brief defines the required users, core workflows, database/privacy obligations, quality expectations, and the requirement for at least one clearly explained AI-related feature.
- No approved production photography, testimonials, performance benchmarks, or completed AI feature are currently available and none should be fabricated.

## Product Principles

- Protect ownership evidence while making legitimate discovery easy.
- Make the next useful action obvious on both mobile and desktop.
- Prefer clear, testable workflows over speculative complexity.
- Treat empty, unavailable, unauthorized, and privacy-hidden states as first-class product states.
- Keep implementation evidence, tests, and documentation aligned with the assessed requirements.

## Accessibility & Inclusion

Target WCAG 2.2 AA: semantic structure, keyboard operation, visible focus, correctly associated labels and errors, sufficient contrast, minimum 44-pixel touch targets, reduced-motion support, and layouts that remain usable at 320 CSS pixels.
