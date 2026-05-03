# Session 1: Core Parameterization (Tasks 1-6)

## Objective

Move all person-specific data under `profiles/<slug>/` and wire the bot to load from there via
`--profile <slug>`.

## Before you start

Read these specs in order:
1. `.kiro/specs/parameterize-per-person/CONTEXT.md` - current architecture and coupling points
2. `.kiro/specs/parameterize-per-person/DESIGN.md` - read sections: "Directory-per-person", "Config schema",
   "Person selection", "New module: lib/config.js", "Signature changes", "Run output separation",
   "Browser profile separation", "New script: setup-profile.js"
3. `.kiro/specs/parameterize-per-person/PLAN.md` - Tasks 1-6 only

## Tasks

1. Create `lib/config.js` - config loader with `loadConfig(slug)`, `resolveDefaultSlug()`,
   `parseProfileArg(argv)`
2. Modify `lib/profile.js` - change `loadProfile(root)` → `loadProfile(profilePath)`
3. Modify `lib/answers.js` - change `loadAnswers(root)` → `loadAnswers(answersPath)`
4. Modify `lib/io.js` - change `readJobs(root)` → `readJobs(jobsPath)`
5. Modify `apply.js` - import config, parse `--profile`, wire resolved paths, separate runs and
   browser profile per slug
6. Create `scripts/setup-profile.js` - scaffold `profiles/<slug>/` with template files
7. Create `scripts/validate-profile.js` - build-time validation: config schema, file existence,
   profile content, answers completeness, resume/cover letter paths

## Rules

- CommonJS only (`require`/`module.exports`)
- Run `node --check <file>` after each file change
- Do NOT modify: `lib/answerPlan.js`, `lib/answerPolicy.js`, `lib/llmAnswerPlanner.js`,
  `lib/embedClassify.js`, `lib/formSchema.js`, `lib/text.js`, `platforms/*.js`
- No hardcoded applicant data in source files
- Keep the `--submit` safety gate intact
- When changing function signatures, update all call sites

## Verification (before stopping)

```bash
node --check lib/config.js
node --check lib/profile.js
node --check lib/answers.js
node --check lib/io.js
node --check apply.js
node --check scripts/setup-profile.js
node --check scripts/validate-profile.js
node scripts/setup-profile.js testuser
# Verify profiles/testuser/ has: config.json, application_profile.md, answers.json, jobs.txt
node scripts/validate-profile.js testuser
# Should report errors for empty profile fields (expected — template has placeholders)
rm -rf profiles/testuser
```