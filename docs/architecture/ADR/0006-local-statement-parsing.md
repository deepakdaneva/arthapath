# ADR-0006: Local statement parsing, AI assist on consent

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

Users import CSV and PDF bank statements. Cloud Storage is unavailable on
Spark. Many Indian bank PDFs are password-protected and layouts vary.

## Decision

Files are parsed in memory: CSV locally with column-mapping heuristics, PDF
with pdf.js (supports passwords). Heuristics extract rows first. If they
fail, the user can opt in, per import, to send the extracted text (never
the file) to their selected AI provider for structuring. All rows go
through a review screen with duplicate detection before the encrypted save.

## Consequences

pdf.js is lazy-loaded only on the import screen. AI structuring sends
statement text to a third party, so explicit consent is required each time.
