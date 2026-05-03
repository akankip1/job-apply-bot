# Prompt: Clone-Ready Fixes

## Objective

Fix 3 bugs and add the scaffolding script so someone can clone this repo and set up their own profile seamlessly.

## Before you start

Read `Specs/clone-ready/CONTEXT.md` for the bugs and gaps, then `Specs/clone-ready/PLAN.md`
for the task list.

## Tasks (6 total, single session)

1. Fix `apply.js` line 203 — wrong argument to `adapter.fill()` for dynamic fields
2. Fix `platforms/greenhouse.js` `optionCandidates()` — aliases for all keys, remove hardcoded Seattle
3. Create `scripts/setup-profile.js` — scaffolds `people/<name>/` with template files
4. Enhance `scripts/validate-profile.js` — location format, work experience, education checks
5. Update `package.json` — add `setup-profile` script
6. Fix `README.md` — correct aliases docs, add onboarding flow

## Rules

- CommonJS only (`require`/`module.exports`)
- Run `node --check <file>` after each file change
- Do NOT modify: `lib/answerPlan.js`, `lib/answerPolicy.js`, `lib/embedClassify.js`, `lib/formSchema.js`,
- `lib/text.js`, `lib/llmAnswerPlanner.js`, `lib/config.js`, `lib/profile.js`, `lib/answers.js`, `lib/io.js`,
- `platforms/ashby.js`, `platforms/index.js`
- The `profile.md` template in `setup-profile.js` must use the exact field names that `lib/profile.js`
- parses (see `parseMarkdownTable` key lookups and `section()` heading matches)
- Keep the `--submit` safety gate intact
- No hardcoded applicant data in source files

## Verification

```bash
node --check apply.js
node --check platforms/greenhouse.js
node --check scripts/setup-profile.js
node --check scripts/validate-profile.js
node scripts/setup-profile.js testuser
# Verify people/testuser/ has: config.json, profile.md, answers.json, jobs.txt
node scripts/validate-profile.js --person testuser
# Should report errors for empty profile fields — that's expected
rm -rf people/testuser
```