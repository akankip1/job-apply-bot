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

  // File inputs need special handling because many ATSs expose optional cover
  // letters exactly like resume uploads. Only resume/CV fields get the resume.
  if (field.type === "file" && /cover letter/.test(fieldKey)) {
    return manual(field, field.required ? "cover_letter_needs_manual_review" : "cover_letter_optional");
  }

  if (field.type === "file" || /resume|cv/.test(fieldKey)) {
    return planned(field, "resume", profile.standard.resumePath, "profile.resumePath");
  }

  // Prefer stable ATS ids before fuzzy label matching. This prevents long
  // question text from accidentally matching a generic word like "country".
  const exactId = {
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

  if (/^first name\b|given name/.test(label)) return planned(field, "firstName", profile.standard.firstName, "profile.firstName");
  if (/^last name\b|family name|surname/.test(label)) return planned(field, "lastName", profile.standard.lastName, "profile.lastName");
  if (/preferred first name|preferred name|nickname/.test(label)) return planned(field, "preferredName", profile.standard.preferredName, "profile.preferredName");
  if (/^email\b|email address/.test(label)) return planned(field, "email", profile.standard.email, "profile.email");
  if (/^phone\b|phone number|mobile/.test(label)) return planned(field, "phone", profile.standard.phone, "profile.phone");
  if (/location city|\bcity\b/.test(label)) {
    const cityState = [profile.standard.city, profile.standard.state].filter(Boolean).join(", ");
    return planned(field, "locationCity", firstNonEmpty(cityState, profile.standard.city), "profile.location");
  }
  if (/linkedin|linked in/.test(label)) return planned(field, "linkedIn", profile.standard.linkedIn, "profile.linkedIn");
  if (/github|git hub/.test(label)) return planned(field, "github", profile.standard.github, "profile.github");
  if (/website|portfolio|personal site/.test(label)) return planned(field, "portfolio", profile.standard.portfolio, "profile.portfolio");

  if (/how did you hear|source/.test(label)) {
    const memory = answerFromMemory("how_did_you_hear", answers);
    return memory ? { ...manual(field, ""), ...memory, key: "howDidYouHear" } : manual(field, "missing_answers.how_did_you_hear");
  }

  if (/previously employed|ever been employed|currently employed by|applied to/.test(label)) {
    const memory = answerFromMemory("previously_employed_by_company", answers);
    return memory ? { ...manual(field, ""), ...memory, key: "previousEmployment" } : manual(field, "missing_answers.previously_employed_by_company");
  }

  if (/hybrid|relocat|office locations|work model|comfortable with this policy/.test(label)) {
    const memory = answerFromMemory("comfortable_with_hybrid_or_relocation", answers);
    return memory ? { ...manual(field, ""), ...memory, key: "hybridRelocation" } : manual(field, "missing_answers.comfortable_with_hybrid_or_relocation");
  }

  if (/(authorized|eligible).*work/.test(label)) {
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
  if (/gender|sex/.test(label)) return planned(field, "gender", profile.sensitive.gender, "profile.gender", true);
  if (/ethnic|race/.test(label)) return planned(field, "ethnicity", profile.sensitive.ethnicity, "profile.ethnicity", true);
  if (/veteran|military/.test(label)) return planned(field, "veteran", profile.sensitive.veteran, "profile.veteran", true);
  if (/disab/.test(label)) return planned(field, "disability", profile.sensitive.disability, "profile.disability", true);
  if (/lgbtq|sexual orientation/.test(label)) return planned(field, "lgbtq", profile.sensitive.lgbtq, "profile.lgbtq", true);

  if (/salary|compensation|background check|criminal|certif|truthful|accurate|terms|privacy/.test(label)) {
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
  const resumeDecision = plan.decisions.find((decision) => decision.key === "resume" && decision.safeToFill);
  if (!resumeDecision) return null;
  return fs.existsSync(resumeDecision.answer) ? null : { reason: "resume_file_missing", resumePath: resumeDecision.answer };
}

module.exports = {
  createAnswerPlan,
  validatePlan,
  validateResume,
};
