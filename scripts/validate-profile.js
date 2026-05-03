#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { loadProfile } = require("../lib/profile");

const ROOT = path.join(__dirname, "..");

const KNOWN_CONFIG_KEYS = ["nearbyCities", "optionAliases"];

const EXPECTED_ANSWER_KEYS = [
  "how_did_you_hear",
  "previously_employed_by_company",
  "comfortable_with_hybrid_or_relocation",
  "relocation_assistance",
  "related_to_company_employee",
  "personal_pronouns",
  "sexual_orientation",
  "hispanic_latinx",
  "certify_truthful_application",
  "demographic_data_consent",
  "retention_consent",
  "desired_total_compensation",
  "recruitment_privacy_policy_acknowledgement",
  "prohibited_possessor_questionnaire_acknowledgement",
  "recently_interviewed_with_company",
  "work_authorization_any_us_employer_now_future",
  "work_authorization_basis",
  "identity_and_work_authorization_verification",
  "age_18_or_older",
  "deemed_export_license_eligible",
  "conflicting_obligations",
  "fugitive_from_justice",
  "unlawfully_in_united_states",
  "unlawful_controlled_substance_user",
  "firearms_questionnaire_acknowledgement",
  "adjudicated_mental_defective_or_committed",
  "dishonorable_military_discharge",
  "renounced_us_citizenship",
  "onsite_seattle_four_days",
];

function parsePersonArg(args) {
  const idx = args.indexOf("--person");
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return args.find(a => !a.startsWith("--")) || null;
}

const person = parsePersonArg(process.argv.slice(2));
if (!person) {
  console.error("Usage: node scripts/validate-profile.js --person <name>");
  process.exit(1);
}

const dataDir = path.join(ROOT, "people", person);
let errors = 0;
let warnings = 0;

function pass(label) { console.log(`  ✓  ${label}`); }
function fail(label, detail) { console.error(`  ✗  ${label}${detail ? ` — ${detail}` : ""}`); errors++; }
function warn(label, detail) { console.warn(`  !  ${label}${detail ? ` — ${detail}` : ""}`); warnings++; }
function header(name) { console.log(`\n${name}`); }

// 1. Directory
header("Directory");
if (!fs.existsSync(dataDir)) {
  console.error(`No directory found for "${person}". Create people/${person}/ first.`);
  process.exit(1);
}
pass(`people/${person}/ exists`);

// 2. config.json
header("config.json");
const configPath = path.join(dataDir, "config.json");
if (!fs.existsSync(configPath)) {
  warn("config.json exists", "will be auto-created with defaults on first run");
} else {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    pass("valid JSON");
  } catch (e) {
    fail("valid JSON", e.message);
    config = null;
  }
  if (config) {
    for (const key of Object.keys(config)) {
      if (!KNOWN_CONFIG_KEYS.includes(key)) {
        const suggestion = KNOWN_CONFIG_KEYS.find(k =>
          k.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(k.toLowerCase())
        );
        fail(`unknown key "${key}"`, suggestion ? `did you mean "${suggestion}"?` : `known keys: ${KNOWN_CONFIG_KEYS.join(", ")}`);
      }
    }
    if (config.nearbyCities !== undefined) {
      if (typeof config.nearbyCities !== "object" || Array.isArray(config.nearbyCities)) {
        fail("nearbyCities must be an object");
      } else {
        const count = Object.keys(config.nearbyCities).length;
        pass(`nearbyCities — ${count} city group${count !== 1 ? "s" : ""}`);
      }
    }
    if (config.optionAliases !== undefined) {
      if (typeof config.optionAliases !== "object" || Array.isArray(config.optionAliases)) {
        fail("optionAliases must be an object");
      } else {
        const count = Object.keys(config.optionAliases).length;
        pass(`optionAliases — ${count} key${count !== 1 ? "s" : ""}`);
      }
    }
  }
}

// 3. profile.md
header("profile.md");
let profile;
let profileMarkdown = "";
try {
  profileMarkdown = fs.readFileSync(path.join(dataDir, "profile.md"), "utf8");
  profile = loadProfile(dataDir);
  pass("exists and parses");
} catch (e) {
  fail("exists and parses", e.message);
  profile = null;
}
if (profile) {
  const s = profile.standard;
  for (const [field, val] of [["firstName", s.firstName], ["lastName", s.lastName], ["email", s.email], ["phone", s.phone]]) {
    if (val) pass(field); else fail(field, "empty");
  }
  if (!s.location) {
    fail("location", "empty");
  } else if (!s.location.includes(",")) {
    warn("location format", 'expected "City, State, Country"');
  } else {
    pass("location");
  }
  if (s.resumePath) {
    if (fs.existsSync(s.resumePath)) pass(`resumePath exists`);
    else fail("resumePath exists", s.resumePath);
  } else {
    warn("resumePath", "not set in profile.md Resume section");
  }
  if (s.coverLetterPath) {
    if (fs.existsSync(s.coverLetterPath)) pass("coverLetterPath exists");
    else fail("coverLetterPath exists", s.coverLetterPath);
  } else {
    warn("coverLetterPath", "not set (optional)");
  }
  if (/\*\*Title:\*\*/i.test(profileMarkdown)) {
    pass("work experience title marker");
  } else {
    warn("work experience", 'no "**Title:**" found');
  }
  if (/\*\*School:\*\*/i.test(profileMarkdown)) {
    pass("education school marker");
  } else {
    warn("education", 'no "**School:**" found');
  }
}

// 4. answers.json
header("answers.json");
const answersPath = path.join(dataDir, "answers.json");
if (!fs.existsSync(answersPath)) {
  fail("answers.json exists");
} else {
  let answers;
  try {
    answers = JSON.parse(fs.readFileSync(answersPath, "utf8"));
    pass("valid JSON");
  } catch (e) {
    fail("valid JSON", e.message);
    answers = null;
  }
  if (answers) {
    const missing = EXPECTED_ANSWER_KEYS.filter(k => !(k in answers));
    if (missing.length === 0) {
      pass(`all ${EXPECTED_ANSWER_KEYS.length} expected keys present`);
    } else {
      fail("missing keys", missing.join(", "));
    }
    const empty = EXPECTED_ANSWER_KEYS.filter(k => k in answers && answers[k] === "");
    if (empty.length > 0) warn(`${empty.length} empty value${empty.length !== 1 ? "s" : ""}`, empty.join(", "));
    if ("educationAliases" in answers) {
      warn("educationAliases key found", "unused — aliases now belong in config.json optionAliases");
    }
  }
}

// 5. jobs.txt
header("jobs.txt");
const jobsPath = path.join(dataDir, "jobs.txt");
if (!fs.existsSync(jobsPath)) {
  warn("jobs.txt exists", "create it and add job URLs before running the bot");
} else {
  const lines = fs.readFileSync(jobsPath, "utf8").split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith("#"));
  pass(`exists — ${lines.length} URL${lines.length !== 1 ? "s" : ""} queued`);
}

// Summary
console.log(`\n${"─".repeat(44)}`);
if (errors === 0 && warnings === 0) {
  console.log("All checks passed.");
} else {
  const errStr = `${errors} error${errors !== 1 ? "s" : ""}`;
  const warnStr = `${warnings} warning${warnings !== 1 ? "s" : ""}`;
  console.log(`${errStr}, ${warnStr}.`);
}
if (errors > 0) process.exitCode = 1;
