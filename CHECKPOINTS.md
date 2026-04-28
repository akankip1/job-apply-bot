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

# Session Checkpoint - 2026-04-28

## Ashby Adapter & Form Robustness

- **Robust Ashby Detection:** Updated `ashby.detect` to check for Ashby frames (`ashbyhq.com`), allowing the adapter to trigger on embedded career pages (e.g., Superhuman).
- **Yes/No Grouping:** Rewrote `extractAshbyButtonGroups` to group disparate `button` and `input[type="radio"]` controls into single "Yes/No" fields.
  - Uses deepest-container sorting to find the most specific grouping.
  - Deduces labels from headers, legends, or preceding text.
  - Deduplicates grouped controls from the general field list.
- **Flexible Matching:** Implemented `questionPrefix` matching (first 50 chars) to find groups even when labels are split across elements.
- **Expanded Option Matchers:** Added regex matchers to handle Ashby's complex label variations:
  - **No:** `don't have a disability`, `not a veteran`, `do not identify`, `prefer not to`, etc.
  - **Yes:** `i have a disability`, `i am a veteran`, `identify as transgender`, etc.
- **Input Label Discovery:** Updated `clickAshbyButtonGroup` to check both `innerText` and native `labels[0].innerText` for input-based radios.

## Classification & Answer Mapping (`lib/answerPlan.js`)

- **Gender Mapping:** "Female" profile value now correctly matches "Woman" checkboxes/radios.
- **Boolean Checkboxes:** Demographic checkboxes (e.g., "Heterosexual", "Woman", "Hispanic") are now planned with explicit "Yes" or "No" answers by checking the profile/answers memory, rather than just mapping strings.
- **Synonym Support:** "employed" recognized as a synonym for "work" in authorization questions.
- **Onsite/Relocation:** "live within X miles" pattern added to capture modern hybrid/onsite questions.
- **LGBTQ+:** Added "transgender" to the identification regex.

## Generic/Greenhouse Improvements

- **Checkbox Logic:** Updated `clickChoice` to handle individual checkboxes that were planned with "Yes/No" or "True/False" strings, ensuring they are checked/unchecked correctly.

## Status

- **Ashby:** Verified dry-run on Superhuman job. Most fields (Gender, Ethnicity, Veteran, Transgender, Auth, Relocation) now fill correctly.
- **Known Issue:** Disability question matching is being refined; the latest dry-run showed successful matching of the "No" variation for other fields but still requires verification for the specific long disability string.

