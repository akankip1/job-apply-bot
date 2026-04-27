# Scripts

This folder contains helper scripts for managing the local job-application workflow.

## `add-tabs-to-jobs.ps1`

Reads job application URLs from the clipboard, merges them with the existing `jobs.txt`, removes duplicates, and writes one clean URL per line.

This script is used for the manual job-sourcing workflow:

1. Manually search for jobs in the browser.
2. Manually open useful job postings in separate tabs.
3. Manually use a browser extension to copy all open tab URLs to the clipboard.
4. Run this script.
5. The script reads the clipboard and updates `jobs.txt`.

The script does **not** read browser tabs directly. It only reads whatever text is already in the clipboard.

## Usage

Run from the `scripts` folder:

```powershell
cd scripts
.\add-tabs-to-jobs.ps1
```

Or run from the project root:

```powershell
.\scripts\add-tabs-to-jobs.ps1
```

## Input

The script expects the clipboard to contain one or more URLs.

It supports URLs copied as:

- one URL per line
- multiple URLs on one line
- space-separated URLs
- URLs accidentally glued together, such as `...123https://...456`

## Output

The script updates:

```text
..\jobs.txt
```

It preserves existing comments from `jobs.txt`, extracts existing URLs, adds new clipboard URLs, removes duplicates, and writes each URL on its own line.

Example output:

```text
# Add one job application URL per line.

https://navan.com/careers/openings/7777949?gh_jid=7777949
https://navan.com/careers/openings/7783028?gh_jid=7783028
```

## Console Output

After running, the script prints:

```text
Added URLs from clipboard to jobs.txt.
New URLs found: <number>
Total unique URLs: <number>
```

## Notes

- `jobs.txt` is treated as the input queue for the application bot.
- If `jobs.txt` does not exist, the script creates it.
- The script is intentionally simple and only manages URLs.
- It does not apply to jobs.
- It does not submit applications.
- It does not scrape job boards.
- It does not access browser tabs directly.

## `mark-run-results.ps1`

Reads the results from a bot run and updates the job queue files. It removes URLs from `jobs.txt` and moves them into `applied_jobs.txt`, `failed_jobs.txt`, or `skipped_jobs.txt` based on the run outcome.

### Usage

By default, it uses the results from the latest run:

```powershell
.\scripts\mark-run-results.ps1
```

To mark from a specific run:

```powershell
.\scripts\mark-run-results.ps1 -StatusFile .\runs\2026-04-27T11-00-21-833Z\job-status.json
```

### Behavior

1. **Latest Run Discovery**: If no `-StatusFile` is provided, it searches for the newest `job-status.json` inside the `runs/` directory.
2. **Queue Removal**: Every URL listed in the status file is removed from `jobs.txt`.
3. **Status Assignment**: URLs are added to the corresponding status file:
   - `applied`: successfully submitted or dry-run completed.
   - `failed`: blocked by missing fields, site errors, or bot failures.
   - `skipped`: manually skipped (not currently assigned by bot).
4. **Deduplication**: Ensures URLs only exist in one status file at a time and removes duplicates while preserving comments.

### Output Summary

```text
Marking results from: F:\...\runs\...\job-status.json
--------------------------------
Summary:
Results read: 9
Removed from jobs.txt: 9
Added to applied_jobs.txt: 9
Added to failed_jobs.txt: 0
Added to skipped_jobs.txt: 0
Total queued URLs remaining: 0
```