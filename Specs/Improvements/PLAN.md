# Implementation Plan: Per-Person Config + Cleanup

---

## Phase 1: Core parameterization

### Task 1: Create `lib/config.js`
- [ ] Implement `loadConfig(slug)` - reads `profiles/<slug>/config.json`, resolves all paths to absolute,
- including `optionAliases`
- [ ] Implement `resolveDefaultSlug()` - auto-detect when single profile exists, error when ambiguous
- [ ] Implement `parseProfileArg(argv)` - extract `--profile <slug>` from process args
- [ ] Export all three functions
- **file:** `lib/config.js` (new)

### Task 2: Modify `lib/profile.js`
- [ ] Change `loadProfile(root)` → `loadProfile(profilePath)` - accept exact file path
- [ ] Remove the 4-candidate filename search logic
- [ ] Throw if `profilePath` doesn't exist
- [ ] Keep all markdown parsing unchanged
- **file:** `lib/profile.js`

### Task 3: Modify `lib/answers.js`
- [ ] Change `loadAnswers(root)` → `loadAnswers(answersPath)` - accept exact file path
- [ ] Remove `path.join(root, "answers.json")` construction
- [ ] Keep default-key seeding and merge logic unchanged
- **file:** `lib/answers.js`

### Task 4: Modify `lib/io.js`
- [ ] Change `readJobs(root)` → `readJobs(jobsPath)` - accept exact file path
- [ ] Remove `path.join(root, "jobs.txt")` construction
- [ ] Keep line parsing unchanged
- **file:** `lib/io.js`

### Task 5: Modify `apply.js`
- [ ] Import `loadConfig` and `parseProfileArg` from `lib/config.js`
- [ ] Parse `--profile` from argv using `parseProfileArg`
- [ ] Call `loadConfig(slug)` to get resolved paths
- [ ] Pass `config.profilePath` to `loadProfile()`
- [ ] Pass `config.answersPath` to `loadAnswers()`
- [ ] Pass `config.jobsPath` to `readJobs()`
- [ ] Change `RUN_DIR` to `runs/<slug>/<timestamp>/`
- [ ] Change `USER_DATA_DIR` to `.browser-profiles/<slug>/`
- [ ] Pass `config.optionAliases` through to adapter `fill()` calls
- **file:** `apply.js`

### Task 6: Create `scripts/setup-profile.js`
- [ ] Accept slug as `process.argv[2]`
- [ ] Create `profiles/<slug>/` directory
- [ ] Write template `config.json` with default relative paths, empty `nearbyCities`, and empty `optionAliases`
- [ ] Write empty `answers.json` with DEFAULT_ANSWERS keys
- [ ] Write empty `jobs.txt` with comment header
- [ ] Write template `application_profile.md` with all expected fields as placeholders
- [ ] Print instructions to stdout
- **file:** `scripts/setup-profile.js` (new)

### Task 6b: Create `scripts/validate-profile.js`
- [ ] Accept slug as `process.argv[2]` (or `--profile <slug>`)
- [ ] Load and validate `config.json` schema:
    - Required fields present: `name`, `profileFile`, `answersFile`, `jobsFile`
    - No unknown fields (flag typos with "did you mean?" suggestions)
    - Correct types (`nearbyCities` and `optionAliases` are objects, rest are strings)
- [ ] Verify referenced files exist: `profileFile`, `answersFile`, `jobsFile`
- [ ] Parse profile markdown and check critical fields are non-empty: `firstName`, `lastName`,
- `email`, `phone`
- [ ] Validate `answers.json` is valid JSON and contains all DEFAULT_ANSWERS keys
- [ ] Verify `resumePath` from parsed profile resolves to an existing file
- [ ] Verify `coverLetterPath` if present resolves to an existing file
- [ ] Summarize `nearbyCities` and `optionAliases` counts
- [ ] Print ✓/x per check, exit code 1 if any errors
- **file:** `scripts/validate-profile.js` (new)

---

## Phase 2: LLM replacement

### Task 7: Gut LLM model call in `lib/llmAnswerPlanner.js`
- [ ] Remove `getGenerator()`, `generator` variable, `MODEL_NAME` constant
- [ ] Remove `buildPrompt()` function
- [ ] Remove the `pipeline` import from `@xenova/transformers`
- [ ] Remove the hardcoded `NEARBY_CITY_GROUPS` constant
- [ ] Remove the hardcoded `if (label.includes("florida") && city === "seattle")` check
- [ ] Rename `fallbackLocationAnswer()` → `resolveLocationAnswer(field, profile)` - read `nearbyCities`
- from `profile.nearbyCities` instead of module-level constant
- [ ] Rewrite `planAnswer()`: call `resolveLocationAnswer()` directly, wrap in `normalizeResponse()`,
- skip model entirely
- [ ] Keep `normalizeResponse()`, `optionMatch()` unchanged
- [ ] Keep the `planAnswer` export signature unchanged so `lib/answerPlan.js` call site doesn't change
- **file:** `lib/llmAnswerPlanner.js`

### Task 7b: Attach `nearbyCities` to profile in `apply.js`
- [ ] After `loadConfig()` and `loadProfile()`, attach `profile.nearbyCities = config.nearbyCities || {}`
- [ ] This threads the config value to `planAnswer()` via the existing `profile` argument without changing
- any function signatures
- **file:** `apply.js`

---

## Phase 3: Ashby global state fix

### Task 8: Remove `globallyFilledKeys` from `platforms/ashby.js`
- [ ] Delete `const globallyFilledKeys = new Set()` at module scope
- [ ] Delete the `fillIfNew()` wrapper function
- [ ] In `fill()`: for resume/file uploads, check if file input already has a value before uploading
- [ ] In `fill()`: for text fields, rely on `fillTextAndVerify()` which already checks current value
- [ ] For button groups, call `clickAshbyButtonGroup()` directly (it already checks `isChecked`)
- [ ] Keep the location-first, then greenhouse, then text, then groups ordering
- **file:** `platforms/ashby.js`

---

## Phase 4: Option aliases

### Task 9: Move person-specific aliases out of `optionCandidates()`
- [ ] In `platforms/greenhouse.js`: add `aliases` parameter to `optionCandidates(answer, decision, aliases)`
- [ ] Remove hardcoded person-specific entries (Binghamton, Amrita, Electronics and Communication)
- [ ] Add `const keyAliases = aliases[decision.key] || []` and push them into candidates
- [ ] Keep all generic ATS-specific expansions (Yes→"I am authorized...", disability No→"No,
- I do not have...", etc.)
- [ ] Update `fillComboboxLikeField()` to pass aliases through to `optionCandidates()`
- [ ] Update `fill()` signature: `fill(page, plan, log, options)` where `options.aliases` is the map
- **file:** `platforms/greenhouse.js`

### Task 10: Thread aliases through call chain
- [ ] In `platforms/ashby.js`: update `fill()` to accept and forward `options` to `greenhouse.fill()`
- [ ] In `platforms/generic.js`: update `fill` reference (delegates to `greenhouse.fill`)
- [ ] In `apply.js`: pass `{ aliases: config.optionAliases }` to `adapter.fill()` calls
- **files:** `platforms/ashby.js`, `platforms/generic.js`, `apply.js`

---

## Phase 5: PowerShell → Node.js

### Task 11: Convert `scripts/mark-run-results.ps1` → `scripts/mark-run-results.js`
- [ ] Implement same logic in Node: read `job-status.json`, move URLs between queue files
- [ ] Accept `--profile <slug>` to resolve paths from config
- [ ] When no `--profile`, use `resolveDefaultSlug()`
- [ ] Accept optional `--status-file <path>` for explicit status file
- [ ] Default: find latest `job-status.json` under `runs/<slug>/`
- [ ] Delete the `.ps1` file after verification
- **file:** `scripts/mark-run-results.js` (new), delete `scripts/mark-run-results.ps1`

### Task 12: Convert `scripts/add-tabs-to-jobs.ps1` → `scripts/add-tabs-to-jobs.js`
- [ ] Implement clipboard reading: `pbpaste` on macOS, `powershell -command Get-Clipboard` on Windows
- [ ] Extract URLs from clipboard text, merge with existing `jobs.txt`, deduplicate
- [ ] Accept `--profile <slug>` to resolve `jobs.txt` path from config
- [ ] Delete the `.ps1` file after verification
- **file:** `scripts/add-tabs-to-jobs.js` (new), delete `scripts/add-tabs-to-jobs.ps1`

---

## Phase 6: Script updates

### Task 13: Update `scripts/test-answer-plan.js`
- [ ] Add optional `--profile <slug>` argument parsing
- [ ] When provided, load real profile and answers via `loadConfig` + `loadProfile` + `loadAnswers`
- [ ] When not provided, keep existing mock data behavior (no regression)
- **file:** `scripts/test-answer-plan.js`

### Task 14: Update `scripts/build-reference.js`
- [ ] Add optional `--profile <slug>` argument parsing
- [ ] When provided, scope `runsDir` to `runs/<slug>/`
- [ ] When not provided, scan all `runs/*/` subdirectories
- **file:** `scripts/build-reference.js`

---

## Phase 7: Config and docs

### Task 15: Update `package.json`
- [ ] Add `"setup_profile": "node scripts/setup-profile.js"` to scripts
- [ ] Add `"validate": "node scripts/validate-profile.js"` to scripts
- [ ] Add `"mark-results": "node scripts/mark-run-results.js"` to scripts
- [ ] Add `"add_jobs": "node scripts/add-tabs-to-jobs.js"` to scripts
- **file:** `package.json`

# Plan Continued

### Task 16: Update `.gitignore`
- [ ] Add `profiles/` line
- [ ] Add `.browser-profiles/` line
- **file:** `.gitignore`

### Task 17: Update documentation
- [ ] `README.md` - update commands, input files, queue management for `--profile`; replace PS1 references
- with Node scripts
- [ ] `AGENTS.md` - update source of truth to `profiles/<slug>/`
- [ ] `DEVELOPMENT.md` - update architecture flow, command examples, test checklist; document
- `optionAliases`; note LLM removal
- [ ] `scripts/README.md` - replace PS1 script docs with Node equivalents
- **files:** `README.md`, `AGENTS.md`, `DEVELOPMENT.md`, `scripts/README.md`

---

## Phase 8: Verify

### Task 18: Full verification
- [ ] `node --check` on every modified/new `.js` file
- [ ] `node scripts/setup-profile.js testuser` - verify directory structure and template files
- [ ] `node scripts/validate-profile.js testuser` - runs and reports expected errors for empty template
- [ ] `node scripts/test-answer-plan.js` - passes with mock data (no --profile)
- [ ] `node scripts/add-tabs-to-jobs.js --help` - runs without error
- [ ] `node scripts/mark-run-results.js --help` - runs without error
- [ ] Clean up `profiles/testuser/` after verification

---

## Session Boundaries

Execute this plan across 3 sessions to stay within context limits.

| Session | Phases | Tasks | Prompt file | Verify before stopping                                                                               |
|---------|--------|-------|-------------|------------------------------------------------------------------------------------------------------|
| 1 | 1 | 1-6 | `PROMPT-session1.md` | `node scripts/setup-profile.js testuser` succeeds`node --check` passes on all modified files         |
| 2 | 2, 3, 4 | 7-10 | `PROMPT-session2.md` | `node --check` passes on `llmAnswerPlanner.js` `ashby.js`, `greenhouse.js`, `generic.js`, `apply.js` |
| 3 | 5, 6, 7, 8 | 11-18 | `PROMPT-session3.md` | Full verification (Task 18)                                                                          |

Start each session by re-reading `CONTEXT.md` and `DESIGN.md`, then the session-specific prompt.