# Session 2: Code Cleanup (Tasks 7-10)

## Objective

Three surgical fixes: gut the LLM model call, remove the Ashby global singleton, and move person-specific
option aliases to config.

## Before you start
If you have already read the files, don't read them again unless necessary. If you haven't then:
Read these specs in order:
1. `.kiro/specs/parameterize-per-person/CONTEXT.md` - read "Additional problems to fix" sections
2. `.kiro/specs/parameterize-per-person/DESIGN.md` - read the four decision sections at the bottom:
   LLM replacement, globallyFilledKeys removal, option aliases, PS1→Node (for context only -
   PS1 conversion is session 3)
3. `.kiro/specs/parameterize-per-person/PLAN.md` - Tasks 7-10 only

## Prerequisite

Session 1 must be complete. `lib/config.js` exists and `apply.js` uses `loadConfig()`. Verify:
```bash
node --check lib/config.js
node --check apply.js
```

## Tasks

### Task 7: Gut LLM model call - `lib/llmAnswerPlanner.js`
- remove `getGenerator()`, `generator`, `MODEL_NAME`, `buildPrompt()`, and the `pipeline` import
- remove the hardcoded `NEARBY_CITY_GROUPS` constant and the `florida`/`seattle` hack
- rename `fallbackLocationAnswer()` → `resolveLocationAnswer(field, profile)` - read nearby cities
- from `profile.nearbyCities` instead of module-level constant
- rewrite `planAnswer()`: call `resolveLocationAnswer()` directly, wrap in `normalizeResponse()`, return
- keep `normalizeResponse()`, `optionMatch()` unchanged
- **critical:** The `planAnswer(field, profile, answers, schema, logger)` export signature must NOT change
- `lib/answerPlan.js` calls it and is not being modified

### Task 7b: Attach `nearbyCities` to profile - `apply.js`
- After `loadConfig()` and `loadProfile()`, add: `profile.nearbyCities = config.nearbyCities || {}`
- This threads the config value through the existing `profile` argument without changing any function
- signatures

### Task 8: Remove global state - `platforms/ashby.js`
- Delete `const globallyFilledKeys = new Set()` at module scope
- Delete the `fillIfNew()` wrapper function
- For resume uploads: check if file input already has a value before uploading
- For text fields: `fillTextAndVerify()` already checks current value - no change needed
- For button groups: `clickAshbyButtonGroup()` already checks `isChecked` - call directly
- Keep the fill ordering: location first → greenhouse-handled → text → button groups

### Task 9: Extract option aliases - `platforms/greenhouse.js`
- Add `aliases` parameter to `optionCandidates(answer, decision, aliases = {})`
- Remove hardcoded person-specific entries: Binghamton, Amrita, Electronics and Communication
- Add `const keyAliases = aliases[decision.key] || []; candidates.push(...keyAliases);`
- Keep all generic ATS expansions (Yes→"I am authorized...", disability No→"No, I do not have...",
  country USA variants, degree variants, etc.)
- Update `fillComboboxLikeField()` to pass aliases through to `optionCandidates()`
- Update `fill()` signature: `fill(page, plan, log, options = {})` where `options.aliases` is the map

### Task 10: Thread aliases through adapters
- `platforms/ashby.js`: `fill()` accepts `options = {}`, forwards to `greenhouse.fill(page, remainingPlan,
log, options)`
- `platforms/generic.js`: update `fill` export to forward options
- `apply.js`: pass `{ aliases: config.optionAliases || {} }` to all `adapter.fill()` calls

## Rules

- `fill()` signature changes must be backward-compatible - existing calls without `options` must still
- work (use default parameter `options = {}`)
- Do NOT modify: `lib/answerPlan.js`, `lib/answerPolicy.js`, `lib/embedClassify.js`, `lib/formSchema.js`,
- `lib/text.js`
- Run `node --check <file>` after each file change

## Verification (before stopping)

```bash
node --check lib/llmAnswerPlanner.js
node --check platforms/ashby.js
node --check platforms/greenhouse.js
node --check platforms/generic.js
node --check apply.js
node scripts/test-answer-plan.js  # must still pass with mock data
```