const fs = require("fs");
const { normalizeText } = require("./text");

function firstNonEmpty(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim()) || "";
}

function detectCompany(schema) {
  return schema.company || "";
}

function answerFromMemory(key, answers) {
  const value = answers[key];
  if (!value) return null;
  return { answer: value, source: `answers.${key}`, confidence: "high", safeToFill: true };
}

function approvedAnswer(field, answers, answerKey, decisionKey, sensitive = false) {
  const memory = answerFromMemory(answerKey, answers);
  return memory ? { ...manual(field, ""), ...memory, key: decisionKey, sensitive } : manual(field, `missing_answers.${answerKey}`);
}

function planned(field, key, answer, source, sensitive = false) {
  return {
    fieldId: field.fieldId,
    selector: field.selector,
    frameUrl: field.frameUrl,
    index: field.index,
    label: field.label,
    type: field.type,
    required: field.required,
    key,
    answer,
    source,
    sensitive,
    confidence: "high",
    safeToFill: !!answer,
    reason: answer ? "mapped" : "missing_profile_value",
  };
}

function manual(field, reason) {
  return {
    fieldId: field.fieldId,
    selector: field.selector,
    frameUrl: field.frameUrl,
    index: field.index,
    label: field.label,
    type: field.type,
    required: field.required,
    answer: "",
    source: "",
    confidence: "none",
    safeToFill: false,
    reason,
  };
}

const RULES = [
  // --- Files ---
  { type: "file", label: /cover letter/, key: "coverLetter", source: p => p.standard.coverLetterPath },
  { type: "file", key: "resume", source: p => p.standard.resumePath },
  { label: /resume|cv/, key: "resume", source: p => p.standard.resumePath },

  // --- Identity ---
  { id: "_systemfield_name", key: "fullName", source: p => p.standard.fullName },
  { id: "first_name",        key: "firstName", source: p => p.standard.firstName },
  { id: "last_name",         key: "lastName", source: p => p.standard.lastName },
  { id: "preferred_name",    key: "preferredName", source: p => p.standard.preferredName },
  { id: "email",             key: "email", source: p => p.standard.email },
  { id: "phone",             key: "phone", source: p => p.standard.phone },
  { id: "country",           key: "country", source: p => firstNonEmpty(p.standard.country, "United States") },

  { label: /^(full )?name$/,                           key: "fullName",      source: p => p.standard.fullName },
  { label: /^first name\b|given name/,                 key: "firstName",     source: p => p.standard.firstName },
  { label: /^last name\b|family name|surname/,         key: "lastName",      source: p => p.standard.lastName },
  { label: /preferred first name|preferred name|nickname/, key: "preferredName", source: p => p.standard.preferredName },
  { label: /^email\b|email address/,                   key: "email",         source: p => p.standard.email },   
  { label: /^phone\b|phone number|mobile/,             key: "phone",         source: p => p.standard.phone },   
  { label: /currently based|where.*based|current location/, key: "location", source: p => p.standard.location },
  { label: /location city|\bcity\b/,                   key: "locationCity",  source: p => [p.standard.city, p.standard.state].filter(Boolean).join(", ") },
  { label: /linkedin|linked in/,                       key: "linkedIn",      source: p => p.standard.linkedIn },
  { label: /github|git hub/,                           key: "github",        source: p => p.standard.github },  
  { label: /website|portfolio|personal site/,          key: "portfolio",     source: p => p.standard.portfolio },
  { label: /current title|current job title|job title|position title/, key: "currentTitle", source: p => p.standard.currentTitle },

  // --- Education ---
  { label: /^school\b|university|college/,             key: "educationSchool",    source: p => p.standard.primaryEducation.school },
  { label: /^degree\b/,                                key: "educationDegree",    source: p => p.standard.primaryEducation.degree },
  { label: /^discipline\b|field of study|\bmajor\b/,  labelNot: /disab/, key: "educationDiscipline", source: p => p.standard.primaryEducation.discipline },
  { label: /^start date month\b|^start month\b/,      key: "educationStartMonth", source: p => p.standard.primaryEducation.startMonth },
  { label: /^start date year\b|^start year\b/,        key: "educationStartYear",  source: p => p.standard.primaryEducation.startYear },
  { label: /^end date month\b|^end month\b/,          key: "educationEndMonth",   source: p => p.standard.primaryEducation.endMonth },
  { label: /^end date year\b|^end year\b/,            key: "educationEndYear",    source: p => p.standard.primaryEducation.endYear },

  // --- Experience range radios (each option is a separate radio, or a group) ---
  { label: /years.*experience|professional years/i, key: "yearsOfExperience", source: (p, ans, field) => {
    const years = p.standard.yearsOfExperience;
    if (!years) return "";
    const norm = field.label.toLowerCase();
    // Group question with options array — return matching option text for clickChoice
    if (field.options && field.options.length) {
      if (years >= 10) return field.options.find(o => /10\+/.test(o)) || "";
      return field.options.find(o => { const m = o.match(/(\d+)\s*[-–]\s*(\d+)/); return m && years >= parseInt(m[1]) && years <= parseInt(m[2]); }) || "";
    }
    // Individual option radio — return "Yes" if this option's range matches, "" to skip
    if (/10\+/.test(norm) && years >= 10) return "Yes";
    const m = norm.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (m && years >= parseInt(m[1]) && years <= parseInt(m[2])) return "Yes";
    return "";
  }},

  // --- Sensitive / demographic ---
  { label: /disab/,           key: "disability",   sensitive: true, source: p => p.sensitive.disability },      
  { label: /veteran|military/, key: "veteran",     sensitive: true, source: p => p.sensitive.veteran },
  { label: /^gender|^sex\b/,  key: "gender",       sensitive: true, source: p => p.sensitive.gender },
  { label: /ethnic|race/,     key: "ethnicity",    sensitive: true, source: p => p.sensitive.ethnicity },       
  { label: /member of the .*community|identify as lgbtq|lgbtq\+|transgender/, key: "lgbtq", sensitive: true, source: p => p.sensitive.lgbtq },
  { label: /^woman$/,         key: "genderIdentity", sensitive: true, source: (p) => { const g = normalizeText(p.sensitive.gender); return (g === "woman" || g === "female") ? "Yes" : "No"; } },
  { label: /^man$/,           key: "genderIdentityMan", sensitive: true, source: (p) => { const g = normalizeText(p.sensitive.gender); return (g === "man" || g === "male") ? "Yes" : "No"; } },
  { label: /hispanic|latinx/, key: "hispanicLatinx", sensitive: true, source: (p, ans) => { const e = normalizeText(p.sensitive.ethnicity || ""); return (ans.hispanic_latinx === "Yes" || /hispanic|latinx/.test(e)) ? "Yes" : "No"; } },
  { label: /^heterosexual$/,  key: "sexualOrientation", sensitive: true, source: (p, ans) => ans.sexual_orientation === "Heterosexual" ? "Yes" : "No" },

  // --- Work authorization ---
  { label: /located in the european union|located in the eu\b/, key: "locatedInEU", source: () => "No" },
  { label: /authorized.*(work|employed).*any.*employer.*now.*future|legally authorized.*(work|employed).*any us employer/, key: "workAuthorizationAnyEmployer", sensitive: true, source: (p, ans) => ans.work_authorization_any_us_employer_now_future },
  { label: /(authorized|eligible).*(work|employed)/,  key: "workAuthorization", sensitive: true, source: (p, ans, field, schema) => {
      const country = normalizeText(schema.company || "");
      if (/canada/.test(field.label.toLowerCase())) return p.sensitive.authorizedCanada;
      if (/united kingdom|uk/.test(field.label.toLowerCase())) return p.sensitive.authorizedUK;
      return p.sensitive.authorizedUS;
    }
  },
  { label: /sponsor|visa|h 1b|h1b|immigration/, key: "sponsorship", sensitive: true, source: p => p.sensitive.sponsorship },

  // --- Employment history ---
  { label: /previously employed|ever been employed|currently employed by|worked for .*previously|worked for .*company|applied to/, key: "previousEmployment", source: (p, ans) => ans.previously_employed_by_company },
  { label: /current.*previous.*company|current.*company|previous.*company|current employer|previous employer|employer name|name of employer/, key: "currentEmployer", source: p => p.standard.currentEmployer },
  { label: /interviewed with .*past|interviewed with .*six months|interviewed with .*year/, key: "recentlyInterviewedWithCompany", source: (p, ans) => ans.recently_interviewed_with_company },

  // --- How heard ---
  { label: /how did you hear|source/, key: "howDidYouHear", source: (p, ans) => ans.how_did_you_hear },

  // --- Relocation / hybrid ---
  { label: /hybrid|relocat|move to|in person|office locations|work model|comfortable with this policy|live within.*miles/, key: "hybridRelocation", source: (p, ans) => ans.comfortable_with_hybrid_or_relocation },
  { label: /onsite.*(seattle|san francisco)|office.*four days per week|working onsite.*office/, key: "onsiteSeattleFourDays", source: (p, ans) => ans.onsite_seattle_four_days },

  // --- Misc approved answers ---
  { label: /pronouns?/,                          key: "personalPronouns",     source: (p, ans) => ans.personal_pronouns },
  { label: /sexual orientation/,                 key: "sexualOrientation",    sensitive: true, source: (p, ans) => ans.sexual_orientation },
  { label: /at least 18|18 years of age/,        key: "age18OrOlder",         sensitive: true, source: (p, ans) => ans.age_18_or_older },
  { label: /related to|close personal relationship/, key: "relatedToCompanyEmployee", source: (p, ans) => ans.related_to_company_employee },
  { label: /relocation assistance/,              key: "relocationAssistance", source: (p, ans) => ans.relocation_assistance },
  { label: /provide verification.*identity.*authorization.*work/, key: "identityWorkAuthorizationVerification", sensitive: true, source: (p, ans) => ans.identity_and_work_authorization_verification },
  { label: /deemed export license|ear controlled technology/, key: "deemedExportLicenseEligible", sensitive: true, source: (p, ans) => ans.deemed_export_license_eligible },
  { label: /contractual obligations|agreements.*relationships.*commitments/, key: "conflictingObligations", sensitive: true, source: (p, ans) => ans.conflicting_obligations },
  { label: /certif|truthful|true and correct|accurate/, key: "certifyTruthfulApplication", source: (p, ans) => ans.certify_truthful_application },
  { label: /demographic data.*consent|consent.*demographic data|^i agree$/, key: "demographicDataConsent", source: (p, ans) => ans.demographic_data_consent },
  { label: /recruitment privacy policy|privacy policy/, key: "recruitmentPrivacyPolicyAcknowledgement", source: (p, ans) => ans.recruitment_privacy_policy_acknowledgement },
  { label: /retain my data|future opportunities|contact you about job opportunities/, key: "retentionConsent", source: (p, ans) => ans.retention_consent },
  { label: /salary|compensation|total comp|desired pay|expected pay/, key: "desiredTotalCompensation", source: (p, ans) => ans.desired_total_compensation },

  // --- Blocks ---
  { label: /^if yes\b/,                          block: true,  reason: field => field.required ? "conditional_required_field_needs_manual_review" : "conditional_optional_field" },
  { label: /background check|criminal|terms|privacy/, block: true, reason: () => "sensitive_or_legal_question_needs_manual_review" },
];

function resolveAnswer(key, profile, answers, field, schema) {
  const rule = RULES.find(r => r.key === key);
  if (rule && rule.source) {
    return rule.source(profile, answers, field, schema) || "";
  }
  return "";
}

async function classifyField(field, profile, answers, schema) {
  const label = normalizeText(field.label);
  const id = normalizeText(field.id);

  // Demographic checkboxes (individual option checkboxes, e.g. "South Asian", "Woman")
  if (field.type === "checkbox") {
    const sensitiveValues = [
      profile.sensitive.ethnicity, profile.sensitive.gender,
      profile.sensitive.disability, profile.sensitive.lgbtq, profile.sensitive.veteran,
    ].map(v => normalizeText(v)).filter(Boolean);
    
    // Add synonyms to catch mapping mismatches (e.g., profile "Female" vs checkbox "Woman")
    if (sensitiveValues.includes("female")) sensitiveValues.push("woman");
    if (sensitiveValues.includes("male")) sensitiveValues.push("man");
    if (sensitiveValues.includes("woman")) sensitiveValues.push("female");
    if (sensitiveValues.includes("man")) sensitiveValues.push("male");

    if (sensitiveValues.includes(label)) {
      return planned(field, "demographicOption", "Yes", "profile.sensitive", true);
    }
  }

  for (const rule of RULES) {
    const idMatch  = !rule.id    || rule.id === id || rule.id === field.id;
    const typeMatch = !rule.type || rule.type === field.type;
    const labelMatch = !rule.label || rule.label.test(label);
    const labelNotMatch = !rule.labelNot || !rule.labelNot.test(label);

    if (idMatch && typeMatch && labelMatch && labelNotMatch) {
      if (rule.block) return manual(field, rule.reason(field));
      const answer = rule.source(profile, answers, field, schema) || "";
      return planned(field, rule.key, answer, `rule.${rule.key}`, rule.sensitive || false);
    }
  }

  // Fallback: embedding similarity
  try {
    const { classifyLabel } = require("./embedClassify");
    const match = await classifyLabel(field.label);

    if (match.confidence !== "none") {
      if (match.confidence === "low") {
        return manual(field, `low_confidence_match:${match.key}:score=${match.score.toFixed(2)}`);
      }
      // High confidence
      const answer = resolveAnswer(match.key, profile, answers, field, schema);
      return planned(field, match.key, answer, `embed:${match.score.toFixed(2)}`, match.sensitive);
    }
  } catch (e) {
    console.warn(`Embedding classification failed: ${e.message}`);
  }

  return manual(field, field.required ? "unknown_required_field" : "unknown_optional_field");
}

async function createAnswerPlan(schema, profile, answers) {
  const decisions = [];
  for (const field of schema.fields) {
    decisions.push(await classifyField(field, profile, answers, schema));
  }
  const manualReview = decisions.filter((decision) => decision.required && !decision.safeToFill);
  return {
    platform: schema.platform,
    jobTitle: schema.jobTitle,
    company: schema.company,
    canSubmit: manualReview.length === 0,
    decisions,
    manualReview,
  };
}

function validatePlan(plan) {
  return plan.manualReview.map((decision) => ({
    reason: decision.reason,
    label: decision.label,
    fieldId: decision.fieldId,
  }));
}

function validateResume(plan) {
  const uploadDecision = plan.decisions.find((decision) =>
    (decision.key === "resume" || decision.key === "coverLetter") &&
    decision.safeToFill &&
    !fs.existsSync(decision.answer)
  );
  if (!uploadDecision) return null;
  return {
    reason: `${uploadDecision.key}_file_missing`,
    fieldId: uploadDecision.fieldId,
    path: uploadDecision.answer,
  };
}

module.exports = {
  createAnswerPlan,
  validatePlan,
  validateResume,
  classifyField,
};
