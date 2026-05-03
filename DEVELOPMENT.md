# Development

## Architecture

The bot follows this flow:

1. Load profile, config, and reusable answers for the given `--person`.
2. Open a job URL.
3. Detect the ATS adapter.
4. Extract a structured form schema.
5. Build an answer plan.
6. Fill only approved answers.
7. Save logs and run artifacts.
8. Submit only in explicit submit mode.

## Main Files

- `apply.js`: run orchestration
- `lib/config.js`: per-person config (`nearbyCities`, `optionAliases`)
- `lib/profile.js`: profile parsing
- `lib/answers.js`: reusable answer loading
- `lib/formSchema.js`: field extraction
- `lib/answerPlan.js`: field-to-answer mapping
- `lib/embedClassify.js`: semantic label classification support
- `platforms/index.js`: adapter selection
- `platforms/ashby.js`: Ashby-specific behavior
- `platforms/greenhouse.js`: Greenhouse-specific behavior
- `platforms/generic.js`: fallback adapter
- `scripts/setup-profile.js`: scaffold a new `people/<name>/` profile
- `scripts/validate-profile.js`: validate profile, answers, and config structure
- `scripts/add-tabs-to-jobs.js`: merge clipboard job URLs into `jobs.txt`
- `scripts/mark-run-results.js`: move processed URLs into applied/failed/skipped queues

## Current Adapter Support

- Greenhouse: active
- Ashby: active
- Workable: active
- Generic fallback: basic
- Lever, Workday: not implemented yet

## Adding or Fixing Fields

Start from the latest run folder `people/<name>/runs/<timestamp>/`. For the affected job, inspect:

- `job-*-form-schema.json`: what the adapter saw in the DOM.
- `job-*-answer-plan.json`: what answer was planned and whether manual review was required.
- `log.jsonl`: whether filling succeeded, failed, or a value did not persist.

Use the artifact that failed to decide where the change belongs:

- If the field label is clear but mapped to no answer, update `lib/answerPlan.js`.
- If the answer should be reusable and not from the profile, add a key to `lib/answers.js` defaults and put the approved value in `answers.json`.
- If the field label or required state is wrong, update extraction in `lib/formSchema.js` or the specific ATS adapter.
- If the plan is correct but the page remains blank or unselected, fix filling behavior in `platforms/<ats>.js`.
- If a field needs an applicant-specific value, fill it only from an explicit approved source: profile data or `answers.json`. Do not infer it from nearby wording.
- If a dropdown option needs an alias (e.g. a school name in a different format), add it to `optionAliases` in `people/<name>/config.json` keyed by `decision.key`.

Do not hardcode applicant data in source files. Profile-derived answers belong in `people/<name>/profile.md`; reusable manually approved answers belong in `people/<name>/answers.json`; per-person config (location groups, option aliases) belongs in `people/<name>/config.json`.

### Hybrid Answer Planning (LLMification)

The decision layer (`lib/answerPlan.js`) uses a **Hybrid Multi-Layer Decision System** to map form fields to profile data. This architecture replaces fragile regex chains with a robust, intent-based approach.

#### Layer 1: Semantic Embedding Classifier (Primary)
- **Engine:** Local `all-MiniLM-L6-v2` transformer model via `@xenova/transformers`.
- **Reference Set:** A harvested knowledge base of ~130 "Gold Standard" questions (`lib/reference-questions.json`).
- **Mechanism:** Form labels are converted into vectors and compared against the reference set using cosine similarity. A match with a score > 0.85 is considered a "high-confidence intent match."
- **Benefits:** Seamlessly handles semantic variations (e.g., "Where are you based?" vs. "Current Location") and provides stable field identity across form re-renders.

#### Layer 2: Declarative Rule Engine (Overrider)
- **Engine:** The `RULES` table in `lib/answerPlan.js`.
- **Use Case:** Specialized logic that semantic matching cannot handle alone, such as word-boundary checks for "major" (to avoid education vs. disability conflicts) or complex range mapping for years of experience.
- **Priority:** Explicit rules always take precedence over semantic matches.

#### Layer 3: Manual Review Fallback (Safety)
- **Mechanism:** If no high-confidence match is found in either layer, the field is marked for `manualReview`.
- **Submit Guard:** Any field in this state blocks automated submission, ensuring the bot never "hallucinates" an answer for a sensitive or unknown field.

**Testing Mapping:**
Always run the regression test after changing rules or references. This catches mapping conflicts in milliseconds:

```bash
# Run against a saved schema from a dry run
node scripts/test-answer-plan.js "people/john-doe/runs/<timestamp>/job-1-step-0-form-schema.json"
# Or run with real profile data
node scripts/test-answer-plan.js --person john-doe
```

### Classifier Maintenance

The classifier depends on a precomputed reference set and a local transformer model.

- **Harvesting New References:** If you encounter new form questions, you can "teach" the classifier by harvesting mappings from recent successful dry runs:
  ```bash
  node scripts/build-reference.js --person john-doe
  ```
- **Building Embeddings:** To precompute the vector representation of the reference questions (required for similarity matching):
  ```bash
  node scripts/build-embeddings.js
  ```
- **Model Storage:** The `all-MiniLM-L6-v2` model is stored in the local `@xenova/transformers` cache. If you clear `node_modules`, `build-embeddings.js` will re-download it.

### Platform Behavior

ATS adapters should handle DOM mechanics only:

- detecting the platform
- extracting fields that generic extraction misses
- selecting dropdown/autocomplete options
- clicking button groups or checkboxes
- verifying values that frontend code may overwrite
- finding safe next and submit buttons

Greenhouse and Ashby both render some dropdowns as text inputs. A successful `locator.fill()` does not always mean the application accepted the value, so adapters should verify the final visible or DOM value when practical. If a site exposes a dropdown option list, select an option from that list instead of leaving typed text in the input.

For new ATS adapters:

1. Add `platforms\<ats>.js`.
2. Implement `name`, `detect`, `extract`, `fill`, `nextButton`, and `submitButton`.
3. Register the adapter before `generic` in `platforms\index.js`.
4. Reuse shared schema extraction from `lib/formSchema.js` when possible.
5. Keep answer mapping in `lib/answerPlan.js`, not the adapter.

### Verification Workflow

For mapping changes in `lib/answerPlan.js`, always run the regression test first. This catches regex mismatches and priority conflicts in milliseconds without a browser:

```bash
node scripts/test-answer-plan.js --person john-doe
# or against a specific schema
node scripts/test-answer-plan.js "people/john-doe/runs/<timestamp>/job-1-step-0-form-schema.json"
```

For adapter or fill behavior changes, run a dry run and inspect the latest artifacts:

```bash
node apply.js --person john-doe --limit 1
```

The dry run is successful only if:

- required planned fields are filled or selected in the live form and reflected in the saved logs/artifacts
- `manualReview` contains only intentionally manual fields
- `log.jsonl` has no `field_fill_failed` or unexpected `value_not_persisted`
- the final status is `dry_run_completed`

## Notes

- Keep company-specific hacks out of adapters.
- Add ATS-specific behavior only when it is platform-level.
- Keep answer decisions in `lib/answerPlan.js`.
- Keep DOM quirks inside `platforms/*`.
- Add comments only for non-obvious behavior.

## Test Checklist

Run before committing:

```bash
# Syntax checks
node scripts/check-syntax.js

# Logic check (Mapping)
node scripts/test-answer-plan.js --person john-doe

# Integration check (Browser)
node apply.js --person john-doe --limit 1
```

Review the latest run folder before using submit mode.
