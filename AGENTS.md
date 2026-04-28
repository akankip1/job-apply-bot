# AGENTS.md

Mandates and safety guidelines for AI coding agents working in this project. 

**Technical documentation, architecture, and developer workflows are located in [DEVELOPMENT.md](./DEVELOPMENT.md).**

## Core Mandates

### 1. Safety & Privacy First
- **Dry-Run Default:** real submission ONLY happens with `--submit`. Never modify this gate.
- **Local Data Only:** Applicant data (`profile.md`), resumes, and `answers.json` must remain local. Never add code that sends this data to external APIs.
- **No Hardcoding:** Never hardcode applicant-specific data in source files.

### 2. Source of Truth
- **Profile:** `Specs/sravya_narayana_application_profile.md`
- **Reusable Answers:** `answers.json`
- **Technical Reference:** `DEVELOPMENT.md`

### 3. Context & Efficiency
- **Surgical Edits:** Favor targeted `replace` calls over full-file overwrites.
- **Token Discipline:** Do not reread large artifacts (logs/screenshots) unless diagnosing a specific failure.
- **Quiet Commands:** Always use quiet flags (e.g., `npm install --silent`) to minimize output.

## Operational Safety Rules
- **No CAPTCHA Bypass:** Do not attempt to automate or bypass human verification widgets.
- **Submit Guard:** Unknown required fields MUST block submission.
- **Sensitive Data:** Salary, background-check, or legal fields must require manual review unless an explicit answer source exists.

## Implementation Standards
- **CommonJS:** Use `require(...)` and `module.exports`.
- **Decoupling:** Keep answer mapping in `lib/answerPlan.js` and DOM quirks in `platforms/*`.
- **Idempotency:** Ensure filling logic is idempotent (check state before clicking/filling).

## Hand-off Checklist
Before finishing a task, ensure:
1. `node --check` passes for all modified files.
2. `node scripts/test-answer-plan.js` passes for mapping changes.
3. A successful dry run is verified via `log.jsonl` and screenshots.
