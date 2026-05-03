# Session 3: Scripts, Config & Docs (Tasks 11-18)

## Objective
Convert PowerShell scripts to Node.js, update remaining scripts for `--profile` support, update
package.json/gitignore, and update all documentation.

## Before you start
If you have already read the files, don't read them again unless necessary. If you haven't then:
Read these specs in order:
1. `.kiro/specs/parameterize-per-person/DESIGN.md` - read "Convert PowerShell scripts to Node.js"
   and "Script changes" sections
2. `.kiro/specs/parameterize-per-person/PLAN.md` - Tasks 11-18

Also read the existing PS1 scripts to understand the logic before rewriting:
- `scripts/mark-run-results.ps1`
- `scripts/add-tabs-to-jobs.ps1`

## Prerequisite
Sessions 1 and 2 must be complete. Verify:
```bash
node --check lib/config.js
node --check apply.js
node --check lib/llmAnswerPlanner.js
node --check platforms/greenhouse.js
```

## Tasks

### Task 11: Convert `scripts/mark-run-results.ps1` → `scripts/mark-run-results.js`
- Reimplement in Node.js: read `job-status.json`, move URLs between queue files
- Accept `--profile <slug>` - resolve all paths from config
- Accept optional `--status-file <path>` for explicit status file
- Default: find latest `job-status.json` under `runs/<slug>/`
- Import `loadConfig`, `parseProfileArg` from `../lib/config.js`
- Delete the `.ps1` file after the `.js` version is verified

### Task 12: Convert `scripts/add-tabs-to-jobs.ps1` → `scripts/add-tabs-to-jobs.js`
- Clipboard reading:
```js
const clipboard = process.platform === "darwin"
  ? require("child_process").execSync("pbpaste", { encoding: "utf8" })
  : require("child_process").execSync("powershell -command Get-Clipboard", { encoding: "utf8" });
```
- Extract URLs, merge with existing `jobs.txt`, deduplicate, write back
- Accept `--profile <slug>` - resolve `jobs.txt` path from config
- Delete the `.ps1` file after the `.js` version is verified

### Task 13: Update `scripts/test-answer-plan.js`
- Add optional `--profile <slug>` argument parsing
- When provided, load real profile and answers via `loadConfig` + `loadProfile` + `loadAnswers`
- When not provided, keep existing mock data behavior (no regression)

### Task 14: Update `scripts/build-reference.js`
- Add optional `--profile <slug>` argument parsing
- When provided, scope `runsDir` to `runs/<slug>/`
- When not provided, scan all `runs/*/` subdirectories

### Task 15: Update `package.json`
- Add scripts: `"setup_profile"`, `"mark-results"`, `"add_jobs"`

### Task 16: Update `.gitignore`
- Add `profiles/` and `.browser-profiles/`

### Task 17: Update documentation
- `README.md` - commands, input files, queue management for `--profile`; replace PS1 references
- `AGENTS.md` - source of truth → `profiles/<slug>/`
- `DEVELOPMENT.md` - architecture flow, commands, test checklist; document `optionAliases`; note LLM removal
- `scripts/README.md` - replace PS1 docs with Node equivalents

### Task 18: Full verification
- `node --check` on every modified/new `.js` file
- `node scripts/setup-profile.js testuser` - verify directory structure
- `node scripts/test-answer-plan.js` - passes with mock data
- `node scripts/add-tabs-to-jobs.js --help` or just `node --check scripts/add-tabs-to-jobs.js`
- `node scripts/mark-run-results.js --help` or just `node --check scripts/mark-run-results.js`
- Clean up `profiles/testuser/`

## Rules
- CommonJS only
- Run `node --check <file>` after each file change
- Do NOT modify: `lib/answerPlan.js`, `lib/answerPolicy.js`, `lib/embedClassify.js`, `lib/formSchema.js`,
  `lib/text.js`, `lib/llmAnswerPlanner.js`, `platforms/*.js`
- PS1 files are deleted only after the Node replacement passes `node --check`