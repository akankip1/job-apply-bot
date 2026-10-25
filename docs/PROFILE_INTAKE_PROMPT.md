# GenAI Profile Intake Prompt

This prompt makes an LLM collect all applicant details in one questionnaire, then generate polished contents for the three local profile files.

Applicant data in this project must remain local. Use a local/offline LLM. Anything entered into a hosted LLM is sent to that provider.

Copy and paste the entire prompt below into the LLM:

````text
You are helping me prepare applicant data for a local job-application tool. Follow this two-message workflow exactly.

FIRST RESPONSE:
- Ask me one consolidated questionnaire containing every item needed below.
- Ask all questions at once, grouped into clear sections, so I can answer in a single reply.
- Mark sensitive or optional questions clearly and allow me to answer "leave blank".
- Do not generate files yet and do not ask questions one at a time.

AFTER I REPLY:
- Produce complete, polished contents for `profile.md`, `answers.json`, and `config.json` in three separate fenced code blocks.
- Do not invent, infer, or embellish facts. Preserve names, dates, legal answers, and contact details exactly as provided.
- Use an empty string or blank Markdown value for anything I did not answer.
- Never silently convert an unknown answer to "No".
- Keep all JSON valid, include every requested key, and do not add commentary inside the file blocks.
- After the files, provide a short "Missing information" checklist and the validation command `node scripts/validate-profile.js --person <name>`.

Your single questionnaire must collect:

1. Profile identity and contact
- Person directory slug, such as `jane-doe`
- First name, last name, preferred name, and suffix
- Email and phone number with country code
- City, state/region, country, street address, address lines 2 and 3, and postal code
- Total years of professional experience

2. Employment eligibility and voluntary demographic details
- Authorized to work in the US, Canada, and United Kingdom
- Whether current or future visa sponsorship is required
- Work-authorization basis, if the applicant wants it stored
- Ethnicity, Hispanic/Latinx status, gender, pronouns, sexual orientation, LGBTQ+ identity, disability status, and veteran status
- Whether the applicant is at least 18
- Whether identity and work-authorization documents can be provided
- Whether the applicant is located in the European Union

3. Work experience
- For every role: title, company, location, start and end month/year, employment type, and factual accomplishment bullets
- Current title and employer must come from the most recent role

4. Education
- For every school: official school name, alternate names used by application dropdowns, start and end month/year, degree, and field of study

5. Skills and links
- Skills grouped into useful categories
- LinkedIn, GitHub, portfolio, and other professional URLs
- Absolute local path to the resume file
- Optional absolute local path to a cover-letter file

6. Reusable application answers
- How the applicant heard about jobs
- Previously employed by the hiring company
- Comfortable with hybrid work or relocation
- Relocation assistance needed
- Friends or relatives employed by the hiring company
- Recently interviewed with the hiring company
- Desired total compensation
- Willingness to work onsite in Seattle four days per week
- Consent to demographic-data processing
- Consent to data retention for future opportunities
- Recruitment privacy-policy acknowledgement
- Truthfulness/certification acknowledgement
- Conflicting contractual obligations
- Export-control eligibility
- For the following legal or regulated questions, explicitly ask for an answer and leave blank if not provided: prohibited-possessor acknowledgement, fugitive-from-justice status, unlawful US presence, unlawful controlled-substance use, firearms questionnaire acknowledgement, adjudicated mental-defective or commitment status, dishonorable military discharge, and renounced US citizenship

7. Location and dropdown configuration
- Nearby cities the applicant considers commutable, grouped under their home city
- Known alternate dropdown values for school, city, country, employer, or other fields

Generate `profile.md` using these exact parseable sections and labels:
- `# Profile`
- `## Personal Information` table with: First Name, Last Name, Preferred Name, Suffix Name, Email Address, Phone Number, Birthday, Location, Address, Address 2, Address 3, Postal Code, Years of experience
- `## Employment Information` table with the eligibility and demographic questions
- `## Resume` and `## Cover Letter`, each containing only the absolute file path in a `text` code block
- `# Work Experience`, with one `##` heading per role and exact `**Title:**`, `**Company:**`, `**Location:**`, `**Dates:**`, and `**Employment Type:**` lines
- `# Education`, with one `##` heading per school and exact `**School:**`, `**Dates:**`, and `**Degree:**` lines; format Degree as `degree, field of study`
- `# Portfolio & Links` table
- `# Skills` with categorized bullet lists
- Format Location as `City, State/Region, Country` and dates as `Month YYYY - Month YYYY` or `Month YYYY - Present`

Generate `answers.json` with every key below, even when its value is empty:
`how_did_you_hear`, `previously_employed_by_company`, `comfortable_with_hybrid_or_relocation`, `relocation_assistance`, `related_to_company_employee`, `personal_pronouns`, `sexual_orientation`, `hispanic_latinx`, `certify_truthful_application`, `demographic_data_consent`, `retention_consent`, `desired_total_compensation`, `recruitment_privacy_policy_acknowledgement`, `prohibited_possessor_questionnaire_acknowledgement`, `recently_interviewed_with_company`, `work_authorization_any_us_employer_now_future`, `work_authorization_basis`, `located_in_european_union`, `identity_and_work_authorization_verification`, `age_18_or_older`, `deemed_export_license_eligible`, `conflicting_obligations`, `fugitive_from_justice`, `unlawfully_in_united_states`, `unlawful_controlled_substance_user`, `firearms_questionnaire_acknowledgement`, `adjudicated_mental_defective_or_committed`, `dishonorable_military_discharge`, `renounced_us_citizenship`, `onsite_seattle_four_days`.

Generate `config.json` with exactly two top-level objects: `nearbyCities` and `optionAliases`. Use normalized lowercase home-city keys in `nearbyCities`. Only include aliases I explicitly provide or obvious spelling variants of names I provide.
````
