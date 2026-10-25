# Job Apply Bot

Local Playwright-based job application helper. Applicant data and answer planning stay on the local machine.

The bot reads job URLs from `jobs.txt`, reads the applicant profile, extracts the application form, creates an answer plan, fills approved fields, saves logs/screenshots, and stops before submit unless explicitly run in submit mode.

## Requirements and Installation

- Node.js and npm
- Playwright Chromium
- macOS, Linux, or Windows
- Linux clipboard access through `xclip` or `xsel`

```bash
git clone https://github.com/akankip1/job-apply-bot.git
cd job-apply-bot
npm install
npx playwright install chromium
```

The local embedding classifier is provided by `@xenova/transformers`. Its model may be downloaded into the local package cache when embeddings are first built or used; applicant profile and answer data are not sent to an external AI API.

## Supported Platforms

Current platform handlers under `platforms/`:

- `Ashby`
- `Greenhouse`
- `Workable`
- `Generic` fallback handler for sites that do not match a dedicated platform module

Lever and Workday do not have dedicated adapters. They may reach the generic fallback, but are not explicitly supported.

## Per-Person Profiles

Each applicant has their own directory under `people/<name>/`:

```text
people/
  john-doe/
    profile.md        <- resume and personal details
    answers.json      <- reusable answers
    config.json       <- nearby city groups and dropdown aliases
    jobs.txt          <- URLs to apply to
    dry_run_jobs.txt  <- prepared but still eligible jobs
    blocked_jobs.txt  <- jobs requiring review
    unverified_jobs.txt <- uncertain submission attempts
    applied_jobs.txt
    failed_jobs.txt
    skipped_jobs.txt
    application_history.jsonl
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

### Accelerate profile setup with GenAI

Use the copy-ready [GenAI profile intake prompt](./docs/PROFILE_INTAKE_PROMPT.md). It asks every setup question in one response, then generates polished contents for `profile.md`, `answers.json`, and `config.json` after the applicant replies.

Everything under `people/<name>/` is private local data and is ignored by Git. Do not force-add profiles, reusable answers, resumes, queues, browser sessions, logs, or run artifacts.

## Workflow

1. Open job application pages in browser tabs and use a browser extension to copy their URLs.
2. Run `node scripts/add-tabs-to-jobs.js --person <name>` to read the clipboard and merge exact HTTP/HTTPS URL matches into `people/<name>/jobs.txt`.
3. Validate the profile, then run a one-job dry run.
4. Inspect the saved form schema, answer plan, and `log.jsonl`.
5. Use `--submit` only after the dry run is clean and every answer is approved.
6. Reconcile the run into tracking files.

Copying tabs only changes the clipboard. It does not start the importer or the bot. The current importer performs exact-string deduplication within `jobs.txt`; stricter URL validation, normalized deduplication, and cross-checks against historical tracking files are planned but not yet implemented.

Answer planning uses explicit rules and deterministic profile/answer lookups first, then local embedding classification for supported label variations. Sensitive, legal, salary, work-authorization, demographic, and location-willingness answers require an explicit profile or reusable-answer source. Missing values remain unanswered, and unsupported required fields block submission for manual review.

## Commands

```bash
# Scaffold a new person profile
node scripts/setup-profile.js john-doe

# Dry-run for a specific person (fills form, skips submit)
node apply.js --person john-doe

# Submit for a specific person
node apply.js --person john-doe --submit

# Submit while allowing up to two minutes for manual human verification
node apply.js --person john-doe --submit --keep-open

# Limit to the first N jobs
node apply.js --person john-doe --limit 1

# Process 3 jobs at a time
node apply.js --person john-doe --concurrency 3

# Validate a person's profile setup
node scripts/validate-profile.js --person john-doe

# Import copied tab URLs from the clipboard
node scripts/add-tabs-to-jobs.js --person john-doe

# Reconcile the latest run status file
node scripts/mark-run-results.js --person john-doe
```

## Queue Management

After a run, mark results to clear the queue and track progress.

```bash
# Mark results for a specific person
node scripts/mark-run-results.js --person john-doe

# Add URLs from clipboard to a person's jobs.txt
node scripts/add-tabs-to-jobs.js --person john-doe
```

The marking script reconciles explicit statuses into:

- `dry_run_jobs.txt`: completed dry runs; the URL also remains in `jobs.txt` for a later explicit submission run
- `applied_jobs.txt`: submissions confirmed through platform-aware evidence
- `blocked_jobs.txt`: applications requiring manual review
- `unverified_jobs.txt`: submission attempts without reliable confirmation; these are removed from the automatic queue
- `failed_jobs.txt`: processing or page errors
- `skipped_jobs.txt`: intentionally skipped
- `application_history.jsonl`: idempotent reconciliation history keyed by source status file, URL, and status

A submit-button click is not sufficient evidence of success. Each adapter checks for a platform confirmation selector, success message, or recognized confirmation URL. Missing evidence produces `submission_unverified`, which must be manually resolved and is never automatically requeued. `--from-clipboard` and `--review-before-submit` remain planned features, not current commands.

## Output

Each run writes artifacts under:

```text
people/<name>/runs/<timestamp>/
```

Important files:

- `log.jsonl`
- `job-*-form-schema.json`
- `job-*-answer-plan.json`
- `job-*-recheck-*-form-schema.json`
- `job-*-recheck-*-answer-plan.json`
- `job-status.json`

Run artifacts can contain form labels, answers, URLs, and screenshots. Keep them local and inspect `log.jsonl` for `field_fill_failed`, unexpected `value_not_persisted`, blockers, and the final job status.

## Troubleshooting

- `Cannot find module '@xenova/transformers'`: run `npm install`, then rebuild embeddings if needed with `node scripts/build-embeddings.js`.
- Playwright cannot launch Chromium: run `npx playwright install chromium`.
- Clipboard import adds nothing on Linux: install `xclip` or `xsel` and confirm the copied text contains complete HTTP/HTTPS URLs.
- Profile validation fails: run `node scripts/validate-profile.js --person <name>` and fill every missing required profile or answer key from an explicit source.
- A field does not persist: inspect the latest form schema, answer plan, and `log.jsonl`; see `DEVELOPMENT.md` for adapter debugging.
- No jobs run: add one URL per line to `people/<name>/jobs.txt` or run the clipboard importer.

## Syntax Check

```bash
node scripts/check-syntax.js
```

Runs `node --check` on all source files, then validates every local person profile. The command exits nonzero if either source syntax or profile validation fails.

## Safety

- Dry-run is the default.
- Submit requires `node apply.js --person <name> --submit`.
- Only verified submissions enter `applied_jobs.txt`; dry runs stay eligible and uncertain submissions are held separately.
- Unknown required fields block submission.
- CAPTCHA/human verification is never bypassed. It blocks immediately unless submit mode explicitly includes `--keep-open`, which pauses for manual completion and then revalidates the form.
- Sensitive answers only come from the profile or approved reusable answers; missing values never silently become `No`.
- Applicant data must never be sent to external APIs or committed to Git.
- Unknown required, sensitive, salary, background-check, and legal fields must receive manual review unless an explicit approved answer exists.
