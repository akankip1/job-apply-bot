# Prompt: Workable Adapter

## Objective

Add Workable ATS support and generic cookie banner dismissal.

## Specs

1. `Specs/workable-adapter/CONTEXT.md` - adapter interface, Workable specifics
2. `Specs/workable-adapter/PLAN.md` - 5 tasks

## Critical: DOM inspection required

Task 2 (the adapter itself) cannot be fully implemented from specs alone. The exact selectors for
Workable's custom dropdowns, file uploads, and form layout must come from inspecting a live Workable
application page. The plan describes what to look for — the implementer must run a dry run,
inspect artifacts and DevTools, then build the selectors iteratively.

## Rules

- CommonJS only
- `node --check` after each file change
- Do NOT modify: `lib/answerPlan.js`, `lib/formSchema.js`, `lib/profile.js`, `lib/answers.js`,
- `platforms/ashby.js`, `platforms/greenhouse.js`
- Cookie dismissal goes in `apply.js` (generic, benefits all adapters)
- Answer mapping stays in `lib/answerPlan.js` — the adapter only handles DOM mechanics
- Reuse `extractFieldsFromFrame` from `lib/formSchema.js` as the base extractor
- Reuse greenhouse's `fill`, `nextButton`, `submitButton` as fallbacks where Workable's DOM matches
- standard patterns

## Verification

```bash
node --check apply.js
node --check platforms/workable.js
node --check platforms/index.js
node apply.js --person <name> --limit 1  # against a Workable URL
```