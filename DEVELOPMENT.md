# Development

## Architecture

The bot follows this flow:

1. Load profile and reusable answers.
2. Open a job URL.
3. Detect the ATS adapter.
4. Extract a structured form schema.
5. Build an answer plan.
6. Fill only approved answers.
7. Save screenshots and logs.
8. Submit only in explicit submit mode.

## Main Files

- `apply.js`: run orchestration
- `lib/profile.js`: profile parsing
- `lib/answers.js`: reusable answer loading
- `lib/formSchema.js`: field extraction
- `lib/answerPlan.js`: field-to-answer mapping
- `platforms/index.js`: adapter selection
- `platforms/ashby.js`: Ashby-specific behavior
- `platforms/greenhouse.js`: Greenhouse-specific behavior
- `platforms/generic.js`: fallback adapter

## Current Adapter Support

- Greenhouse: active
- Ashby: active
- Generic fallback: basic
- Lever, Workday: not implemented yet

## Adding or Fixing Fields

Start from the latest `runs\<timestamp>\` folder. For the affected job, inspect:

- `job-*-form-schema.json`: what the adapter saw in the DOM.
- `job-*-answer-plan.json`: what answer was planned and whether manual review was required.
- `log.jsonl`: whether filling succeeded, failed, or a value did not persist.
- screenshots: whether the browser visually agrees with the log.

Use the artifact that failed to decide where the change belongs:

- If the field label is clear but mapped to no answer, update `lib/answerPlan.js`.
- If the answer should be reusable and not from the profile, add a key to `lib/answers.js` defaults and put the approved value in `answers.json`.
- If the field label or required state is wrong, update extraction in `lib/formSchema.js` or the specific ATS adapter.
- If the plan is correct but the page remains blank or unselected, fix filling behavior in `platforms/<ats>.js`.
- If a field needs an applicant-specific value, fill it only from an explicit approved source: profile data or `answers.json`. Do not infer it from nearby wording.

Do not hardcode applicant data in source files. Profile-derived answers belong in `Specs/sravya_narayana_application_profile.md`; reusable manually approved answers belong in `answers.json`.

### Answer Planning

`lib/answerPlan.js` is the shared decision layer. Prefer broad, stable question patterns when they are genuinely reusable across employers, such as:

- name, email, phone, location, resume, LinkedIn
- work authorization, sponsorship, demographics, and compensation when explicitly approved
- previous employment by the company
- relocation or hybrid-work comfort

Keep company-specific wording out of adapters when the underlying question is general. For example, "Have you ever worked for a Sony company previously?" maps to the reusable previous-employment answer, not a Sony-specific adapter rule.

For follow-up prompts like "If yes, explain...", do not infer an answer from unrelated profile fields. Leave the field manual or optional unless there is an explicit approved answer.

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

For narrow mapping changes, run syntax checks and replay the saved schema with `createAnswerPlan` if useful.

For adapter or fill behavior changes, run a dry run and inspect the latest artifacts. If the job is first in `jobs.txt`, use:

```powershell
npm.cmd run dry-run -- --limit 1
```

The dry run is successful only if:

- required planned fields are filled or selected in the screenshot
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

```powershell
node --check apply.js
node --check lib\profile.js
node --check lib\formSchema.js
node --check lib\answerPlan.js
node --check platforms\ashby.js
node --check platforms\greenhouse.js
npm.cmd run dry-run
```

Review the latest run folder before using submit mode.
