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
- `platforms/greenhouse.js`: Greenhouse-specific behavior
- `platforms/generic.js`: fallback adapter

## Current Adapter Support

- Greenhouse: active
- Generic fallback: basic
- Lever, Ashby, Workday: not implemented yet

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
node --check platforms\greenhouse.js
npm.cmd run dry-run
```

Review the latest run folder before using submit mode.
