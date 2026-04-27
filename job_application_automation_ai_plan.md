# Job Application Automation Plan for AI Agent

Goal: Build a local Playwright-based job application automation system that opens job application links, fills known application fields from application_profile.md, uploads the resume when a resume upload field exists, skips unknown fields, saves logs and screenshots, and submits only when explicitly run in submit mode.

Treat application_profile.md as the single source of truth for applicant data.

Project structure checklist:

- Use this project structure: job-apply-bot/application_profile.md, job-apply-bot/jobs.txt, job-apply-bot/apply.js, job-apply-bot/package.json, job-apply-bot/logs/, job-apply-bot/screenshots/.
- Do not hardcode applicant details inside apply.js.
- Do not duplicate applicant profile values in the automation plan.
- Load or parse applicant data from application_profile.md at runtime.
- Read application URLs from jobs.txt.
- Save logs inside logs/.
- Save screenshots inside screenshots/.

Applicant data rule:

- Treat application_profile.md as the only source of truth.
- Do not hardcode name, email, phone, address, work authorization, sponsorship, demographic answers, work history, education, skills, links, or resume path.
- Parse required fields from application_profile.md.
- If a field is clearly present in the profile, use it.
- If a field is missing, skip it and log it as missing_profile_data.
- If a field has multiple possible values, skip it and log it as ambiguous_profile_data.
- If a field asks something not covered by the profile, skip it and log it as unknown_question.

Input files:

- Use application_profile.md for all applicant details.
- Extract these categories if present: Personal Info, Contact Info, Location / Address, Employment Information, Work Authorization, Sponsorship, Demographic / Self-identification Answers, Resume Path, Work Experience, Education, Portfolio Links, Skills.
- Read one job application URL per line from jobs.txt.
- Ignore blank lines in jobs.txt.
- Ignore lines starting with # in jobs.txt.
- Process jobs one at a time.
- Log each URL before opening it.

Application filling rules:

- Open each job application link in Chromium using Playwright.
- Wait for the page to load.
- Detect visible input fields, dropdowns, radio buttons, checkboxes, textareas, and file uploads.
- Match fields using label text, placeholder, aria-label, input name, input id, nearby visible text, button text, and select option text.
- Fill only fields that clearly match data from application_profile.md.
- Do not guess.
- Do not invent experience, dates, skills, certifications, immigration status, demographic answers, or salary data.
- Log every filled field.
- Log every skipped field.
- Log every page URL visited.

Standard fields to fill from profile:

- First name.
- Last name.
- Preferred name.
- Email address.
- Phone number.
- City.
- State.
- Country.
- Address.
- Postal code.
- LinkedIn URL.
- GitHub URL, if present.
- Portfolio URL, if present.
- Current job title.
- Current employer.
- Work experience.
- Education.
- Skills.
- Resume upload.

Sensitive fields rule:

- The automation may fill sensitive fields only when the exact answer is clearly present in application_profile.md.
- Sensitive fields include work authorization, sponsorship requirement, ethnicity, gender, disability status, veteran status, LGBTQ+ self-identification, background check questions, legal certification questions, and salary expectations.
- If the exact answer is not clearly present, do not answer the field.
- If the exact answer is not clearly present, skip the field.
- If the exact answer is not clearly present, log it as sensitive_field_needs_confirmation.
- Never guess sensitive field answers.

Resume upload rule:

- Find the resume path from application_profile.md.
- Verify the resume file exists.
- Upload the resume if a file upload input is present.
- Do not upload unrelated files.
- Log the file path uploaded.
- If the resume file is missing, log resume_file_missing.

Page navigation rules:

- Detect and click safe navigation buttons such as Next, Continue, Save and Continue, and Review.
- Do not click final submit in dry-run mode.
- In dry-run mode, stop before final submission.
- In submit mode, submit only when all required fields are filled or safely skipped according to rules.
- If a page has required fields that cannot be answered from the profile, stop and log them.

Submission rules:

- Dry run must be the default behavior.
- In dry-run mode, do not submit the application.
- In dry-run mode, fill known fields.
- In dry-run mode, upload the resume.
- In dry-run mode, stop before final submit.
- In dry-run mode, save a screenshot.
- In dry-run mode, print a summary.
- Submit only when the script is run with --submit.
- Before submitting, verify that no unknown required fields remain.
- Before submitting, verify that no sensitive fields were guessed.
- Before submitting, verify that resume upload succeeded if required.
- Before submitting, verify that the current page is actually the final review or application submission page.
- Before submitting, verify that the visible submit button belongs to the job application.
- Save a screenshot immediately before clicking submit.
- Click submit only after all checks pass.
- Save a screenshot after submission.
- Log confirmation page URL and visible confirmation text.

Logging checklist:

- Log timestamp.
- Log job URL.
- Log page URLs visited.
- Log fields detected.
- Log fields filled.
- Log fields skipped.
- Log reason for each skipped field.
- Log resume upload status.
- Log screenshots saved.
- Log whether the run used submit mode or dry-run mode.
- Log final status.
- Final status must be one of: dry_run_completed, submitted, blocked_missing_required_field, blocked_sensitive_field, blocked_resume_missing, failed_page_load, failed_selector, failed_unknown_error.

Screenshot checklist:

- Save a screenshot after opening the first page.
- Save a screenshot after filling each major page.
- Save a screenshot before final submission.
- Save a screenshot after successful submission.
- Name screenshots using timestamp and job index.

Error handling rules:

- If the page fails to load, retry once.
- If the page still fails to load, log failed_page_load and move to the next job.
- If selectors fail, try alternate matching through label, placeholder, aria-label, name, id, and nearby text.
- If a required field cannot be answered, stop that application and log blocked_missing_required_field.
- If a sensitive field cannot be confidently answered from application_profile.md, stop or skip according to whether it is required.
- If a required sensitive field cannot be answered, stop that application and log blocked_sensitive_field.
- Never bypass CAPTCHA.
- Never fake human verification.
- Never accept terms or legal certifications unless the required answer is clearly present in application_profile.md and submit mode is explicitly enabled.

Playwright implementation checklist:

- Use Node.js and Playwright.
- Launch Chromium in non-headless mode by default.
- Use persistent browser context if possible so login sessions can be reused.
- Add a dry-run script in package.json.
- Add a submit script in package.json.
- Use robust helper functions for field detection, field matching, field filling, option selection, radio selection, checkbox selection, resume upload, screenshot saving, and logging.
- Keep the code modular and debuggable.
- Avoid brittle selectors that depend only on generated class names.
- Prefer user-visible labels and accessibility attributes.

Package scripts checklist:

- Add npm run dry-run to run the automation without submitting.
- Add npm run submit to run the automation with --submit.
- Keep dry-run as the default safe command.

Expected package scripts:

- npm run dry-run should execute node apply.js.
- npm run submit should execute node apply.js --submit.

Codex task checklist:

- Generate apply.js.
- Generate package.json scripts if missing.
- Create logs directory if missing.
- Create screenshots directory if missing.
- Read and parse application_profile.md.
- Read jobs.txt.
- Implement dry-run behavior.
- Implement submit behavior.
- Implement logging.
- Implement screenshot capture.
- Implement resume upload.
- Implement safe field filling.
- Implement sensitive field blocking.
- Implement final submission guardrails.

Acceptance criteria:

- The script can open at least one job application URL from jobs.txt.
- The script can parse applicant data from application_profile.md.
- The script can fill standard fields that clearly match the profile.
- The script can upload the resume when a resume upload field exists.
- The script does not hardcode applicant details.
- The script does not submit in dry-run mode.
- The script saves screenshots and logs.
- The script blocks or skips unknown fields safely.
- The script never guesses sensitive answers.
- The script submits only when run with --submit and all checks pass.
- The script produces a clear final summary for each job application.

Final instruction for the AI agent:

Build the automation according to this plan. Do not ask the user to manually copy applicant data into the script. Do not duplicate application_profile.md contents. Read all applicant data from application_profile.md at runtime. Keep dry-run as the default. Submit only when explicitly run in submit mode. Never guess unknown or sensitive answers.