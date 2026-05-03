# Plan: Workable Adapter

## Task 1: Generic cookie banner dismissal - `apply.js`

- [ ] Add `async function dismissCookieBanner(page)` - tries common cookie accept selectors:
    - `#onetrust-accept-btn-handler` (OneTrust - most common)
    - `button:has-text("Accept all")`, `button:has-text("Accept cookies")`, `button:has-text("Accept")`
    - `[data-testid*="cookie"] button`, `.cookie-consent button`,
    - `#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll` (CookieBot)
    - Click first visible match, wait 500ms, return
    - If none visible within 2s, return silently (no banner = no problem)
- [ ] Call it in `processJob()` after `loadPage()` succeeds, before the step loop
- [ ] Log: `log("cookie_banner_dismissed", { jobIndex })` or `log("no_cookie_banner", { jobIndex })`
- [ ] Verify: `node --check apply.js`
- **File:** `apply.js`

## Task 2: Create `platforms/workable.js`

- [ ] `detect(page)` - match `workable.com` in any frame URL or page URL
- [ ] `extract(page)`:
    - Use `extractFieldsFromFrame` from `lib/formSchema.js` as base
    - Workable renders forms in the main frame (no iframes like Greenhouse)
    - Extract job title from `h1` or `[data-ui="job-title"]`
    - Extract company from header/logo area
    - Handle Workable's custom select widgets: they render as `<div>` with `role="listbox"` or
    - `role="combobox"` - these won't be caught by the generic `input, textarea, select` selector.
    - Extract them as virtual fields with `type: "select"` and their visible options
    - Handle file upload inputs (resume) - Workable may use a custom upload widget wrapping a hidden
    - `<input type="file">`
- [ ] `fill(page, plan, log, options)`:
    - For standard text/email/tel inputs: reuse greenhouse's `fill` logic or implement directly
    - (fill, verify, retry)
    - For custom select widgets: click to open, find matching option by text, click it
    - For radio/checkbox groups: find by label text, click
    - For file uploads: locate the hidden `<input type="file">` and use `setInputFiles`
    - Pass `options.aliases` through to `optionCandidates` if reusing greenhouse's function
- [ ] `nextButton(page)` - look for "Next", "Continue", "Save and continue" buttons
- [ ] `submitButton(page)` - look for "Submit", "Submit application" buttons
- [ ] Verify: `node --check platforms/workable.js`
- **File:** `platforms/workable.js` (new)

**Important:** The exact selectors depend on Workable's actual DOM. The implementer MUST:
1. Run a dry run with `--limit 1` against a real Workable URL using the generic adapter first
2. Inspect the `form-schema.json` to see what the generic extractor catches
3. Inspect screenshots to see what's missing
4. Use browser DevTools on a live Workable form to find the correct selectors
5. Build/iterate the adapter based on real DOM inspection

## Task 3: Register adapter - `platforms/index.js`

- [ ] `const workable = require("./workable");`
- [ ] Add to `adapters` array: `[ashby, greenhouse, workable, generic]`
- [ ] Verify: `node --check platforms/index.js`
- **File:** `platforms/index.js`

## Task 4: Test and iterate

- [ ] Add a Workable job URL to `people/<name>/jobs.txt`
- [ ] Run: `node apply.js --person <name> --limit 1`
- [ ] Check `form-schema.json` - are all visible fields captured?
- [ ] Check `answer-plan.json` - are fields mapped correctly?
- [ ] Check screenshots - are fields filled visually?
- [ ] Fix extraction/fill issues based on artifacts
- [ ] Repeat until dry run completes with no unexpected blockers

## Task 5: Update docs

- [ ] `DEVELOPMENT.md` - add Workable to "Current Adapter Support" (active)
- [ ] `README.md` - mention Workable support if there's a supported platforms section
- **Files:** `DEVELOPMENT.md`, `README.md`

## Verification

```bash
node --check apply.js
node --check platforms/workable.js
node --check platforms/index.js
# Dry run against a real Workable URL
node apply.js --person <name> --limit 1
# Inspect runs/<latest>/form-schema.json, answer-plan.json, screenshots
```