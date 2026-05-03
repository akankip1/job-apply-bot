# Context: Per-Person Parameterization

## What the bot does

A Playwright-based job application helper. It reads job URLs, loads an applicant’s profile and pre-approved answers, extracts form fields from ATS pages (Greenhouse, Ashby, generic), builds an answer plan mapping fields to profile data, fills the form, and stops before submit unless `--submit` is passed.

## Current data flow

```
apply.js
├── loadProfile(ROOT)          → lib/profile.js     → searches for hardcoded filenames under ROOT
├── loadAnswers(ROOT)          → lib/answers.js     → reads ROOT/answers.json
├── readJobs(ROOT)             → lib/io.js          → reads ROOT/jobs.txt
├── runs/<timestamp>/          → output artifacts (schemas, plans, logs, screenshots)
└── .browser-profile/          → persistent Chromium session
```

## Where person-specific data lives today

| Artifact | Location | Coupling |
|----------|----------|----------|
| Profile markdown | `Specs/sravya_narayana_application_profile.md` | Filename hardcoded in `lib/profile.js` </br> line 82-87 |
| Reusable answers | `answers.json` (project root) | Path hardcoded in `lib/answers.js` line 36 |
| Job queue | `jobs.txt` (project root) | Path hardcoded in `lib/io.js` line 5 |
| Applied/failed/skipped logs | `applied_jobs.txt`, `failed_jobs.txt`, `skipped_jobs.txt` (root) | Referenced by ` |
| Resume/cover letter | Absolute paths inside profile `.md` | Person-specific but already configurable via profile |
| Run output | `runs/<timestamp>/` | Flat — no person separation |
| Browser session | `.browser-profile/` | Single directory — sessions collide if two people use the bot |

## Key code signatures (current)

```js
// lib/profile.js
function loadProfile(root) → searches candidate filenames, returns { profilePath, standard, sensitive }

// lib/answers.js
function loadAnswers(root) → reads root/answers.json, returns { answersPath, answers }

// lib/io.js
function readJobs(root) → reads root/jobs.txt, returns string[]

// apply.js main()
const profile = loadProfile(ROOT);
const { answersPath, answers } = loadAnswers(ROOT);
const allJobs = readJobs(ROOT);
```

## What does NOT need to change

These modules receive profile/answers as function arguments and contain no hardcoded paths:

- `lib/answerPlan.js` - rule engine + classification, receives `(schema, profile, answers)`
- `lib/answerPolicy.js` - pure policy logic
- `lib/embedClassify.js` - reads shared `reference-embeddings.json`
- `lib/formSchema.js` - DOM extraction
- `lib/text.js` - pure string utilities

## Additional problems to fix in this pass

## LLM layer is dead weight

`lib/llmAnswerPlanner.js` loads `flan-t5-small` (~77M params) for `text2text-generation`. In practice:
- The model is bad at returning valid JSON — `extractJson()` often gets `null`.
- When the model fails, `fallbackLocationAnswer()` does the actual work (city/state string matching).
- The model adds 5–10s cold start time per run.
- The `fallbackLocationAnswer` function catches most location-reasoning cases already.

The embedding classifier (`embedClassify.js`) uses the same `@xenova/transformers` package but a different pipeline (`feature-extraction` with `all-MiniLM-L6-v2`), so the dependency stays.

## Global mutable singleton in Ashby adapter

`platforms/ashby.js` has `const globallyFilledKeys = new Set()` at module scope. This persists across jobs in a single run. It exists to prevent re-uploading resumes across multi-step forms, but `apply.js` already has a per-job `fillHistory` Set that tracks the same thing. The module-level state is redundant and will cause bugs if two jobs share fill state.

## Person-specific data in `optionCandidates()`

`platforms/greenhouse.js` → `optionCandidates()` contains hardcoded person-specific mappings:
- "Binghamton University" → "State University of New York at Binghamton"
- "Amrita" → "Amrita Vishwa Vidyapeetham"
- "Electronics and Communication" → "Computer Engineering"

These are one person’s school/degree aliases baked into platform code. Should be data-driven from config.

## PowerShell scripts limit portability

`scripts/mark-run-results.ps1` and `scripts/add-tabs-to-jobs.ps1` only work on Windows/PowerShell.
The rest of the bot is pure Node.js. Clipboard access on macOS is `pbpaste`, on Windows is `powershell -command Get-Clipboard` — both callable from Node's `execSync`.

## Constraints

- CommonJS (`require`/`module.exports`) - no ESM.
- No hardcoding applicant data in source files (AGENTS.md mandate).
- Dry-run default, `--submit` gate must remain.
- `answers.json` default keys must still be seeded on first use.
- Existing single-person usage must keep working (backward compat or easy migration).