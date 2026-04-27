Build a local Playwright-based job application automation script.

Project files:
- `sravya_narayana_application_profile.md` contains the applicant profile and is the source of truth.
- `jobs.txt` contains job application URLs, one per line. Ignore blank lines and lines starting with `#`.
- Resume path is read from the profile. Do not hardcode applicant details in the script.

Requirements:
1. Read application links from `jobs.txt`.
2. Read applicant information from `sravya_narayana_application_profile.md`.
3. Open each job application URL in Chromium.
4. Fill standard fields only when clearly covered by the profile:
    - first name
    - last name
    - preferred name
    - email
    - phone
    - location
    - address
    - postal code
    - LinkedIn
    - GitHub, if present
    - portfolio, if present
    - current title
    - current employer
    - work experience
    - education
    - skills
5. Upload the resume if a file upload field is present and the profile resume file exists.
6. Fill these exact sensitive answers only when the form explicitly asks the equivalent question:
    - ethnicity: South Asian
    - authorized to work in US: Yes
    - authorized to work in Canada: No
    - authorized to work in United Kingdom: No
    - requires sponsorship now or in future: Yes
    - disability: No
    - LGBTQ+: No
    - gender: Female
    - veteran: No
7. Do not invent, infer, or guess answers.
8. Do not answer questions that are not clearly covered by the profile.
9. Do not bypass CAPTCHA, login barriers, human verification, paywalls, or bot protections. Pause and log the blocker.
10. Save a screenshot after opening each application, after filling each major page, and at the final review/submission step.
11. By default, do not submit. Dry run is the safe default.
12. Add submit mode that submits only when run with `--submit`.
13. In submit mode, submit only if all required fields were filled from the profile or safely skipped according to the rules.
14. If required fields remain unanswered, stop before submission, log them, and leave the browser open for manual review.
15. Log every field filled, every field skipped, every page URL visited, resume upload status, screenshots, blockers, and final status.
16. Save run artifacts under `./runs/<timestamp>/`, with logs in `log.jsonl` and screenshots in `screenshots/`.
17. Use robust Playwright selectors based on labels, placeholders, aria-labels, visible text, input names, and nearby field text.
18. Add npm scripts:
    - `npm run dry-run`
    - `npm run submit`

Generate the full project files.
