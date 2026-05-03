# Job Apply Bot

Local Playwright-based job application helper.

The bot reads job URLs from `jobs.txt`, reads the applicant profile, extracts the application form, creates an answer plan, fills approved fields, saves logs/screenshots, and stops before submit unless explicitly run in submit mode.

## Per-Person Profiles

Each applicant has their own directory under `people/<name>/`:

```
people/
  sravya/
    profile.md        ← resume and personal details
    answers.json      ← reusable answers + education aliases
    jobs.txt          ← URLs to apply to
    applied_jobs.txt
    failed_jobs.txt
    skipped_jobs.txt
    runs/             ← run artifacts
    .browser-profile/ ← saved browser session
```

Pass `--person <name>` to scope the run to that directory.

### Setting up a new person

1. Create `people/<name>/profile.md` with the applicant's resume and personal details.
2. Create `people/<name>/answers.json` with reusable field answers. Add `educationAliases` for school/discipline dropdown matching:

```json
{
  "educationAliases": {
    "Binghamton": ["Binghamton University", "Binghamton University - SUNY"],
    "Electronics and Communication": ["ECE", "Electronics and Communication Engineering"]
  }
}
```

3. Add job URLs to `people/<name>/jobs.txt` (one per line), or use the add-tabs script.

## Commands

```powershell
# Dry-run for a specific person (fills form, skips submit)
npm.cmd run dry-run -- --person sravya

# Submit for a specific person
npm.cmd run submit -- --person sravya

# Limit to the first N jobs
npm.cmd run dry-run -- --person sravya --limit 1

# No --person flag → reads from the project root (legacy behavior)
npm.cmd run dry-run
```

## Queue Management

After a run, mark results to clear the queue and track progress.

```powershell
# Mark results for a specific person
node scripts/mark-run-results.js --person sravya

# Add URLs from clipboard to a person's jobs.txt
node scripts/add-tabs-to-jobs.js --person sravya
```

The marking script moves processed URLs from `jobs.txt` into:
- `applied_jobs.txt`: successfully submitted or dry-run confirmed
- `failed_jobs.txt`: blocked or errored
- `skipped_jobs.txt`: intentionally skipped

## Output

Each run writes artifacts under:

```text
people/<name>/runs/<timestamp>/
```

Important files:

- `log.jsonl`
- `job-*-form-schema.json`
- `job-*-answer-plan.json`

## Syntax Check

```powershell
npm.cmd run build
```

Runs `node --check` on all source files and reports any syntax errors.

## Safety

- Dry-run is the default.
- Submit requires `npm.cmd run submit`.
- Unknown required fields block submission.
- CAPTCHA/human verification is not bypassed.
- Sensitive answers are only filled from the profile or approved reusable answers.
