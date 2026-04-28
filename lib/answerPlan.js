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

function classifyField(field, profile, answers, schema) {
  const label = normalizeText(field.label);
  const id = normalizeText(field.id);
  const fieldKey = `${id} ${label}`.trim();
  const education = profile.standard.primaryEducation || {};

  if (field.type === "file" && /cover letter/.test(fieldKey)) {
    return planned(field, "coverLetter", profile.standard.coverLetterPath, "profile.coverLetterPath");
  }

  if (field.type === "file" || /resume|cv/.test(fieldKey)) {
    return planned(field, "resume", profile.standard.resumePath, "profile.resumePath");
  }

  // Prefer stable ATS ids before fuzzy label matching. This prevents long
  // question text from accidentally matching a generic word like "country".
  const exactId = {
    _systemfield_name: ["fullName", profile.standard.fullName, "profile.fullName"],
    first_name: ["firstName", profile.standard.firstName, "profile.firstName"],
    last_name: ["lastName", profile.standard.lastName, "profile.lastName"],
    preferred_name: ["preferredName", profile.standard.preferredName, "profile.preferredName"],
    email: ["email", profile.standard.email, "profile.email"],
    phone: ["phone", profile.standard.phone, "profile.phone"],
    country: ["country", firstNonEmpty(profile.standard.country, "United States"), "profile.country"],
  };
  if (exactId[field.id]) {
    const [key, answer, source] = exactId[field.id];
    return planned(field, key, answer, source);
  }

  if (/^(full )?name$/.test(label)) return planned(field, "fullName", profile.standard.fullName, "profile.fullName");
  if (/^first name\b|given name/.test(label)) return planned(field, "firstName", profile.standard.firstName, "profile.firstName");
  if (/^last name\b|family name|surname/.test(label)) return planned(field, "lastName", profile.standard.lastName, "profile.lastName");
  if (/preferred first name|preferred name|nickname/.test(label)) return planned(field, "preferredName", profile.standard.preferredName, "profile.preferredName");
  if (/^email\b|email address/.test(label)) return planned(field, "email", profile.standard.email, "profile.email");
  if (/^phone\b|phone number|mobile/.test(label)) return planned(field, "phone", profile.standard.phone, "profile.phone");
  if (/currently based|where.*based|current location/.test(label)) {
    return planned(field, "location", profile.standard.location, "profile.location");
  }
  if (/location city|\bcity\b/.test(label)) {
    const cityState = [profile.standard.city, profile.standard.state].filter(Boolean).join(", ");
    return planned(field, "locationCity", firstNonEmpty(cityState, profile.standard.city), "profile.location");
  }
  if (/linkedin|linked in/.test(label)) return planned(field, "linkedIn", profile.standard.linkedIn, "profile.linkedIn");
  if (/github|git hub/.test(label)) return planned(field, "github", profile.standard.github, "profile.github");
  if (/website|portfolio|personal site/.test(label)) return planned(field, "portfolio", profile.standard.portfolio, "profile.portfolio");
  if (/^if yes\b/.test(label)) {
    return manual(field, field.required ? "conditional_required_field_needs_manual_review" : "conditional_optional_field");
  }
  if (/current title|current job title|job title|position title/.test(label)) {
    return planned(field, "currentTitle", profile.standard.currentTitle, "profile.currentTitle");
  }
  if (/^school\b|university|college/.test(fieldKey)) return planned(field, "educationSchool", education.school, "profile.education.school");
  if (/^degree\b/.test(fieldKey)) return planned(field, "educationDegree", education.degree, "profile.education.degree");
  if (/^discipline\b|field of study|\bmajor\b/.test(fieldKey) && !/disab/.test(label)) return planned(field, "educationDiscipline", education.discipline, "profile.education.discipline");
  if (/^start date month\b|^start month\b/.test(fieldKey)) return planned(field, "educationStartMonth", education.startMonth, "profile.education.startMonth");
  if (/^start date year\b|^start year\b/.test(fieldKey)) return planned(field, "educationStartYear", education.startYear, "profile.education.startYear");
  if (/^end date month\b|^end month\b/.test(fieldKey)) return planned(field, "educationEndMonth", education.endMonth, "profile.education.endMonth");
  if (/^end date year\b|^end year\b/.test(fieldKey)) return planned(field, "educationEndYear", education.endYear, "profile.education.endYear");

  // Handle individual checkboxes for demographic options (e.g., "South Asian", "Woman").
  if (field.type === "checkbox") {
    const sensitiveValues = [
      profile.sensitive.ethnicity,
      profile.sensitive.gender,
      profile.sensitive.disability,
      profile.sensitive.lgbtq,
      profile.sensitive.veteran
    ].map(v => normalizeText(v)).filter(Boolean);
    
    if (sensitiveValues.includes(label)) {
      return planned(field, "demographicOption", "Yes", "profile.sensitive", true);
    }
  }

  if (/how did you hear|source/.test(label)) {
    const memory = answerFromMemory("how_did_you_hear", answers);
    return memory ? { ...manual(field, ""), ...memory, key: "howDidYouHear" } : manual(field, "missing_answers.how_did_you_hear");
  }

  if (/authorized.*(work|employed).*any.*employer.*now.*future|legally authorized.*(work|employed).*any us employer/.test(label)) {
    return approvedAnswer(field, answers, "work_authorization_any_us_employer_now_future", "workAuthorizationAnyEmployer", true);
  }

  if (/current.*previous.*company|current.*company|previous.*company|current employer|previous employer|employer name|name of employer/.test(label)) {
    return planned(field, "currentEmployer", profile.standard.currentEmployer, "profile.currentEmployer");
  }

  if (/previously employed|ever been employed|currently employed by|worked for .*previously|worked for .*company|applied to/.test(label)) {
    const memory = answerFromMemory("previously_employed_by_company", answers);
    return memory ? { ...manual(field, ""), ...memory, key: "previousEmployment" } : manual(field, "missing_answers.previously_employed_by_company");
  }

  if (/interviewed with .*past|interviewed with .*six months|interviewed with .*year/.test(label)) {
    const memory = answerFromMemory("recently_interviewed_with_company", answers);
    return memory ? { ...manual(field, ""), ...memory, key: "recentlyInterviewedWithCompany" } : manual(field, "missing_answers.recently_interviewed_with_company");
  }

  if (/related to|close personal relationship/.test(label)) {
    const memory = answerFromMemory("related_to_company_employee", answers);
    return memory ? { ...manual(field, ""), ...memory, key: "relatedToCompanyEmployee" } : manual(field, "missing_answers.related_to_company_employee");
  }

  if (/relocation assistance/.test(label)) {
    const memory = answerFromMemory("relocation_assistance", answers);
    return memory ? { ...manual(field, ""), ...memory, key: "relocationAssistance" } : manual(field, "missing_answers.relocation_assistance");
  }

  if (/hybrid|relocat|move to|in person|office locations|work model|comfortable with this policy|live within.*miles/.test(label)) {
    const memory = answerFromMemory("comfortable_with_hybrid_or_relocation", answers);
    return memory ? { ...manual(field, ""), ...memory, key: "hybridRelocation" } : manual(field, "missing_answers.comfortable_with_hybrid_or_relocation");
  }

  if (/provide verification.*identity.*authorization.*work/.test(label)) {
    return approvedAnswer(field, answers, "identity_and_work_authorization_verification", "identityWorkAuthorizationVerification", true);
  }

  if (/at least 18|18 years of age/.test(label)) {
    return approvedAnswer(field, answers, "age_18_or_older", "age18OrOlder", true);
  }

  if (/deemed export license|ear controlled technology|ear - controlled technology/.test(label)) {
    return approvedAnswer(field, answers, "deemed_export_license_eligible", "deemedExportLicenseEligible", true);
  }

  if (/contractual obligations|agreements.*relationships.*commitments|impact.*impede.*interfere/.test(label)) {
    return approvedAnswer(field, answers, "conflicting_obligations", "conflictingObligations", true);
  }

  if (/fugitive from justice/.test(label)) {
    return approvedAnswer(field, answers, "fugitive_from_justice", "fugitiveFromJustice", true);
  }

  if (/alien illegally|alien.*unlawfully/.test(label)) {
    return approvedAnswer(field, answers, "unlawfully_in_united_states", "unlawfullyInUnitedStates", true);
  }

  if (/unlawful user.*controlled substance|addicted to.*controlled substance|marijuana.*depressant.*stimulant.*narcotic/.test(label)) {
    return approvedAnswer(field, answers, "unlawful_controlled_substance_user", "unlawfulControlledSubstanceUser", true);
  }

  if (/federal firearms licensee employee accessor questionnaire|firearms.*questionnaire.*acknowledge/.test(label)) {
    return approvedAnswer(field, answers, "firearms_questionnaire_acknowledgement", "firearmsQuestionnaireAcknowledgement", true);
  }

  if (/adjudicated as a mental defective|committed to a mental institution/.test(label)) {
    return approvedAnswer(field, answers, "adjudicated_mental_defective_or_committed", "adjudicatedMentalDefectiveOrCommitted", true);
  }

  if (/dishonorable conditions|discharged from the armed forces/.test(label)) {
    return approvedAnswer(field, answers, "dishonorable_military_discharge", "dishonorableMilitaryDischarge", true);
  }

  if (/renounced.*united states citizenship/.test(label)) {
    return approvedAnswer(field, answers, "renounced_us_citizenship", "renouncedUsCitizenship", true);
  }

  if (/onsite.*(seattle|san francisco)|office.*four days per week|working onsite.*office/.test(label)) {
    return approvedAnswer(field, answers, "onsite_seattle_four_days", "onsiteSeattleFourDays");
  }

  if (/(authorized|eligible).*(work|employed)/.test(label)) {
    const country = normalizeText(detectCompany(schema) || schema.jobLocation || "");
    const answer = /canada/.test(label) || /canada/.test(country)
      ? profile.sensitive.authorizedCanada
      : /united kingdom|uk|u k/.test(label) || /united kingdom|uk|u k/.test(country)
        ? profile.sensitive.authorizedUK
        : profile.sensitive.authorizedUS;
    return planned(field, "workAuthorization", answer, "profile.workAuthorization", true);
  }

  if (/sponsor|visa|h 1b|h1b|immigration/.test(label)) {
    return planned(field, "sponsorship", profile.sensitive.sponsorship, "profile.sponsorship", true);
  }
  if (/pronouns?/.test(label)) {
    const memory = answerFromMemory("personal_pronouns", answers);
    return memory ? { ...manual(field, ""), ...memory, key: "personalPronouns" } : manual(field, "missing_answers.personal_pronouns");
  }
  if (/sexual orientation/.test(label)) {
    const memory = answerFromMemory("sexual_orientation", answers);
    return memory ? { ...manual(field, ""), ...memory, key: "sexualOrientation", sensitive: true } : manual(field, "missing_answers.sexual_orientation");
  }
  if (/^heterosexual$/.test(label)) {
    const memory = answerFromMemory("sexual_orientation", answers);
    const answer = memory?.answer === "Heterosexual" ? "Yes" : "No";
    return planned(field, "sexualOrientation", answer, "answers.sexual_orientation", true);
  }
  if (/^woman$/.test(label)) {
    const gender = normalizeText(profile.sensitive.gender);
    const answer = (gender === "woman" || gender === "female") ? "Yes" : "No";
    return planned(field, "genderIdentity", answer, "profile.gender", true);
  }
  if (/^man$/.test(label)) {
    const gender = normalizeText(profile.sensitive.gender);
    const answer = (gender === "man" || gender === "male") ? "Yes" : "No";
    return planned(field, "genderIdentityMan", answer, "profile.gender", true);
  }
  if (/hispanic|latinx/.test(label)) {
    const memory = answerFromMemory("hispanic_latinx", answers);
    const ethnicity = normalizeText(profile.sensitive.ethnicity || "");
    const isHispanic = memory?.answer === "Yes" || /hispanic|latinx/.test(ethnicity);
    return planned(field, "hispanicLatinx", isHispanic ? "Yes" : "No", "profile.ethnicity", true);
  }
  if (/member of the .*community|identify as lgbtq|lgbtq\+|transgender/.test(label)) {
    return planned(field, "lgbtq", profile.sensitive.lgbtq, "profile.lgbtq", true);
  }
  if (/gender|sex\b/.test(label)) return planned(field, "gender", profile.sensitive.gender, "profile.gender", true);
  if (/ethnic|race/.test(label)) return planned(field, "ethnicity", profile.sensitive.ethnicity, "profile.ethnicity", true);
  if (/veteran|military/.test(label)) return planned(field, "veteran", profile.sensitive.veteran, "profile.veteran", true);
  if (/disab/.test(label)) return planned(field, "disability", profile.sensitive.disability, "profile.disability", true);

  if (/prohibited possessor questionnaire|acknowledgment of receipt and review/.test(label)) {
    const memory = answerFromMemory("prohibited_possessor_questionnaire_acknowledgement", answers);
    return memory ? { ...manual(field, ""), ...memory, key: "prohibitedPossessorQuestionnaireAcknowledgement" } : manual(field, "missing_answers.prohibited_possessor_questionnaire_acknowledgement");
  }

  if (/certif|truthful|true and correct|accurate/.test(label)) {
    const memory = answerFromMemory("certify_truthful_application", answers);
    return memory ? { ...manual(field, ""), ...memory, key: "certifyTruthfulApplication" } : manual(field, "missing_answers.certify_truthful_application");
  }

  if (/demographic data.*consent|consent.*demographic data/.test(label)) {
    const memory = answerFromMemory("demographic_data_consent", answers);
    return memory ? { ...manual(field, ""), ...memory, key: "demographicDataConsent" } : manual(field, "missing_answers.demographic_data_consent");
  }

  if (/recruitment privacy policy|privacy policy/.test(label)) {
    const memory = answerFromMemory("recruitment_privacy_policy_acknowledgement", answers);
    return memory ? { ...manual(field, ""), ...memory, key: "recruitmentPrivacyPolicyAcknowledgement" } : manual(field, "missing_answers.recruitment_privacy_policy_acknowledgement");
  }

  if (/retain my data|future opportunities/.test(label)) {
    const memory = answerFromMemory("retention_consent", answers);
    return memory ? { ...manual(field, ""), ...memory, key: "retentionConsent" } : manual(field, "missing_answers.retention_consent");
  }

  if (/salary|compensation|total comp|desired pay|expected pay/.test(label)) {
    const memory = answerFromMemory("desired_total_compensation", answers);
    return memory ? { ...manual(field, ""), ...memory, key: "desiredTotalCompensation" } : manual(field, "missing_answers.desired_total_compensation");
  }

  if (/background check|criminal|terms|privacy/.test(label)) {
    return manual(field, "sensitive_or_legal_question_needs_manual_review");
  }

  return manual(field, field.required ? "unknown_required_field" : "unknown_optional_field");
}

function createAnswerPlan(schema, profile, answers) {
  const decisions = schema.fields.map((field) => classifyField(field, profile, answers, schema));
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
};
