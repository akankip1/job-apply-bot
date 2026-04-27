# Checkpoints

## 2026-04-27

### What Happened

- Reviewed `PROMPT.md` for the local Playwright job application automation request.
- Identified safety and clarity improvements:
  - dry-run should be the default
  - submit should only happen with `--submit`
  - screenshots should be saved at the review/submission point even during dry-runs
  - unknown required fields should block submission and be logged
  - CAPTCHA, login barriers, human verification, paywalls, and bot protections should not be bypassed
  - logs and screenshots should be written to run-specific folders
- Updated `PROMPT.md` with those safer instructions.
- Added `apply.js`, a Playwright automation script that:
  - reads applicant data from `sravya_narayana_application_profile.md`
  - reads job URLs from `jobs.txt`
  - opens Chromium in non-headless mode
  - attempts to fill known fields from the profile
  - uploads the resume if a file upload field exists and the resume file is present
  - logs detected, filled, and skipped fields
  - saves screenshots under `runs/<timestamp>/screenshots/`
  - writes JSONL logs under `runs/<timestamp>/log.jsonl`
  - defaults to dry-run mode
  - submits only with `--submit`
  - blocks on unknown required fields, sensitive fields needing confirmation, and human verification
- Updated `package.json` scripts:
  - `npm run dry-run`
  - `npm run submit`
- Created `jobs.txt` with a placeholder because it was missing.
- Verified:
  - `node --check apply.js` passes
  - `npm.cmd run dry-run` starts successfully
  - dry-run currently exits with `no_jobs` because `jobs.txt` has no application URLs yet
  - resume file exists at `C:\Users\venka\Downloads\Sravya_Narayana_resume.pdf`
- Initialized a Git repository in `F:\CODEX\Job application\job-apply-bot`.
- Found that `git` is installed at `C:\Program Files\Git\cmd\git.exe`, but that location is not on the current PowerShell `PATH`.
- Confirmed Git works when called by full path:
  - `C:\Program Files\Git\cmd\git.exe --version`
  - version: `2.54.0.windows.1`

### Where We Stopped

- The Git repository is initialized.
- No first commit has been made yet.
- `git --version` still does not work directly in PowerShell because Git is not on `PATH`.
- Current Git status shows all files as untracked.
- `node_modules/` and `runs/` are also untracked, so a `.gitignore` should be added before the first commit.
- `jobs.txt` has no real job application URLs yet.

### Suggested Next Steps

1. Add a `.gitignore` that excludes `node_modules/`, `runs/`, `.browser-profile/`, and other generated files.
2. Add `C:\Program Files\Git\cmd` to the user `PATH`, then reopen PowerShell.
3. Add job application URLs to `jobs.txt`.
4. Run:

```powershell
npm.cmd run dry-run
```

5. Review screenshots and logs under `runs/<timestamp>/`.
6. Only after reviewing dry-run behavior, use submit mode:

```powershell
npm.cmd run submit
```
