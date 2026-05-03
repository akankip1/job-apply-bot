#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const DEFAULT_ANSWERS = {
  how_did_you_hear: "",
  previously_employed_by_company: "",
  comfortable_with_hybrid_or_relocation: "",
  relocation_assistance: "",
  related_to_company_employee: "",
  personal_pronouns: "",
  sexual_orientation: "",
  hispanic_latinx: "",
  certify_truthful_application: "",
  demographic_data_consent: "",
  retention_consent: "",
  desired_total_compensation: "",
  recruitment_privacy_policy_acknowledgement: "",
  prohibited_possessor_questionnaire_acknowledgement: "",
  recently_interviewed_with_company: "",
  work_authorization_any_us_employer_now_future: "",
  identity_and_work_authorization_verification: "",
  age_18_or_older: "",
  deemed_export_license_eligible: "",
  conflicting_obligations: "",
  fugitive_from_justice: "",
  unlawfully_in_united_states: "",
  unlawful_controlled_substance_user: "",
  firearms_questionnaire_acknowledgement: "",
  adjudicated_mental_defective_or_committed: "",
  dishonorable_military_discharge: "",
  renounced_us_citizenship: "",
  onsite_seattle_four_days: "",
};

const DEFAULT_CONFIG = {
  nearbyCities: {},
  optionAliases: {},
};

const PROFILE_TEMPLATE = `# Profile

## Personal Information

| Field | Value |
| --- | --- |
| First Name |  |
| Last Name |  |
| Preferred Name |  |
| Email Address |  |
| Phone Number |  |
| Location | City, State, Country |
| Address |  |
| Postal Code |  |
| Years of experience | 0 |

## Employment Information

| Question | Answer |
| --- | --- |
| What is your ethnicity? |  |
| Are you authorized to work in the US? |  |
| Are you authorized to work in Canada? |  |
| Are you authorized to work in the United Kingdom? |  |
| Will you now or in the future require sponsorship for employment visa status? |  |
| Do you have a disability? |  |
| Do you identify as LGBTQ+? |  |
| What is your gender? |  |
| Are you a veteran? |  |

## Portfolio & Links

| Link Type | Value |
| --- | --- |
| LinkedIn URL |  |
| GitHub URL |  |
| Portfolio URL |  |

## Resume

\`\`\`text

\`\`\`

## Cover Letter

\`\`\`text

\`\`\`

# Work Experience

## Most Recent Role

**Title:** Example Job Title
**Company:** Example Company
**Location:** City, State, Country
**Dates:** January 2024 - Present

- Replace this section with your actual work experience.

# Education

## Primary Education

**School:** Example University
**Dates:** August 2020 - May 2024
**Degree:** Bachelor of Science, Computer Science

- Replace this section with your actual education history.

# Skills

## Languages

- Example skill

## Frameworks

- Example skill
`;

const JOBS_TEMPLATE = `# Add one job URL per line.
# Lines starting with # are ignored.
`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function validatePersonSlug(raw) {
  const value = String(raw || "").trim();
  if (!value) fail("Usage: node scripts/setup-profile.js <name>");
  if (/\s/.test(value)) fail("Person name must not contain spaces.");
  if (/[\\/]/.test(value)) fail("Person name must not contain path separators.");
  if (!/^[A-Za-z0-9_-]+$/.test(value)) fail("Person name may only contain letters, numbers, hyphens, and underscores.");
  return value;
}

function writeFile(filePath, contents) {
  fs.writeFileSync(filePath, contents, "utf8");
}

const person = validatePersonSlug(process.argv[2]);
const personDir = path.join(ROOT, "people", person);

if (fs.existsSync(personDir)) {
  fail(`people/${person}/ already exists.`);
}

fs.mkdirSync(personDir, { recursive: true });
writeFile(path.join(personDir, "config.json"), `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
writeFile(path.join(personDir, "answers.json"), `${JSON.stringify(DEFAULT_ANSWERS, null, 2)}\n`);
writeFile(path.join(personDir, "jobs.txt"), JOBS_TEMPLATE);
writeFile(path.join(personDir, "profile.md"), PROFILE_TEMPLATE);

console.log(`Created people/${person}/`);
console.log("");
console.log("Next steps:");
console.log(`1. Fill in people/${person}/profile.md with your details`);
console.log(`2. Fill in people/${person}/answers.json with your reusable answers`);
console.log(`3. Add job URLs to people/${person}/jobs.txt`);
console.log(`4. Validate: node scripts/validate-profile.js --person ${person}`);
console.log(`5. Dry run: node apply.js --person ${person} --limit 1`);
