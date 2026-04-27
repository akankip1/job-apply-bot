# Job Apply Bot

Local Playwright-based job application helper.

The bot reads job URLs from `jobs.txt`, reads applicant data from `sravya_narayana_application_profile.md`, extracts the application form, creates an answer plan, fills approved fields, saves logs/screenshots, and stops before submit unless explicitly run in submit mode.

## Commands

```powershell
npm.cmd run dry-run
npm.cmd run submit
```

Use `dry-run` first. It fills the form, saves screenshots, and skips final submission.

To process only the first few jobs from `jobs.txt`, pass `--limit`:

```powershell
npm.cmd run dry-run -- --limit 3
```

## Input Files

- `jobs.txt`: one job application URL per line
- `sravya_narayana_application_profile.md`: applicant profile, including resume and cover letter file paths
- `answers.json`: reusable answers for questions not covered by the profile

## Queue Management

After a run completes, you should mark the results to clear the queue and track progress.

1.  Run the marking script:
    ```powershell
    .\scripts\mark-run-results.ps1
    ```
2.  The script moves processed URLs from `jobs.txt` into:
    *   `applied_jobs.txt`: Successfully submitted or dry-run confirmed.
    *   `failed_jobs.txt`: Blocked or failed due to errors.
    *   `skipped_jobs.txt`: Intentionally skipped URLs.

## Output

Each run writes artifacts under:

```text
runs\<timestamp>\
```

Important files:

- `log.jsonl`
- `job-*-form-schema.json`
- `job-*-answer-plan.json`
- `screenshots\`

## Safety

- Dry-run is the default.
- Submit requires `npm.cmd run submit`.
- Unknown required fields block submission.
- CAPTCHA/human verification is not bypassed.
- Sensitive answers are only filled from the profile or approved reusable answers.
