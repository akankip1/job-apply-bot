# Plan: Clone-Ready Fixes

Single session — 6 tasks, all independent except Task 6 depends on Task 3.

## Task 1: Fix dynamic fill argument - `apply.js`

- [ ] Line 203: change `adapter.fill(page, dynamicPlan, log, answers)` → `adapter.fill(page, dynamicPlan, log, { aliases: CONFIG.optionAliases || {} })`
- [ ] Verify: `node --check apply.js`
- **File:** `apply.js`

## Task 2: Fix option aliases for all keys - `platforms/greenhouse.js`

- [ ] In `optionCandidates(answer, decision, aliases = {})`: move the alias lookup out of the school/discipline branch so it applies to every key
- [ ] Remove the hardcoded Seattle city variants (`if (/seattle/i.test(original))...`)
- [ ] The alias lookup should be near the top, right after `const candidates = [original];`

const keyAliases = aliases[key] || [];
if (keyAliases.length) candidates.push(...keyAliases);

- [ ] Keep all generic ATS expansions (country USA variants, degree Master's/Bachelor's, disability, privacy policy, work authorization, etc.) — these are platform-specific, not person-specific
- [ ] Verify: `node --check platforms/greenhouse.js`
- **File:** `platforms/greenhouse.js`

## Task 3: Create `scripts/setup-profile.js`

- [ ] Accept person name as `process.argv[2]`
- [ ] Validate: non-empty, no path separators, no spaces (slug-friendly)
- [ ] Create `people/<name>/` directory
- [ ] Write `config.json` with empty `nearbyCities` and `optionAliases`
- [ ] Write `answers.json` with all 28 DEFAULT_ANSWERS keys (import from `../lib/answers.js` or inline)
- [ ] Write `jobs.txt` with comment header
- [ ] Write `profile.md` template with:
    - Personal Information table with all expected keys as empty values: `First Name`, `Last Name`,
    - `Preferred Name`, `Email Address`, `Phone Number`, `Location` (with comment: "City, State, Country"),
    - `Address`, `Postal Code`, `Years of experience`
    - Employment Information table with all sensitive question keys as empty values
    - Portfolio & Links table: `LinkedIn URL`, `GitHub URL`, `Portfolio URL`
    - `## Resume` section with empty code block
    - `## Cover Letter` section with empty code block
    - `# Work Experience` section with example entry showing `**Title:**`, `**Company:**`, `**Location:**`,
    - `**Dates:**` format
    - `# Education` section with example entry showing `**School:**`, `**Dates:**`, `**Degree:**` format
    - `# Skills` section with example subsections
- [ ] Print next steps to stdout:

Created people/<name>/

Next steps:
1. Fill in people/<name>/profile.md with your details
2. Fill in people/<name>/answers.json with your reusable answers
3. Add job URLs to people/<name>/jobs.txt
4. Validate: node scripts/validate-profile.js --person <name>
5. Dry run: node apply.js --person <name> --limit 1

- [ ] Verify: `node --check scripts/setup-profile.js`
- [ ] Verify: `node scripts/setup-profile.js testuser` creates correct structure, then
- `rm -rf people/testuser`
- **File:** `scripts/setup-profile.js` (new)

## Task 4: Enhance `scripts/validate-profile.js`

- [ ] Add location format check: warn if `location` doesn't contain at least one comma (expected "City, State, Country")
- [ ] Add work experience check: warn if no `**Title:**` found in Work Experience section
- [ ] Add education check: warn if no `**School:**` found in Education section
- [ ] Verify: `node --check scripts/validate-profile.js`
- **File:** `scripts/validate-profile.js`

## Task 5: Update `package.json`

- [ ] Add `"setup-profile": "node scripts/setup-profile.js"` to scripts
- [ ] Verify: `node --check package.json` (or just verify valid JSON)
- **File:** `package.json`

## Task 6: Fix README onboarding

- [ ] Remove the `educationAliases` in `answers.json` example — aliases belong in
- `config.json` → `optionAliases`
- [ ] Replace "Setting up a new person" section with:

### Setting up a new person

1. Run: `node scripts/setup-profile.js <name>`
2. Fill in `people/<name>/profile.md` with your details
3. Fill in `people/<name>/answers.json` with your reusable answers
4. (Optional) Add dropdown aliases to `people/<name>/config.json`:

{
"optionAliases": {
"educationSchool": ["Your University Full Name", "Alternate Name"],
"locationCity": ["Your City", "Your City, ST"]
},
"nearbyCities": {
"yourcity": ["nearby1", "nearby2"]
}
}

5. Validate: `node scripts/validate-profile.js --person <name>`
6. Add job URLs to `people/<name>/jobs.txt`
7. Dry run: `node apply.js --person <name> --limit 1`

- [ ] Update the "Commands" section: remove "No --person flag →
- reads from the project root (legacy behavior)" — there is no legacy fallback, `--person` is required
- **File:** `README.md`

## Verification

After all tasks:

node --check apply.js
node --check platforms/greenhouse.js
node --check scripts/setup-profile.js
node --check scripts/validate-profile.js
node scripts/setup-profile.js testuser
node scripts/validate-profile.js --person testuser  # should show expected errors for empty template
rm -rf people/testuser