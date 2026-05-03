# Scripts

Helper scripts for managing the local job-application workflow.

## `add-tabs-to-jobs.js`

Reads job application URLs from the clipboard, merges them with the person's `jobs.txt`, removes duplicates, and writes one clean URL per line.

**Workflow:**

1. Search for jobs in the browser and open useful postings in tabs.
2. Use a browser extension to copy all open tab URLs to the clipboard.
3. Run this script.

```bash
node scripts/add-tabs-to-jobs.js --person john-doe
# or via npm
npm run add-jobs -- --person john-doe
```

The script extracts URLs from clipboard text regardless of format (one per line, space-separated, or glued together). It creates `people/<name>/jobs.txt` if it does not exist.

## `mark-run-results.js`

Reads the results from a bot run and updates the job queue files. Removes URLs from `jobs.txt` and moves them into `applied_jobs.txt`, `failed_jobs.txt`, or `skipped_jobs.txt`.

```bash
# Use the latest run automatically
node scripts/mark-run-results.js --person john-doe
# or via npm
npm run mark-results -- --person john-doe

# Specify a run explicitly
node scripts/mark-run-results.js --person john-doe --status-file people/john-doe/runs/<timestamp>/job-status.json
```

**Status buckets:**
- `applied` — dry-run completed or submitted successfully
- `failed` — blocked by missing fields, site errors, or bot failures
- `skipped` — manually skipped (not currently assigned by bot)

## `test-answer-plan.js`

Regression test for field-to-answer mapping logic.

```bash
# Run with mock data (no person required)
node scripts/test-answer-plan.js

# Run with a real profile
node scripts/test-answer-plan.js --person john-doe

# Run against a specific form schema from a dry run
node scripts/test-answer-plan.js people/john-doe/runs/<timestamp>/job-1-step-0-form-schema.json
```

## `build-reference.js`

Harvests field mappings from successful dry runs and writes `lib/reference-questions.json`. Run after accumulating clean dry runs to improve classifier coverage.

```bash
# Scan all people's runs
node scripts/build-reference.js

# Scope to one person
node scripts/build-reference.js --person john-doe
```

## `validate-profile.js`

Validates a person's profile directory before running the bot. Checks config.json structure, required profile fields, resume path existence, answers.json completeness, and jobs.txt.

```bash
node scripts/validate-profile.js --person john-doe
# or via npm
npm run validate -- --person john-doe
```

Prints `✓`/`✗` per check and exits with code 1 if any errors are found.

## `build-embeddings.js`

Precomputes vector embeddings for `lib/reference-questions.json`. Required after harvesting new references.

```bash
node scripts/build-embeddings.js
```

## `check-syntax.js`

Runs `node --check` on all source files. Used by `npm run build`.

```bash
npm run build
```
