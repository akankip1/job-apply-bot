# Checkpoints

## 2026-04-27 05:00 AM PDT

- Implemented **Job Queue Management** system to automate the transition of processed URLs from `jobs.txt` to status-specific history files.
- Enhanced `apply.js` to output `job-status.json` as a run artifact, mapping bot results to `applied`, `failed`, or `skipped` buckets.
- Developed `scripts/mark-run-results.ps1` PowerShell script to:
  - Selectively remove processed URLs from the active queue.
  - Distribute URLs into `applied_jobs.txt`, `failed_jobs.txt`, and `skipped_jobs.txt`.
  - Robustly handle file I/O, deduplication, and comment preservation.
- Updated project documentation (`README.md` and `scripts/README.md`) to guide users through the new "Run -> Mark" workflow.
- **Tooling**: This entire feature set was researched, designed, and implemented using **Gemini CLI** (Agent Tool and Model).

## 2026-04-27 10:30 AM

- Built a local Playwright job application bot with dry-run as the default and submit only via `--submit`.
- Refactored from a generic field filler into a pipeline:
  - extract form schema
  - create answer plan
  - fill from approved answers
  - stop before submit unless explicitly allowed
- Added Greenhouse support:
  - iframe detection
  - form schema extraction
  - custom dropdown handling
  - dynamic location autocomplete
  - resume upload
  - submit detection
- Added reusable `answers.json` for questions not in the profile.
- Added current reusable answers:
  - `how_did_you_hear`: `Careers website`
  - `previously_employed_by_company`: `No`
  - `comfortable_with_hybrid_or_relocation`: `Yes`
- Fixed important Greenhouse issues:
  - location now types `Seattle` and selects the first matching suggestion
  - ethnicity tries `Asian` before falling back to `South Asian`
  - cover-letter upload is not treated as resume upload
  - human-verification detection is advisory because hard blocking caused false positives
- Verified latest dry-run:
  - run: `runs\2026-04-27T10-09-36-430Z`
  - status: `dry_run_completed`
  - reached `Submit application` and skipped submit
- First real application submission was reported successful.

## Current State

- Greenhouse path is usable for the tested application.
- No automated tests yet.
- Next: test more Greenhouse jobs before adding another ATS adapter.
- Likely next adapters: Lever, Ashby, Workday.
