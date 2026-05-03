# Context: Clone-Ready Fixes

## Goal

Someone clones this repo and can go from zero to running the bot for themselves with a smooth, guided path.
No guessing file formats, no missing keys, no silent failures.

## Current state (post-parameterization)

The per-person structure works: `people/<slug>/` with `profile.md`, `answers.json`, `jobs.txt`, `config.json`.
The `--person` flag routes everything correctly. LLM gutted, PS1 scripts converted, validate script exists.

## Bugs found

### Bug 1: Dynamic fill passes wrong argument - `apply.js` line 203

```js
const dynamicFillResults = await adapter.fill(page, dynamicPlan, log, answers);
```

Should be:

```js
const dynamicFillResults = await adapter.fill(page, dynamicPlan, log, { aliases: CONFIG.optionAliases || {} });
```

`answers` is the raw answers object. The `fill()` signature expects `options = {}` with an `aliases` key.
This means dynamic fields (fields that appear after initial fill) never get option alias expansion —
they fall back to exact-match only.

### Bug 2: Option aliases only wired for school/discipline - `greenhouse.js` line 395

```js
if (key === "educationSchool" || key === "educationDiscipline" || /school|university|.../.test(label)) {
  const keyAliases = aliases[key] || [];
  candidates.push(...keyAliases);
}
```

Aliases are only looked up inside this one branch. If someone puts `"ethnicity": ["Asian"]` or
`"locationCity": ["Seattle, WA"]` in their `optionAliases`, those are ignored. The alias lookup should apply to all

### Bug 3: `locationCity` still has hardcoded Seattle - `greenhouse.js` line 385

```js
if (key === "locationCity" || /location city|\bcity\b/.test(label)) {
  if (/seattle/i.test(original)) candidates.push("Seattle", "Seattle, WA", "Seattle, Washington");
}
```

This is person-specific. Should come from `optionAliases.locationCity` in config instead.

### Bug 4: README references `educationAliases` in `answers.json`

The README tells users to put aliases in `answers.json` under an `educationAliases` key.
But the code reads aliases from `config.json` → `optionAliases`. The README is wrong.

## Missing pieces

### Missing 1: `setup-profile.js`

No scaffolding script. A new user has to manually create 4+ files with the exact right structure.
The `profile.md` format is particularly fragile — it needs specific markdown table keys, section headings
`## Resume` with a code block), and `**Field:**` patterns in work experience/education.

### Missing 2: Onboarding flow in README

The README says "Create `profile.md` with the applicant's resume and personal details" but
doesn't explain the required structure. A new user will write freeform markdown and the parser will
return empty strings for everything.

## Files to change

| File | Change type |
|------|-------------|
| `apply.js` line 203 | Bug fix — wrong argument to `adapter.fill()` |
| `platforms/greenhouse.js` `optionCandidates()` | Bug fix — aliases for all keys, remove hardcoded Seattle |
| `scripts/setup-profile.js` | New — scaffold person directory with templates |
| `README.md` | Fix — correct `educationAliases` reference, add onboarding flow |
| `scripts/validate-profile.js` | Enhancement — validate location format (city, state, country) |