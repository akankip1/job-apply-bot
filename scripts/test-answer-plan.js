const { createAnswerPlan } = require("../lib/answerPlan");
const { loadProfile } = require("../lib/profile");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

// --- STATIC MOCK DATA ---
// This ensures tests are deterministic and don't break when your real profile changes.
const mockProfile = {
  standard: {
    fullName: "Test User",
    firstName: "Test",
    lastName: "User",
    email: "test@example.com",
    phone: "555-0199",
    location: "Seattle, WA",
    resumePath: "C:\\mock\\resume.pdf",
    yearsOfExperience: 4,
    primaryEducation: {
      school: "Mock University",
      degree: "Bachelor's",
      discipline: "Computer Science"
    }
  },
  sensitive: {
    gender: "Female",
    ethnicity: "South Asian",
    disability: "No",
    veteran: "No",
    lgbtq: "No",
    authorizedUS: "Yes",
    sponsorship: "No"
  }
};

const mockAnswers = {
  sexual_orientation: "Heterosexual",
  how_did_you_hear: "LinkedIn",
  work_authorization_any_us_employer_now_future: "Yes"
};

const schemaPath = process.argv[2];
let schema = { fields: [], company: "Unit Test", jobTitle: "Mock Job" };

if (schemaPath && fs.existsSync(schemaPath)) {
  schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
}

// We pass the mock data into createAnswerPlan
const plan = createAnswerPlan(schema, mockProfile, mockAnswers);

let pass = 0;
let fail = 0;

/**
 * Asserts mapping logic. If the field isn't in the schema, 
 * it creates a virtual field to test the classification logic directly.
 */
function assert(idOrLabel, expectedKey, expectedAnswer, type = "text", mockId = null) {
  let d = plan.decisions.find(dec => dec.fieldId === idOrLabel || dec.label === idOrLabel);

  if (!d) {
    const virtualField = {
      fieldId: "virtual_test",
      id: mockId || (idOrLabel.includes(" ") ? "" : idOrLabel),
      label: idOrLabel,
      type: type, 
      required: true
    };
    const { classifyField } = require("../lib/answerPlan");
    d = classifyField(virtualField, mockProfile, mockAnswers, schema);
  }


  const keyOk = !expectedKey || d.key === expectedKey;
  const actualAnswer = String(d.answer || "").toLowerCase().trim();
  const targetAnswer = String(expectedAnswer || "").toLowerCase().trim();
  const ansOk = expectedAnswer === undefined || actualAnswer === targetAnswer;
  
  if (keyOk && ansOk) {
    console.log(`PASS  ${idOrLabel.slice(0, 60)}${idOrLabel.length > 60 ? "..." : ""}`);
    pass++;
  } else {
    console.error(`FAIL  ${idOrLabel}`);
    if (!keyOk) console.error(`      Key: actual=${d.key}, expected=${expectedKey}`);
    if (!ansOk) console.error(`      Answer: actual="${d.answer}", expected="${expectedAnswer}"`);
    fail++;
  }
}

console.log(`Testing plan for: ${schema.company} - ${schema.jobTitle}\n`);

// --- Baseline Assertions ---

// Disability mapping (The "major life activities" bug)
assert(
  "Do you have a disability or chronic condition (physical, visual, auditory, cognitive, mental, emotional, or other) that substantially limits one or more of your major life activities, including mobility, communication (seeing, hearing, speaking), and learning?",
  "disability",
  mockProfile.sensitive.disability
);

// Work authorization
assert("Are you authorized to be employed in the United States?", "workAuthorization", mockProfile.sensitive.authorizedUS);
assert("Are you located in the European Union?", "locatedInEU", "No");

// Basic identity (Ashby specific IDs)
assert("Legal Full Name", "fullName", mockProfile.standard.fullName, "text", "_systemfield_name");
assert("Email", "email", mockProfile.standard.email, "email", "_systemfield_email");

// Demographic checkboxes (mapped to "Yes" if they match profile)
assert("South Asian", "demographicOption", "Yes", "checkbox");
assert("Woman", "demographicOption", "Yes", "checkbox");
assert("Heterosexual", "sexualOrientation", "Yes", "checkbox");

// Years of experience (4 years → 1-4 matches, others skip)
assert("1-4 years of experience",  "yearsOfExperience", "Yes", "radio");
assert("5-9 years of experience",  "yearsOfExperience", "",    "radio");
assert("10+ years of experience",  "yearsOfExperience", "",    "radio");

console.log(`\nSummary: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
