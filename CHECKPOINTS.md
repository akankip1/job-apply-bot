# Checkpoints

## 2026-05-02 18:30 — Per-Person Parameterization, LLM Removal & Build Validation

### Per-Person Structure
- All applicant data now lives under `people/<name>/` — `profile.md`, `answers.json`, `config.json`, `jobs.txt`, `runs/`, `.browser-profile`
- `--person <name>` flag is required on all scripts; no default fallback
- `lib/config.js` added: `loadConfig(slug)` reads `people/<slug>/config.json` with shape `{ nearbyCities, optionAliases }`
- `people/john-doe/` added as a sample/template profile

### LLM Removed
- Removed `pipeline`, `getGenerator`, `MODEL_NAME`, `buildPrompt` from `lib/llmAnswerPlanner.js`
- Hardcoded `NEARBY_CITY_GROUPS` constant and Florida/Seattle hack removed
- Replaced with `resolveLocationAnswer(field, profile)` reading `profile.nearbyCities` from per-person config
- `profile.nearbyCities` is attached in `apply.js` from `CONFIG.nearbyCities`

### Option Aliases Moved to Config
- Removed hardcoded Binghamton/Amrita/ECE entries from `platforms/greenhouse.js`
- `optionCandidates(answer, decision, aliases)` now reads `aliases[decision.key]` from config
- `fill(page, plan, log, options = {})` signature updated across greenhouse/ashby/generic
- `apply.js` passes `{ aliases: CONFIG.optionAliases }` to all `adapter.fill()` calls
- `educationAliases` key removed from `answers.json` and `DEFAULT_ANSWERS`

### Ashby Global State Removed
- Deleted `globallyFilledKeys` Set and `fillIfNew()` wrapper from `platforms/ashby.js`
- Resume upload now checks file input value before uploading; button groups use existing `isChecked` checks

### Scripts Converted (PS1 → Node.js)
- `scripts/mark-run-results.js` and `scripts/add-tabs-to-jobs.js` already existed; `.ps1` files deleted
- `scripts/test-answer-plan.js` updated: accepts `--person <name>` to load real profile/answers
- `scripts/build-reference.js` updated: `--person` scopes to one person; without it scans all `people/*/runs/`

### Build Validation
- `scripts/validate-profile.js` added: checks config.json types/keys, profile required fields, resume path existence, answers.json completeness, jobs.txt
- `npm run build` now runs syntax checks + profile validation for every directory in `people/`
- `npm run validate -- --person <name>` for standalone profile check
- `npm run mark-results` and `npm run add-jobs` added to package.json

### Cleanup
- Screenshot functionality removed from `apply.js`
- Legacy multi-candidate profile path search removed from `lib/profile.js`
- `CLAUDE.md` added with token-efficiency rules for AI coding agents
- `.gitignore` updated: `people/*/.browser-profile`, `people/*/runs/`, `people/sravya/`
- All docs updated: README, AGENTS.md, DEVELOPMENT.md, scripts/README.md

### Status
- `npm run build` passes: 21 files OK, all tracked profiles validated
- `node scripts/test-answer-plan.js` passes with mock data

---

## 2026-04-28 (latest session) - LLM Factual Answer Planning Added

- **Planner Update:** Added `lib/answerPolicy.js` and `lib/llmAnswerPlanner.js` to let the answer-planning layer reason about factual geography questions after explicit rules and reusable answers fail.
- **Scope Control:** The LLM is only consulted inside `lib/answerPlan.js`, not in `platforms/*`, and submit guard behavior is unchanged.
- **Safety Gates:** Sensitive, legal, sponsorship, work authorization, salary, demographic, and background-check questions remain blocked from LLM guessing unless `answers.json` already provides an explicit answer.
- **Strict Output:** The LLM planner is required to return strict JSON and only high-confidence, safe-to-fill answers are accepted.
- **Logging:** Added planner logs for `llm_answer_planner_used`, `llm_answer_accepted`, `llm_answer_rejected`, and `llm_answer_manual_review`.
- **Regression:** `scripts/test-answer-plan.js` now covers factual location cases such as `Are you near Bellevue?`, `Are you near Florida?`, and `Are you based in the United States?`.
- **Status:** `node scripts/test-answer-plan.js` passed with `16 passed, 0 failed`.

## 2026-04-28 (3:00 AM PT) — Ashby "Seamless" Model & Idempotency Verified

**Full dry-run success on Superhuman job (dc070a50) with 0 un-selections.**

### Successes
- **Ashby Location Persistence:** Resolved "disappearing location" by switching to a deliberate `ArrowDown` + `Enter` keyboard sequence and moving Location to the *start* of the fill sequence.
- **Form Idempotency:** Implemented `globallyFilledKeys` in `platforms/ashby.js` to track logical categories (e.g., `category:location`, `category:resume_autofill`).
- **Toggle Prevention:** Modified `clickAshbyButtonGroup` to verify `isChecked` state before clicking. This prevents the "un-marking" behavior previously caused by re-rendering or duplicate fill passes.
- **Smart Resume Logic:** Distinguished between `resume_autofill_upload` and `resume_attachment_upload`, ensuring the bot only processes the autofill widget once while still allowing a separate CV attachment if requested.
- **History tracking:** Updated `apply.js` to maintain a `fillHistory` across multi-step forms using label-based "Stateful Identity".

### Status
- **Ashby:** Fully stable and idempotent. Verified that dynamic passes no longer clear previously selected radio buttons.
- **Overall:** Ready for high-volume automated runs.

---

## 2026-04-28 (earlier) — Location Autocomplete Root Cause Found

**Berlin Superhuman job (dc070a50) — all blockers except location are resolved.**

### What was fixed this session

- **Button group verification bug** (`ashby.js`): `clickAshbyButtonGroup` was checking `input[type='radio']` checked state after clicking a `<button>` element. Buttons have no checked state so verification always failed. Fix: trust the click for `button`/`role=button` elements.
- **Years of experience** (`answerPlan.js` + profile): Added `yearsOfExperience: 4` to profile. Added RULES entry that picks the matching range option (e.g. "1-4 years of experience") from button group options array.
- **EU question**: Added `locatedInEU` rule returning `"No"` for "Are you located in the European Union?".

### Location autocomplete — root cause found

Debug dump (`ashby_location_debug`) revealed:
1. `finalInputValue: ""` — the location input was **never touched**. `nth(8)` index drifted after `greenhouse.fill()` mutated the DOM.
2. `[role='listbox']` with text "No results" — the dropdown appeared on the **wrong** field, and "Sea" (3 chars) returned no results anyway.

**Fix applied** (`fillLocationCombobox` in `ashby.js`):
- Find input by `input[placeholder*='typing']` instead of `nth(index)`.
- Type full city name (not just 3 chars).
- Wait for `[role='listbox']` to appear, then poll until it stops showing "No results".
- Click first child matching the city regex.

**Status:** Fix written, not yet verified by a dry run. Run `--limit 1` on the Berlin job and check for `ashby_location_option_selected` in the log.

## 2026-04-28 01:00 PT — Embedding-Based Question Classification

Implemented the Semantic Similarity approach from `LLMIFY.md` to replace brittle regex-based label matching.

- **Harvested Reference Set:** 129 successful mappings extracted from `runs/`.
- **Local Model:** Integrated `@xenova/transformers` with `all-MiniLM-L6-v2` (runs locally on CPU).
- **Asynchronous Logic:** Updated `lib/answerPlan.js`, `apply.js`, and `scripts/test-answer-plan.js` to support async classification.
- **Verification:** 13/13 mapping tests passed, including semantic fallbacks for phone and GitHub URLs.
- **Security:** Added `.geminiignore` to prevent LLM context bloat and protect sensitive paths.

**Status:** Ready for regression testing against real job schemas.


## 2026-04-28 (latest session)

### Bug Fixed: Disability Question Mapped to `educationDiscipline`

- **Root Cause:** Line 113 of `lib/answerPlan.js` had the regex `/\bmajor\b/` to match education major fields. The full disability question label contains "major life activities", so `/\bmajor\b/` matched it first — before the `/disab/` check on line 268 could fire. The field was mapped to `educationDiscipline` with answer "Computer Science". Since "Computer Science" is not yes/no, `clickAshbyButtonGroup` was never called at all; `greenhouse.fill()` handled it instead and logged `choice_not_found`.
- **Fix:** Added `&& !/disab/.test(label)` to the `educationDiscipline` condition on line 113. Disability labels now fall through to the correct `/disab/` rule.
- **Confirmed:** This same wrong mapping was present in all prior runs including `2026-04-28T06-40-54-782Z`. `clickAshbyButtonGroup` was never called for the disability field in any session — the bug predates the Ashby work.
- **Verification needed:** Run a fresh dry run and confirm `ashby_group_1` now gets `answer: "No"` and `ashby_group_option_selected` fires for it.

### Architecture Assessment

Documented in `Specs/FIX.md`. Key findings:

- `classifyField` in `lib/answerPlan.js` is a 25+ condition ordered if-else chain. Order is load-bearing but invisible — the disability bug is a direct consequence. Adding rules will keep producing conflicts.
- Extraction and fill are decoupled: `extractAshbyButtonGroups` correctly identifies groups, but `selector: null` for most of them forces `clickAshbyButtonGroup` to re-scan all divs independently at fill time. "Group not found" failures come from this gap.
- No test coverage on the decision layer. All bugs require a full live dry run to surface.

### Recommended next steps (from `Specs/FIX.md`)

1. **Short term (~30 min):** Add `scripts/test-answer-plan.js` — runs `createAnswerPlan` against a saved schema JSON and asserts field→answer mappings. Catches mapping bugs without a browser.
2. **Medium term (2–3 hrs):** Replace the if-else chain with a declarative rule table. Priority becomes explicit; cross-rule conflicts become impossible to miss.
3. **Follow-up (1 hr):** Store `radioName` on extracted Ashby groups so `clickAshbyButtonGroup` can target them directly instead of re-scanning all divs.

## 2026-04-28 07:45 AM PDT

- **Structural Fixes Completed (FIX.md):**
    - **Declarative Mapping:** Refactored `lib/answerPlan.js` into a `RULES` table. This resolved the "major life activities" regex conflict and made mapping deterministic.
    - **Robust Unit Testing:** Refactored `scripts/test-answer-plan.js` to use **Mock Profile/Answers** and **Virtual Fields**. Mapping can now be verified in milliseconds without any browser data or dry-run artifacts.
    - **Ashby Reliability:** Updated `ashby.js` to sync `radioName` from extraction to filling. This eliminates "group not found" errors by using stable DOM attributes for radio button selection.
- **Mapping Enhancements:**
    - **Synonym Support:** Added "Female/Woman" and "Male/Man" synonyms to demographic checkbox logic to ensure correct mapping even when profile labels differ from form labels.
    - **EU Location:** Added a rule to automatically answer "No" to "Are you located in the European Union?".
-  
## 2026-04-28 06:45 AM PDT

- **Investigation: Checkbox and Radio Button Failures**
    - **Root Cause 1 (Regex Mismatch):** The disability question was incorrectly matching `educationDiscipline` because the label contains "major life activities" and the regex was over-eagerly matching "major".
    - **Root Cause 2 (Property Access):** `lib/answerPlan.js` was attempting to access `profile.standard.gender` instead of `profile.sensitive.gender`.
    - **Root Cause 3 (Checkbox Styling):** Standard `.check()` calls were failing on Ashby/Greenhouse checkboxes due to custom CSS styling hiding the native input.
- **Implemented Fixes:**
    - Fixed `educationDiscipline` regex with word boundaries (`\bmajor\b`).
    - Corrected property access for sensitive profile fields.
    - Switched checkbox logic to `click({ force: true })` after checking state with `isChecked()`.
    - Implemented a "demographicOption" mapping logic in `lib/answerPlan.js` to handle individual checkboxes (e.g., "South Asian", "Woman").
    - Enhanced `platforms/ashby.js` with fuzzy matching and keywords (e.g., `disab`) to locate radio groups with extremely long labels.
- **Persistent Issue:** The latest dry run (`2026-04-28T06-40-54-782Z`) still shows `choice_not_found` for the disability radio button (`ashby_group_1`). The bot is successfully finding other button groups but failing to locate the container or the specific buttons for the disability question despite fuzzy matching logic.

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
