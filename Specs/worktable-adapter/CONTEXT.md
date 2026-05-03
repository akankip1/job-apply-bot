# Context: Workable Adapter

## Adapter interface

Every adapter exports: `name`, `detect(page)`, `extract(page)`, `fill(page, plan, log, options)`,
`nextButton(page)`, `submitButton(page)`.

Registered in `platforms/index.js` before `generic`. Answer mapping stays in `lib/answerPlan.js`.
DOM mechanics go in the adapter.

## Workable specifics

- URLs: `apply.workable.com/*/j/*`, `jobs.workable.com/*/*`
- Cookie consent banner blocks the form on first visit — must be dismissed before extraction
- Cookie banner is not Workable-specific — many ATS-hosted pages have them (OneTrust, CookieBot, custom).
- Should be handled generically in `apply.js` so all adapters benefit.
- Workable forms may use custom dropdowns, file upload widgets, and multi-step layouts that the generic
- `formSchema.js` extractor won't handle
- Need to inspect a live Workable form to map the actual DOM selectors

## Files to create/modify

| File | Action |
|------|--------|
| `platforms/workable.js` | New adapter |
| `platforms/index.js` | Register before `generic` |
| `apply.js` | Add generic cookie banner dismissal after `loadPage()` |

## What NOT to change

`lib/answerPlan.js`, `lib/formSchema.js`, `lib/profile.js`, `lib/answers.js`, other adapters.