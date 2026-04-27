# AGENTS.md

Guidance for AI coding agents working in this project.

## Project Overview

This is a local Node.js/CommonJS Playwright helper for job applications. The main entry point is `apply.js`.

The bot reads job URLs from `jobs.txt`, applicant data from `Specs/sravya_narayana_application_profile.md`, and reusable answers from `answers.json`. It extracts application forms, creates answer plans, fills approved fields, and writes run artifacts under `runs/<timestamp>/`.

Dry-run mode is the default. Real submission only happens when explicitly run with submit mode.

## Commands

Use PowerShell-friendly commands on Windows:

```powershell
npm.cmd run dry-run
npm.cmd run submit
```

For syntax checks:

```powershell
node --check apply.js
node --check lib\profile.js
node --check lib\formSchema.js
node --check lib\answerPlan.js
node --check platforms\greenhouse.js
```

Run `npm.cmd run dry-run` before using submit mode, then inspect the latest `runs\<timestamp>\` folder.

## Important Files

- `apply.js`: run orchestration, browser lifecycle, logging, screenshots, final submission gate.
- `lib/profile.js`: applicant profile loading/parsing.
- `lib/answers.js`: reusable answer loading.
- `lib/formSchema.js`: form field extraction and field metadata normalization.
- `lib/answerPlan.js`: mapping form fields to approved profile or reusable answers.
- `platforms/index.js`: ATS adapter detection.
- `platforms/greenhouse.js`: Greenhouse-specific extraction/fill/navigation behavior.
- `platforms/generic.js`: fallback adapter.
- `README.md`: user-facing usage.
- `DEVELOPMENT.md`: architecture notes and test checklist.

## Source of Truth

- Treat `Specs/sravya_narayana_application_profile.md` as the applicant profile source of truth.
- Treat `answers.json` as the source of truth for reusable manually approved answers.
- Do not hardcode applicant data in source files.
- Do not duplicate profile values into code.
- Do not modify the applicant profile or reusable answers unless explicitly asked.

## Safety Rules

- Do not bypass CAPTCHA or human verification.
- Do not make submit mode the default.
- Do not click final submit buttons in dry-run mode.
- Unknown required fields must block submission.
- Sensitive, legal, salary, background-check, or ambiguous fields should require manual review unless there is an explicit approved answer source.
- Keep applicant data, resume and cover letter paths, and reusable answers local. Do not add code that sends profile data to external services.
- Treat generated files under `runs/` and browser state under `.browser-profile/` as local artifacts, not source files.

## Generated Artifacts and Ignored Paths

Do not inspect, edit, summarize, or commit these unless explicitly asked:

- `node_modules/`
- `runs/`
- `logs/`
- `screenshots/`
- `.browser-profile/`
- `.cache/`
- `dist/`
- `coverage/`
- `*.log`

Generated artifacts should be used only for debugging a specific requested issue.

## Context and Token Discipline

- Inspect only files relevant to the current task.
- Prefer targeted reads over repo-wide scans.
- Do not reread large generated artifacts unless required.
- Summarize changes concisely.
- Prefer diffs or patch summaries over full-file output.

## Implementation Guidelines

- Follow the existing CommonJS style: `require(...)`, `module.exports`, plain async functions.
- Keep answer decisions in `lib/answerPlan.js`.
- Keep DOM and ATS quirks inside `platforms/*`.
- Keep company-specific hacks out of adapters unless they are actually platform-level behavior.
- Prefer stable selectors and structured form metadata over brittle text-only matching.
- Keep comments short and only for behavior that is not obvious.
- Preserve dry-run-first behavior when changing orchestration.
- Make minimal targeted patches.
- Do not rewrite unrelated files.
- Do not print full file contents unless explicitly requested.

## Adapter Guidance

For a new ATS adapter:

1. Add a file in `platforms/`.
2. Implement the same shape used by the existing adapters: `name`, `detect`, `extract`, `fill`, `nextButton`, and `submitButton`.
3. Register detection in `platforms/index.js`.
4. Put shared answer mapping in `lib/answerPlan.js`, not in the adapter.
5. Put platform DOM behavior in the adapter.

## Verification

Before handing off code changes, run the smallest useful checks for the touched files.

For broad behavior changes, use:

```powershell
node --check apply.js
node --check lib\profile.js
node --check lib\formSchema.js
node --check lib\answerPlan.js
node --check platforms\greenhouse.js
npm.cmd run dry-run
```

When a dry run is performed, review the latest run folder for `log.jsonl`, form schemas, answer plans, and screenshots before considering submit mode.

If a check cannot be run, explain which command should be run manually and why.
