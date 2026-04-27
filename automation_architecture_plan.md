# Job Application Automation Architecture Plan

## Decision

Stop expanding the current generic regex-based filler. It is useful as a prototype, but it is too brittle for real job applications.

The next version should use a structured pipeline:

1. Extract the form schema.
2. Resolve answers locally.
3. Fill the page from an approved answer plan.
4. Stop for manual review when required answers are unknown.
5. Submit only in explicit submit mode.

## Why

Job application pages are semi-structured, not standardized. The current generic approach fails because pages use:

- ATS-specific embedded forms and iframes
- custom dropdowns and autocompletes
- hidden inputs
- long-form questions
- conditional required fields
- resume upload widgets
- legal and demographic questions with different wording

Adding one-off fixes for every company would become unmaintainable. The better unit of customization is the ATS platform, not the company.

## Target Architecture

### 1. Core Engine

Responsibilities:

- read `jobs.txt`
- read applicant profile
- launch browser
- detect platform
- call the correct adapter
- save logs and screenshots
- enforce dry-run by default
- enforce submit guardrails

The core engine should not decide what a field means.

### 2. ATS Adapters

Adapters handle platform-specific page structure and DOM quirks.

Initial adapters:

- Greenhouse
- Lever
- Ashby
- Workday
- Generic fallback

Start with Greenhouse because the current Navan test page uses a Greenhouse embedded form.

Adapter responsibilities:

- find the real application frame or form root
- extract fields
- extract labels/questions
- extract required flags
- extract field types
- extract dropdown/radio/checkbox options
- upload files when the answer plan says to upload
- execute fill actions by stable field identifiers

Adapters should not invent answers.

### 3. Form Schema Extraction

Instead of immediately filling fields, first produce a structured schema:

```json
{
  "platform": "greenhouse",
  "jobTitle": "New College Grad Software Engineer (Backend)",
  "company": "Navan",
  "fields": [
    {
      "id": "first_name",
      "label": "First Name",
      "required": true,
      "type": "text",
      "options": [],
      "frameUrl": "https://job-boards.greenhouse.io/embed/job_app..."
    },
    {
      "id": "question_65193500",
      "label": "Are you currently eligible to work in the country outlined for this position, and authorized to work for Navan on an ongoing indefinite basis?",
      "required": true,
      "type": "select",
      "options": ["Yes", "No"],
      "frameUrl": "https://job-boards.greenhouse.io/embed/job_app..."
    }
  ]
}
```

This schema should be written to the run folder for debugging.

### 4. Answer Plan

Resolve answers before touching the page.

Inputs:

- applicant profile
- `answers.json`
- strict mapping rules
- optional AI classifier later

Output:

```json
{
  "fieldId": "question_65193500",
  "label": "Are you currently eligible to work...",
  "answer": "Yes",
  "source": "profile.workAuthorization.us",
  "confidence": "high",
  "safeToFill": true
}
```

Unknown required fields should become manual-review items:

```json
{
  "fieldId": "question_65193499",
  "label": "How did you hear about this job?",
  "required": true,
  "safeToFill": false,
  "reason": "missing_answer"
}
```

The answer plan should also be written to the run folder.

### 5. Answer Memory

Add `answers.json` for reusable manual answers.

Example:

```json
{
  "how_did_you_hear": "LinkedIn",
  "previously_employed_by_company": "No",
  "comfortable_with_hybrid_or_relocation": "Yes"
}
```

When a required question is unknown, the tool should report it clearly. After the user adds the answer to `answers.json`, future runs can reuse it.

### 6. AI Usage

Do not train a custom AI model right now.

Use AI later only as a classifier, not as a browser operator.

AI may help classify:

- field meaning
- sensitive question category
- whether an option matches an intended answer
- whether a required question needs manual review

AI must return structured JSON decisions. The script should enforce guardrails and execute only approved high-confidence actions.

AI should never directly click submit.

### 7. Submission Guardrails

Dry-run remains the default.

Submit only when run with:

```powershell
npm.cmd run submit
```

Before submit:

- all required fields must be filled or explicitly marked safe
- no unknown required fields may remain
- no low-confidence AI answers may be used
- no sensitive field may be guessed
- resume upload must be complete if required
- screenshot must be saved before final submit
- submit button must be clearly identified

## Immediate Next Steps

1. Refactor current `apply.js` into modules.
2. Add a Greenhouse adapter.
3. Add form schema extraction.
4. Add `answers.json`.
5. Add answer-plan generation.
6. Fill the page only from the answer plan.
7. Keep screenshots and JSONL logs in `runs/<timestamp>/`.

## Non-Goals For Now

- Do not train a custom AI model.
- Do not build one-off company-specific patches.
- Do not submit applications automatically without explicit submit mode.
- Do not bypass CAPTCHA, login barriers, or bot protections.
