# Job Apply Bot

Local Playwright-based job application helper.

The bot reads job URLs from `jobs.txt`, reads the applicant profile, extracts the application form, creates an answer plan, fills approved fields, saves logs/screenshots, and stops before submit unless explicitly run in submit mode.

## Per-Person Profiles

Each applicant has their own directory under `people/<name>/`:

```text
people/
  john-doe/
    profile.md        <- resume and personal details
    answers.json      <- reusable answers
    config.json       <- nearby city groups and dropdown aliases
    jobs.txt          <- URLs to apply to
    applied_jobs.txt
    failed_jobs.txt
    skipped_jobs.txt
    runs/             <- run artifacts
    .browser-profile/ <- saved browser session
```

Pass `--person <name>` to scope the run to that directory.

### Setting up a new person

1. Run `node scripts/setup-profile.js <name>`.
2. Fill in `people/<name>/profile.md` with your details.
3. Fill in `people/<name>/answers.json` with your reusable answers.
4. Optional: add dropdown aliases and nearby-city groups to `people/<name>/config.json`.

```json
{
  "optionAliases": {
    "educationSchool": ["Your University Full Name", "Alternate Name"],
    "locationCity": ["Your City", "Your City, ST"]
  },
  "nearbyCities": {
    "yourcity": ["nearby1", "nearby2"]
  }
}
```

5. Validate with `node scripts/validate-profile.js --person <name>`.
6. Add job URLs to `people/<name>/jobs.txt` (one per line), or use the add-tabs script.
7. Dry run with `node apply.js --person <name> --limit 1`.

## Commands

```powershell
# Scaffold a new person profile
node scripts/setup-profile.js john-doe

# Dry-run for a specific person (fills form, skips submit)
node apply.js --person john-doe

# Submit for a specific person
node apply.js --person john-doe --submit

# Limit to the first N jobs
node apply.js --person john-doe --limit 1

# Validate a person's profile setup
node scripts/validate-profile.js --person john-doe
```

## Queue Management

After a run, mark results to clear the queue and track progress.

```powershell
# Mark results for a specific person
node scripts/mark-run-results.js --person john-doe

# Add URLs from clipboard to a person's jobs.txt
node scripts/add-tabs-to-jobs.js --person john-doe
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
node scripts/check-syntax.js
```

Runs `node --check` on all source files and reports any syntax errors.

## Safety

- Dry-run is the default.
- Submit requires `node apply.js --person <name> --submit`.
- Unknown required fields block submission.
- CAPTCHA/human verification is not bypassed.
- Sensitive answers are only filled from the profile or approved reusable answers.
